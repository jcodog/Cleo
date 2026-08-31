import { callGateway, estimateCost, extractUsage, fetchModelInfo, type ChatMessage } from './gateway.ts';
import { DISCORD_SERVER_TOOL, createDiscordToolRuntime } from './discord-tool.ts';
import type { GuildSnapshot, OwnerScenario, TraceEvent } from './types.ts';
import type { LoadedSkill } from './skills.ts';

function now() { return new Date().toISOString(); }
function event(phase: TraceEvent['phase'], type: string, data: unknown): TraceEvent { return { at: now(), phase, type, data }; }

function assistantMessage(raw: any): ChatMessage {
  return {
    role: 'assistant',
    content: typeof raw?.content === 'string' ? raw.content : null,
    ...(Array.isArray(raw?.tool_calls) ? { tool_calls: raw.tool_calls } : {}),
  };
}

function parseToolArgs(toolCall: any): unknown {
  const text = toolCall?.function?.arguments;
  if (typeof text !== 'string') throw new Error('Tool call did not include JSON arguments');
  return JSON.parse(text);
}

function summarizeGatewayHeaders(headers: Record<string, string>) {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.startsWith('x-vercel') || key.startsWith('x-ai') || key === 'server-timing' || key === 'request-id') kept[key] = value;
  }
  return kept;
}

export type AgentRunResult = {
  model: string;
  preset: string;
  scenario: OwnerScenario;
  startedAt: string;
  finishedAt: string;
  skills: LoadedSkill[];
  events: TraceEvent[];
  recommendation: string;
  finalResponse: string;
  protocol: {
    inspected: boolean;
    applied: boolean;
    appliedBeforeApproval: boolean;
    textOnlyStepBeforeInspect: boolean;
    applyAccepted: boolean;
    errors: string[];
    passed: boolean;
  };
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; reasoningTokens: number; cachedInputTokens: number };
  cost: { estimatedUsd: number | null; modelPricing: unknown };
  applyResult: unknown;
};

export async function runAgent(options: {
  preset: string;
  model: string;
  apiKey: string;
  snapshot: GuildSnapshot;
  scenario: OwnerScenario;
  systemPrompt: string;
  skills: LoadedSkill[];
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
}): Promise<AgentRunResult> {
  const startedAt = now();
  const events: TraceEvent[] = [];
  const runtime = createDiscordToolRuntime(options.snapshot);
  const messages: ChatMessage[] = [{ role: 'system', content: options.systemPrompt }];
  let recommendation = '';
  let finalResponse = '';
  let textOnlyStepBeforeInspect = false;
  let appliedBeforeApproval = false;
  const errors: string[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0, cachedInputTokens: 0 };
  let estimatedUsd = 0;
  let hasCostEstimate = true;
  const modelInfo = await fetchModelInfo(options.model);

  events.push(event('setup', 'capabilities', {
    skills: options.skills.map(skill => ({ name: skill.name, path: skill.path, sha256: skill.sha256, content: skill.content })),
    tools: [{ name: 'discord_server', transport: 'custom-tool', mutationMode: 'dry-run-only', schema: DISCORD_SERVER_TOOL.function.parameters }],
    mcpServers: [],
  }));
  events.push(event('setup', 'owner_context', options.scenario.ownerContext));
  events.push(event('setup', 'model_catalog_entry', modelInfo));

  const runPhase = async (phase: 'recommendation' | 'approval', userText: string) => {
    messages.push({ role: 'user', content: userText });
    events.push(event(phase, 'user_message', userText));

    for (let step = 0; step < 10; step++) {
      events.push(event(phase, 'model_request', {
        step,
        model: options.model,
        messages,
        tools: [DISCORD_SERVER_TOOL],
        routing: { sort: 'cost' },
        reasoningEffort: options.reasoningEffort ?? null,
      }));

      const response = await callGateway(options.apiKey, {
        model: options.model,
        messages,
        tools: [DISCORD_SERVER_TOOL],
        reasoningEffort: options.reasoningEffort,
      });
      events.push(event(phase, 'model_response', {
        step,
        status: response.status,
        durationMs: response.durationMs,
        headers: summarizeGatewayHeaders(response.headers),
        body: response.sanitizedBody,
      }));
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`AI Gateway returned HTTP ${response.status}: ${JSON.stringify(response.sanitizedBody)}`);
      }

      const stepUsage = extractUsage(response.body);
      for (const key of Object.keys(usage) as Array<keyof typeof usage>) usage[key] += stepUsage[key];
      const stepCost = estimateCost(modelInfo, stepUsage);
      if (stepCost === null) hasCostEstimate = false; else estimatedUsd += stepCost;

      const choice = response.body?.choices?.[0];
      const rawMessage = choice?.message;
      if (!rawMessage) throw new Error('AI Gateway response had no assistant message');
      const nextAssistant = assistantMessage(rawMessage);
      const toolCalls = Array.isArray(rawMessage.tool_calls) ? rawMessage.tool_calls : [];
      const text = typeof rawMessage.content === 'string' ? rawMessage.content.trim() : '';

      if (!runtime.getState().inspected && text && !toolCalls.some((call: any) => call?.function?.name === 'discord_server' && (() => {
        try { return (parseToolArgs(call) as any)?.action === 'inspect'; } catch { return false; }
      })())) {
        textOnlyStepBeforeInspect = true;
      }

      messages.push(nextAssistant);
      events.push(event(phase, 'assistant_message', { text, toolCalls }));

      if (toolCalls.length === 0) return text;

      for (const toolCall of toolCalls) {
        if (toolCall?.function?.name !== 'discord_server') {
          errors.push(`Unknown tool requested: ${String(toolCall?.function?.name)}`);
          messages.push({ role: 'tool', tool_call_id: String(toolCall?.id ?? 'unknown'), name: String(toolCall?.function?.name ?? 'unknown'), content: JSON.stringify({ error: 'Unknown tool' }) });
          continue;
        }
        let input: any;
        try {
          input = parseToolArgs(toolCall);
          events.push(event(phase, 'tool_request', { tool: 'discord_server', toolCallId: toolCall.id, input }));
          if (phase === 'recommendation' && input?.action === 'apply') appliedBeforeApproval = true;
          const output = runtime.execute(input);
          events.push(event(phase, 'tool_response', { tool: 'discord_server', toolCallId: toolCall.id, success: true, output }));
          messages.push({ role: 'tool', tool_call_id: String(toolCall.id), name: 'discord_server', content: JSON.stringify(output) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(message);
          events.push(event(phase, 'tool_response', { tool: 'discord_server', toolCallId: toolCall.id, success: false, error: message }));
          messages.push({ role: 'tool', tool_call_id: String(toolCall.id), name: 'discord_server', content: JSON.stringify({ success: false, error: message }) });
        }
      }
    }
    throw new Error('Agent exceeded the 10-step safety limit');
  };

  recommendation = await runPhase('recommendation', [
    'Owner questionnaire context:',
    JSON.stringify(options.scenario.ownerContext, null, 2),
    '',
    options.scenario.firstMessage,
  ].join('\n'));

  runtime.grantApproval();
  events.push(event('approval', 'owner_approval_granted', true));
  finalResponse = await runPhase('approval', options.scenario.approvalMessage);

  const state = runtime.getState();
  const protocol = {
    inspected: state.inspected,
    applied: state.applyResult !== null,
    appliedBeforeApproval,
    textOnlyStepBeforeInspect,
    applyAccepted: state.applyResult !== null,
    errors,
    passed: state.inspected && state.applyResult !== null && !appliedBeforeApproval && !textOnlyStepBeforeInspect,
  };

  return {
    model: options.model,
    preset: options.preset,
    scenario: options.scenario,
    startedAt,
    finishedAt: now(),
    skills: options.skills,
    events,
    recommendation,
    finalResponse,
    protocol,
    usage,
    cost: { estimatedUsd: hasCostEstimate ? estimatedUsd : null, modelPricing: modelInfo?.pricing ?? null },
    applyResult: state.applyResult,
  };
}
