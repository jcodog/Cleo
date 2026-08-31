import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_PRESETS, resolveAgents } from './models.ts';
import { loadGuildSnapshot } from './snapshot.ts';
import { loadSkills, buildSystemPrompt } from './skills.ts';
import { runAgent, type AgentRunResult } from './agent.ts';
import { writeComparison, writeRunReport } from './report.ts';
import type { OwnerScenario } from './types.ts';

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const [key, inline] = token.slice(2).split('=', 2);
    if (inline !== undefined) values.set(key, inline);
    else if (argv[index + 1] && !argv[index + 1]!.startsWith('--')) values.set(key, argv[++index]!);
    else values.set(key, 'true');
  }
  return values;
}

function help(): never {
  console.log(`Cleo agent benchmarker\n\nUsage:\n  pnpm run benchmark -- --agent <preset|all> --fixture <path> [--scenario <path>] [--runs 1] [--reasoning low]\n\nAgents:\n  ${Object.keys(MODEL_PRESETS).join('\n  ')}\n  all\n\nRequired environment:\n  AI_GATEWAY_API_KEY\n`);
  process.exit(0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has('help') || args.has('h')) help();
  const agentValue = args.get('agent');
  const fixtureValue = args.get('fixture');
  if (!agentValue || !fixtureValue) help();
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is required');
  const agents = resolveAgents(agentValue);
  const runs = Math.max(1, Math.min(20, Number(args.get('runs') ?? '1') || 1));
  const reasoning = (args.get('reasoning') ?? 'low') as 'none' | 'minimal' | 'low' | 'medium' | 'high';
  if (!['none','minimal','low','medium','high'].includes(reasoning)) throw new Error('--reasoning must be none, minimal, low, medium, or high');

  const fixtureDir = resolve(fixtureValue);
  const scenarioPath = resolve(args.get('scenario') ?? fileURLToPath(new URL('../scenarios/creator-community.json', import.meta.url)));
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8')) as OwnerScenario;
  const snapshot = await loadGuildSnapshot(fixtureDir);
  const skills = await loadSkills();
  const systemPrompt = buildSystemPrompt(skills);
  const sessionDir = resolve(args.get('output') ?? join('results', `${new Date().toISOString().replaceAll(':','-').replaceAll('.','-')}-${scenario.id}`));
  const completed: AgentRunResult[] = [];

  console.log(`Scenario: ${scenario.title}`);
  console.log(`Guild: ${snapshot.guild.name} (${snapshot.guild.id})`);
  console.log(`Models: ${agents.join(', ')}`);
  console.log(`Runs/model: ${runs}`);
  console.log(`Results: ${sessionDir}`);

  for (const preset of agents) {
    for (let runNumber = 1; runNumber <= runs; runNumber++) {
      const model = MODEL_PRESETS[preset];
      const label = `${preset} run ${runNumber}/${runs}`;
      console.log(`\n[${label}] ${model}`);
      try {
        const result = await runAgent({ preset, model, apiKey, snapshot, scenario, systemPrompt, skills, reasoningEffort: reasoning });
        const runDir = join(sessionDir, preset, `run-${String(runNumber).padStart(2,'0')}`);
        await writeRunReport(result, runDir);
        completed.push(result);
        console.log(`  ${result.protocol.passed ? 'PASS' : 'FAIL'} · ${result.usage.totalTokens} tokens · ${result.cost.estimatedUsd === null ? 'cost unavailable' : `$${result.cost.estimatedUsd.toFixed(8)}`}`);
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(`  ERROR ${message}`);
      }
    }
  }

  if (completed.length > 1) await writeComparison(completed, sessionDir);
  if (completed.length === 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
