import type { GatewayUsage } from './types.ts';

const BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: unknown[] }
  | { role: 'tool'; tool_call_id: string; name?: string; content: string };

export type GatewayCall = { model: string; messages: ChatMessage[]; tools: unknown[]; reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' };
export type GatewayResponse = { status: number; durationMs: number; headers: Record<string, string>; body: any; sanitizedBody: unknown };

function sanitize(value: unknown): unknown { if (Array.isArray(value)) return value.map(sanitize); if (!value || typeof value !== 'object') return value; const output: Record<string, unknown> = {}; for (const [key, child] of Object.entries(value)) { const lower = key.toLowerCase(); if (lower.includes('reasoning') && lower !== 'reasoning_tokens') continue; if (lower === 'analysis' || lower === 'thinking' || lower === 'thoughts') continue; output[key] = sanitize(child); } return output; }

export function extractUsage(body: any): GatewayUsage { const usage = body?.usage ?? {}; const details = usage.completion_tokens_details ?? usage.output_tokens_details ?? {}; const inputDetails = usage.prompt_tokens_details ?? usage.input_tokens_details ?? {}; const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0); const output = Number(usage.completion_tokens ?? usage.output_tokens ?? 0); return { inputTokens: Number.isFinite(input) ? input : 0, outputTokens: Number.isFinite(output) ? output : 0, totalTokens: Number(usage.total_tokens ?? input + output) || 0, reasoningTokens: Number(details.reasoning_tokens ?? details.reasoningTokens ?? 0) || 0, cachedInputTokens: Number(inputDetails.cached_tokens ?? inputDetails.cache_read_tokens ?? 0) || 0 }; }
export async function fetchModelInfo(modelId: string): Promise<any | null> { try { const response = await fetch(`${BASE_URL}/models`); if (!response.ok) return null; const body = await response.json() as any; return Array.isArray(body?.data) ? body.data.find((model: any) => model.id === modelId) ?? null : null; } catch { return null; } }
export function estimateCost(modelInfo: any, usage: GatewayUsage): number | null { const input = Number(modelInfo?.pricing?.input); const output = Number(modelInfo?.pricing?.output); if (!Number.isFinite(input) || !Number.isFinite(output)) return null; return usage.inputTokens * input + usage.outputTokens * output; }

export async function callGateway(apiKey: string, call: GatewayCall): Promise<GatewayResponse> {
  const started = performance.now();
  const body: Record<string, unknown> = { model: call.model, messages: call.messages, tools: call.tools, tool_choice: 'auto', stream: false, providerOptions: { gateway: { sort: 'cost' } } };
  if (call.reasoningEffort) body.reasoning = { effort: call.reasoningEffort };
  const response = await fetch(`${BASE_URL}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Cleo Agent Benchmarker' }, body: JSON.stringify(body) });
  const text = await response.text(); let parsed: unknown; try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { rawText: text }; }
  const headers = Object.fromEntries(response.headers.entries());
  return { status: response.status, durationMs: Math.round(performance.now() - started), headers, body: parsed, sanitizedBody: sanitize(parsed) };
}
