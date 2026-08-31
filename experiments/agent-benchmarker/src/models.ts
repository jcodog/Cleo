export const MODEL_PRESETS = {
  deepseek: 'deepseek/deepseek-v4-flash-0731',
  'deepseek-current': 'deepseek/deepseek-v4-flash',
  luna: 'openai/gpt-5.6-luna',
  'oss-120b': 'openai/gpt-oss-120b',
  'oss-20b': 'openai/gpt-oss-20b',
  nano: 'openai/gpt-5-nano',
} as const;

export type AgentPreset = keyof typeof MODEL_PRESETS;

export function resolveAgents(value: string): AgentPreset[] {
  if (value === 'all') return Object.keys(MODEL_PRESETS) as AgentPreset[];
  if (value in MODEL_PRESETS) return [value as AgentPreset];
  throw new Error(`Unknown agent '${value}'. Use one of: ${Object.keys(MODEL_PRESETS).join(', ')}, all`);
}
