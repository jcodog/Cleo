import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePermissions } from '../src/permissions.ts';
import { loadGuildSnapshot } from '../src/snapshot.ts';
import { createDiscordToolRuntime, simulateApply } from '../src/discord-tool.ts';
import { loadSkills, buildSystemPrompt } from '../src/skills.ts';
import { writeRunReport } from '../src/report.ts';
import type { AgentRunResult } from '../src/agent.ts';

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'cleo-bench-'));
  const raw = join(dir, 'raw');
  await mkdir(raw);
  const guildId = '100';
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ capturedAt: '2026-08-31T20:00:00.000Z' }));
  await writeFile(join(raw, 'guild.json'), JSON.stringify({
    id: guildId,
    name: 'Creator Hub',
    owner_id: '200',
    description: 'Gaming creator community',
    approximate_member_count: 8432,
    approximate_presence_count: 1044,
    features: ['COMMUNITY'],
    verification_level: 2,
    explicit_content_filter: 2,
    default_message_notifications: 1,
    premium_tier: 2,
    system_channel_id: '301',
    rules_channel_id: '302',
    public_updates_channel_id: '303'
  }));
  await writeFile(join(raw, 'roles.json'), JSON.stringify([
    { id: guildId, name: '@everyone', position: 0, managed: false, color: 0, permissions: String((1n << 10n) | (1n << 11n) | (1n << 20n) | (1n << 21n)) },
    { id: '400', name: 'Streamer', position: 5, managed: false, color: 1234, permissions: String(1n << 10n) },
    { id: '401', name: 'Cleo', position: 10, managed: true, color: 0, permissions: String((1n << 3n) | (1n << 4n) | (1n << 5n) | (1n << 28n)) }
  ]));
  await writeFile(join(raw, 'role-member-counts.json'), JSON.stringify({ '400': 8, '401': 1 }));
  await writeFile(join(raw, 'channels.json'), JSON.stringify([
    { id: '300', name: 'General', type: 4, position: 0, parent_id: null, permission_overwrites: [] },
    { id: '301', name: 'general', type: 0, position: 0, parent_id: '300', topic: 'Talk here', permission_overwrites: [] },
    { id: '304', name: 'General', type: 2, position: 1, parent_id: '300', bitrate: 64000, user_limit: 0, permission_overwrites: [] }
  ]));
  await writeFile(join(raw, 'bot-user.json'), JSON.stringify({ id: '500', username: 'Cleo' }));
  await writeFile(join(raw, 'bot-member.json'), JSON.stringify({ roles: ['401'] }));
  for (const name of ['onboarding','welcome-screen','automod','scheduled-events','active-threads','integrations','invites']) {
    await writeFile(join(raw, `${name}.json`), JSON.stringify(name === 'automod' ? [] : {}));
  }
  return dir;
}

test('decodes Discord permission bitfields', () => {
  const names = decodePermissions(String((1n << 3n) | (1n << 4n) | (1n << 28n)));
  assert.deepEqual(names, ['ADMINISTRATOR', 'MANAGE_CHANNELS', 'MANAGE_ROLES']);
});

test('normalizes real-shaped guild, channel, role, and count data', async () => {
  const snapshot = await loadGuildSnapshot(await makeFixture());
  assert.equal(snapshot.guild.name, 'Creator Hub');
  assert.equal(snapshot.guild.memberCount, 8432);
  assert.equal(snapshot.channels.find(channel => channel.id === '304')?.bitrate, 64000);
  assert.equal(snapshot.roles.find(role => role.id === '400')?.memberCount, 8);
});

test('computes bot guild capabilities from @everyone plus bot roles', async () => {
  const snapshot = await loadGuildSnapshot(await makeFixture());
  assert.equal(snapshot.bot.administrator, true);
  assert.equal(snapshot.bot.canManageChannels, true);
  assert.equal(snapshot.bot.canManageRoles, true);
  assert.equal(snapshot.bot.completeChannelVisibilityGuaranteed, true);
});

test('inspect returns the frozen snapshot without mutating it', async () => {
  const snapshot = await loadGuildSnapshot(await makeFixture());
  const runtime = createDiscordToolRuntime(snapshot);
  const result: any = runtime.execute({ action: 'inspect' });
  assert.equal(result.mode, 'read-only-captured-fixture');
  assert.equal(result.snapshot.guild.id, '100');
  assert.equal(runtime.getState().inspected, true);
});

test('apply is rejected before explicit owner approval', async () => {
  const snapshot = await loadGuildSnapshot(await makeFixture());
  const runtime = createDiscordToolRuntime(snapshot);
  runtime.execute({ action: 'inspect' });
  assert.throws(() => runtime.execute({ action: 'apply', summary: 'test', operations: [{ kind: 'create_category', tempId: 'new:test', name: 'Test', reason: 'test' }] }), /approval/i);
});

test('approved apply accepts temp category references and renders a private streamer area', async () => {
  const snapshot = await loadGuildSnapshot(await makeFixture());
  const runtime = createDiscordToolRuntime(snapshot);
  runtime.execute({ action: 'inspect' });
  runtime.grantApproval();
  const result: any = runtime.execute({
    action: 'apply',
    summary: 'Add a private creator team area.',
    operations: [
      { kind: 'create_category', tempId: 'new:creator-team', name: 'Creator Team', reason: 'Keep team-only channels together.' },
      {
        kind: 'create_channel', tempId: 'new:streamer-chat', name: 'streamer-chat', channelType: 'text', parentId: 'new:creator-team', reason: 'Give the streamer team a private text room.',
        permissions: [
          { targetId: '100', targetType: 'role', deny: ['VIEW_CHANNEL'] },
          { targetId: '400', targetType: 'role', allow: ['VIEW_CHANNEL','SEND_MESSAGES','READ_MESSAGE_HISTORY'] }
        ]
      }
    ]
  });
  assert.equal(result.dryRun, true);
  assert.match(result.preview, /Creator Team/);
  assert.match(result.preview, /private: Streamer/);
});

test('simulation rejects unknown permission targets instead of inventing roles', async () => {
  const snapshot = await loadGuildSnapshot(await makeFixture());
  assert.throws(() => simulateApply(snapshot, 'Bad plan', [{
    kind: 'create_channel', tempId: 'new:hidden', name: 'hidden', channelType: 'text', reason: 'test',
    permissions: [{ targetId: 'not-a-role', targetType: 'role', allow: ['VIEW_CHANNEL'] }]
  }]), /Unknown permission target/);
});

test('skills load deterministically and system prompt declares one tool and no MCP', async () => {
  const skills = await loadSkills();
  assert.deepEqual(skills.map(skill => skill.name), ['unslop','cleo-support','discord-setup']);
  const system = buildSystemPrompt(skills);
  assert.match(system, /one custom tool, discord_server/i);
  assert.match(system, /no MCP servers/i);
  assert.match(system, /Unslop/);
});

test('report writer preserves the observable trace and mocked preview', async () => {
  const skills = await loadSkills();
  const out = await mkdtemp(join(tmpdir(), 'cleo-report-'));
  const run: AgentRunResult = {
    model: 'test/model', preset: 'test', startedAt: 'a', finishedAt: 'b', skills,
    scenario: { id: 's', title: 'Scenario', ownerContext: {}, firstMessage: 'inspect', approvalMessage: 'apply' },
    events: [{ at: 'a', phase: 'recommendation', type: 'tool_request', data: { tool: 'discord_server', input: { action: 'inspect' } } }],
    recommendation: 'Keep general and add clips.', finalResponse: 'The dry run was accepted.',
    protocol: { inspected: true, applied: true, appliedBeforeApproval: false, textOnlyStepBeforeInspect: false, applyAccepted: true, errors: [], passed: true },
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, reasoningTokens: 0, cachedInputTokens: 0 },
    cost: { estimatedUsd: 0.0001, modelPricing: { input: '0.1' } },
    applyResult: { preview: 'Cleo server setup preview\n+ #clips' }
  };
  await writeRunReport(run, out);
  const html = await readFile(join(out, 'report.html'), 'utf8');
  const trace = await readFile(join(out, 'trace.json'), 'utf8');
  assert.match(html, /Keep general and add clips/);
  assert.match(html, /Cleo server setup preview/);
  assert.match(trace, /tool_request/);
});
