import type { DiscordOperation, GuildSnapshot, ToolInput } from './types.ts';

const ALLOWED_CHANNEL_TYPES = new Set(['text', 'voice', 'announcement', 'forum']);
const ALLOWED_PERMISSION_NAMES = new Set([
  'VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'CONNECT', 'SPEAK', 'STREAM',
  'USE_VAD', 'MANAGE_MESSAGES', 'MENTION_EVERYONE', 'EMBED_LINKS', 'ATTACH_FILES',
]);

export const DISCORD_SERVER_TOOL = {
  type: 'function',
  function: {
    name: 'discord_server',
    description: [
      'Inspect the captured Discord guild or simulate an approved configuration change.',
      'Call action=inspect before making any server-specific recommendation.',
      'Call action=apply only after the owner explicitly approves the recommendation.',
      'Apply is a dry-run simulator in this benchmark. It never writes to Discord.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['inspect', 'apply'], description: 'Inspect the current server or simulate the approved plan.' },
        summary: { type: 'string', description: 'Short owner-facing summary of the approved change. Required for apply.' },
        operations: {
          type: 'array',
          description: 'Ordered dry-run operations. Required for apply.',
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['create_category', 'create_channel', 'update_channel', 'delete_channel', 'create_role', 'update_role'] },
              reason: { type: 'string' },
              tempId: { type: 'string', description: 'Stable local ID for a newly created category, channel, or role, e.g. new:creator-team.' },
              targetId: { type: 'string', description: 'Existing Discord ID or a tempId created by an earlier operation.' },
              name: { type: 'string' },
              channelType: { type: 'string', enum: ['text', 'voice', 'announcement', 'forum'] },
              parentId: { type: ['string', 'null'] }, topic: { type: ['string', 'null'] }, position: { type: 'integer', minimum: 0 },
              userLimit: { type: ['integer', 'null'], minimum: 0, maximum: 99 }, bitrate: { type: ['integer', 'null'], minimum: 8000 },
              permissions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { targetId: { type: 'string' }, targetType: { type: 'string', enum: ['role', 'member'] }, allow: { type: 'array', items: { type: 'string' } }, deny: { type: 'array', items: { type: 'string' } } }, required: ['targetId', 'targetType'] } },
              color: { type: 'integer', minimum: 0, maximum: 16777215 },
            },
            required: ['kind', 'reason'],
          },
        },
      },
      required: ['action'],
    },
  },
} as const;

type MutableChannel = { id: string; name: string; type: string; parentId: string | null; topic: string | null; position: number; userLimit: number | null; bitrate: number | null; permissions: NonNullable<DiscordOperation['permissions']> };
type MutableRole = { id: string; name: string; position: number; color: number };
type SimState = { channels: MutableChannel[]; roles: MutableRole[]; created: Set<string> };

function requireString(value: unknown, label: string): string { if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`); return value.trim(); }
function channelTypeFromSnapshot(typeName: string): string { if (typeName === 'category') return 'category'; if (typeName === 'voice' || typeName === 'stage') return 'voice'; if (typeName === 'announcement') return 'announcement'; if (typeName === 'forum' || typeName === 'media') return 'forum'; return 'text'; }
function createState(snapshot: GuildSnapshot): SimState { return { channels: snapshot.channels.map(channel => ({ id: channel.id, name: channel.name, type: channelTypeFromSnapshot(channel.typeName), parentId: channel.parentId, topic: channel.topic, position: channel.position, userLimit: channel.userLimit, bitrate: channel.bitrate, permissions: channel.permissionOverwrites.map(overwrite => ({ targetId: overwrite.id, targetType: overwrite.targetType, allow: overwrite.allow, deny: overwrite.deny })) })), roles: snapshot.roles.map(role => ({ id: role.id, name: role.name, position: role.position, color: role.color })), created: new Set() }; }
function resolveTarget(state: SimState, id: string): boolean { return state.channels.some(channel => channel.id === id) || state.roles.some(role => role.id === id) || state.created.has(id); }
function validatePermissions(state: SimState, operation: DiscordOperation): void { for (const overwrite of operation.permissions ?? []) { if (!resolveTarget(state, overwrite.targetId)) throw new Error(`Unknown permission target '${overwrite.targetId}'`); for (const permission of [...(overwrite.allow ?? []), ...(overwrite.deny ?? [])]) if (!ALLOWED_PERMISSION_NAMES.has(permission)) throw new Error(`Unsupported permission '${permission}' in dry-run schema`); } }
function describeOperation(operation: DiscordOperation): string { const reason = operation.reason.trim(); switch (operation.kind) { case 'create_category': return `+ category ${operation.name} — ${reason}`; case 'create_channel': return `+ ${operation.channelType ?? 'channel'} ${operation.name} — ${reason}`; case 'update_channel': return `~ channel ${operation.targetId}${operation.name ? ` → ${operation.name}` : ''} — ${reason}`; case 'delete_channel': return `- channel ${operation.targetId} — ${reason}`; case 'create_role': return `+ role ${operation.name} — ${reason}`; case 'update_role': return `~ role ${operation.targetId}${operation.name ? ` → ${operation.name}` : ''} — ${reason}`; } }

function applyOperation(state: SimState, operation: DiscordOperation): void {
  requireString(operation.reason, 'operation.reason'); validatePermissions(state, operation);
  if (operation.kind === 'create_category') { const id = requireString(operation.tempId, 'tempId'); const name = requireString(operation.name, 'name'); if (resolveTarget(state, id)) throw new Error(`Duplicate tempId '${id}'`); state.created.add(id); state.channels.push({ id, name, type: 'category', parentId: null, topic: null, position: operation.position ?? 0, userLimit: null, bitrate: null, permissions: operation.permissions ?? [] }); return; }
  if (operation.kind === 'create_channel') { const id = requireString(operation.tempId, 'tempId'); const name = requireString(operation.name, 'name'); const type = requireString(operation.channelType, 'channelType'); if (!ALLOWED_CHANNEL_TYPES.has(type)) throw new Error(`Unsupported channelType '${type}'`); if (resolveTarget(state, id)) throw new Error(`Duplicate tempId '${id}'`); if (operation.parentId && !state.channels.some(channel => channel.id === operation.parentId && channel.type === 'category')) throw new Error(`Unknown category parent '${operation.parentId}'`); state.created.add(id); state.channels.push({ id, name, type, parentId: operation.parentId ?? null, topic: operation.topic ?? null, position: operation.position ?? 0, userLimit: operation.userLimit ?? null, bitrate: operation.bitrate ?? null, permissions: operation.permissions ?? [] }); return; }
  if (operation.kind === 'update_channel') { const targetId = requireString(operation.targetId, 'targetId'); const channel = state.channels.find(item => item.id === targetId); if (!channel) throw new Error(`Unknown channel '${targetId}'`); if (operation.name) channel.name = operation.name; if (operation.parentId !== undefined) { if (operation.parentId && !state.channels.some(item => item.id === operation.parentId && item.type === 'category')) throw new Error(`Unknown category parent '${operation.parentId}'`); channel.parentId = operation.parentId; } if (operation.topic !== undefined) channel.topic = operation.topic; if (operation.position !== undefined) channel.position = operation.position; if (operation.userLimit !== undefined) channel.userLimit = operation.userLimit; if (operation.bitrate !== undefined) channel.bitrate = operation.bitrate; if (operation.permissions) channel.permissions = operation.permissions; return; }
  if (operation.kind === 'delete_channel') { const targetId = requireString(operation.targetId, 'targetId'); const index = state.channels.findIndex(item => item.id === targetId); if (index < 0) throw new Error(`Unknown channel '${targetId}'`); state.channels.splice(index, 1); for (const child of state.channels) if (child.parentId === targetId) child.parentId = null; return; }
  if (operation.kind === 'create_role') { const id = requireString(operation.tempId, 'tempId'); const name = requireString(operation.name, 'name'); if (resolveTarget(state, id)) throw new Error(`Duplicate tempId '${id}'`); state.created.add(id); state.roles.push({ id, name, position: operation.position ?? 0, color: operation.color ?? 0 }); return; }
  const targetId = requireString(operation.targetId, 'targetId'); const role = state.roles.find(item => item.id === targetId); if (!role) throw new Error(`Unknown role '${targetId}'`); if (operation.name) role.name = operation.name; if (operation.position !== undefined) role.position = operation.position; if (operation.color !== undefined) role.color = operation.color;
}

function visibilityLabel(channel: MutableChannel, state: SimState): string { const everyone = state.roles.find(role => role.name === '@everyone'); if (!everyone) return ''; const everyoneOverwrite = channel.permissions.find(item => item.targetType === 'role' && item.targetId === everyone.id); if (!everyoneOverwrite?.deny?.includes('VIEW_CHANNEL')) return ''; const allowed = channel.permissions.filter(item => item.targetType === 'role' && item.allow?.includes('VIEW_CHANNEL')).map(item => state.roles.find(role => role.id === item.targetId)?.name ?? item.targetId); return allowed.length ? ` [private: ${allowed.join(', ')}]` : ' [private]'; }
function renderLayout(state: SimState): string[] { const categories = state.channels.filter(channel => channel.type === 'category').sort((a,b) => a.position - b.position); const lines: string[] = []; const uncategorized = state.channels.filter(channel => channel.type !== 'category' && !channel.parentId).sort((a,b) => a.position - b.position); for (const channel of uncategorized) lines.push(`• ${channel.type === 'voice' ? '🔊' : '#'} ${channel.name}${visibilityLabel(channel,state)}`); for (const category of categories) { lines.push(`▾ ${category.name}`); const children = state.channels.filter(channel => channel.parentId === category.id).sort((a,b) => a.position - b.position); for (const channel of children) lines.push(`  ${channel.type === 'voice' ? '🔊' : '#'} ${channel.name}${visibilityLabel(channel,state)}`); } return lines; }

export function simulateApply(snapshot: GuildSnapshot, summary: string, operations: DiscordOperation[]) { if (!summary.trim()) throw new Error('summary is required for apply'); if (!Array.isArray(operations) || operations.length === 0) throw new Error('At least one operation is required for apply'); const state = createState(snapshot); for (const operation of operations) applyOperation(state, operation); const changeLines = operations.map(describeOperation); const preview = ['Cleo server setup preview','',summary.trim(),'',`Proposed changes: ${operations.length}`,...changeLines,'','Resulting layout',...renderLayout(state)].join('\n'); return { dryRun: true, applied: false, summary: summary.trim(), operations, changeLines, layout: renderLayout(state), preview }; }
export function createDiscordToolRuntime(snapshot: GuildSnapshot) { let approvalGranted = false; let inspected = false; let applyResult: ReturnType<typeof simulateApply> | null = null; return { grantApproval() { approvalGranted = true; }, getState() { return { approvalGranted, inspected, applyResult }; }, execute(input: ToolInput) { if (!input || (input.action !== 'inspect' && input.action !== 'apply')) throw new Error('discord_server.action must be inspect or apply'); if (input.action === 'inspect') { inspected = true; return { mode: 'read-only-captured-fixture', snapshot }; } if (!approvalGranted) throw new Error('Owner approval has not been granted. Do not apply changes yet.'); if (!inspected) throw new Error('The server must be inspected before applying changes.'); applyResult = simulateApply(snapshot, input.summary ?? '', input.operations ?? []); return applyResult; } }; }
