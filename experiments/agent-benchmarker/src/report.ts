import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentRunResult } from './agent.ts';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function money(value: number | null): string {
  if (value === null) return 'unavailable';
  if (value === 0) return '$0';
  return `$${value.toFixed(8)}`;
}

function eventMarkdown(run: AgentRunResult): string {
  return run.events.map((entry, index) => [
    `### ${index + 1}. ${entry.phase} / ${entry.type}`,
    '',
    `Time: ${entry.at}`,
    '',
    '```json',
    json(entry.data),
    '```',
  ].join('\n')).join('\n\n');
}

function eventHtml(run: AgentRunResult): string {
  return run.events.map((entry, index) => `
    <details class="event">
      <summary><span>${index + 1}</span> ${escapeHtml(entry.phase)} / ${escapeHtml(entry.type)} <small>${escapeHtml(entry.at)}</small></summary>
      <pre>${escapeHtml(json(entry.data))}</pre>
    </details>`).join('\n');
}

export async function writeRunReport(run: AgentRunResult, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'trace.json'), `${json(run)}\n`);

  const markdown = `# Cleo agent benchmark report

Model: ${run.model}
Preset: ${run.preset}
Scenario: ${run.scenario.title}
Started: ${run.startedAt}
Finished: ${run.finishedAt}

## Result

Protocol: ${run.protocol.passed ? 'PASS' : 'FAIL'}
Estimated Gateway cost: ${money(run.cost.estimatedUsd)}
Input tokens: ${run.usage.inputTokens}
Output tokens: ${run.usage.outputTokens}
Reasoning tokens: ${run.usage.reasoningTokens}
Cached input tokens: ${run.usage.cachedInputTokens}

### Protocol checks

\`\`\`json
${json(run.protocol)}
\`\`\`

## Recommendation

${run.recommendation || '(no recommendation text)'}

## After approval

${run.finalResponse || '(no final response text)'}

## Mocked apply result

\`\`\`text
${typeof (run.applyResult as any)?.preview === 'string' ? (run.applyResult as any).preview : json(run.applyResult)}
\`\`\`

## Loaded skills

${run.skills.map(skill => `### ${skill.name}\n\nPath: \`${skill.path}\`\nSHA-256: \`${skill.sha256}\`\n\n\`\`\`markdown\n${skill.content}\n\`\`\``).join('\n\n')}

## Full observable trace

${eventMarkdown(run)}
`;
  await writeFile(join(outputDir, 'report.md'), markdown);

  const preview = typeof (run.applyResult as any)?.preview === 'string' ? (run.applyResult as any).preview : json(run.applyResult);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cleo agent benchmark · ${escapeHtml(run.preset)}</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#09090b;color:#e4e4e7}body{margin:0;background:radial-gradient(circle at top right,#312e8133,transparent 35%),#09090b}.wrap{max-width:1200px;margin:auto;padding:32px}.hero{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start;border-bottom:1px solid #27272a;padding-bottom:24px}.eyebrow{color:#67e8f9;font-size:12px;text-transform:uppercase;letter-spacing:.12em}.status{padding:8px 12px;border-radius:999px;font-weight:700;background:${run.protocol.passed ? '#064e3b' : '#7f1d1d'}}h1{margin:.35rem 0;font-size:32px}.muted,small{color:#a1a1aa}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:24px 0}.metric,.panel{background:#18181b;border:1px solid #27272a;border-radius:14px;padding:16px}.metric strong{display:block;font-size:20px;margin-top:4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:850px){.grid{grid-template-columns:1fr}}h2{margin-top:32px}pre{white-space:pre-wrap;word-break:break-word;background:#0f0f12;border:1px solid #27272a;border-radius:10px;padding:14px;overflow:auto}.message{white-space:pre-wrap;line-height:1.55}.event{border:1px solid #27272a;border-radius:10px;margin:8px 0;background:#111114}.event summary{cursor:pointer;padding:12px}.event summary span{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#27272a;margin-right:8px}.event pre{border:0;border-top:1px solid #27272a;border-radius:0;margin:0}.skills details{margin:8px 0}.skills summary{cursor:pointer;color:#67e8f9}.preview{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#d4d4d8}.checks li.good{color:#6ee7b7}.checks li.bad{color:#fca5a5}</style>
</head>
<body><main class="wrap">
<section class="hero"><div><div class="eyebrow">Cleo agent benchmark</div><h1>${escapeHtml(run.preset)}</h1><div class="muted">${escapeHtml(run.model)} · ${escapeHtml(run.scenario.title)}</div></div><div class="status">${run.protocol.passed ? 'PASS' : 'FAIL'}</div></section>
<section class="metrics"><div class="metric"><span>Estimated cost</span><strong>${escapeHtml(money(run.cost.estimatedUsd))}</strong></div><div class="metric"><span>Input tokens</span><strong>${run.usage.inputTokens}</strong></div><div class="metric"><span>Output tokens</span><strong>${run.usage.outputTokens}</strong></div><div class="metric"><span>Reasoning tokens</span><strong>${run.usage.reasoningTokens}</strong></div></section>
<div class="grid"><section class="panel"><h2>Recommendation</h2><div class="message">${escapeHtml(run.recommendation || '(none)')}</div></section><section class="panel"><h2>After approval</h2><div class="message">${escapeHtml(run.finalResponse || '(none)')}</div></section></div>
<section class="panel"><h2>Mocked Discord result</h2><div class="preview">${escapeHtml(preview)}</div></section>
<section class="panel"><h2>Protocol</h2><ul class="checks">${Object.entries(run.protocol).filter(([key]) => key !== 'errors').map(([key,value]) => `<li class="${value === true ? 'good' : value === false ? 'bad' : ''}">${escapeHtml(key)}: ${escapeHtml(json(value))}</li>`).join('')}</ul>${run.protocol.errors.length ? `<pre>${escapeHtml(json(run.protocol.errors))}</pre>` : ''}</section>
<section class="panel skills"><h2>Loaded skills</h2>${run.skills.map(skill => `<details><summary>${escapeHtml(skill.name)} · ${escapeHtml(skill.sha256.slice(0,12))}</summary><pre>${escapeHtml(skill.content)}</pre></details>`).join('')}</section>
<h2>Full observable trace</h2>${eventHtml(run)}
</main></body></html>`;
  await writeFile(join(outputDir, 'report.html'), html);
}

export async function writeComparison(runs: AgentRunResult[], outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const summary = runs.map((run, index) => ({
    candidate: String.fromCharCode(65 + index),
    preset: run.preset,
    model: run.model,
    passed: run.protocol.passed,
    estimatedUsd: run.cost.estimatedUsd,
    usage: run.usage,
    recommendation: run.recommendation,
    finalResponse: run.finalResponse,
    preview: (run.applyResult as any)?.preview ?? null,
  }));
  await writeFile(join(outputDir, 'comparison.json'), `${json(summary)}\n`);
  await writeFile(join(outputDir, 'comparison.md'), `# Cleo model comparison\n\n${summary.map(item => `## ${item.candidate}. ${item.preset}\n\nModel: ${item.model}\nProtocol: ${item.passed ? 'PASS' : 'FAIL'}\nEstimated cost: ${money(item.estimatedUsd)}\n\n### Recommendation\n\n${item.recommendation}\n\n### Mock preview\n\n\`\`\`text\n${item.preview ?? '(none)'}\n\`\`\``).join('\n\n')}\n`);

  const cards = summary.map(item => `<article class="card"><div class="candidate">Candidate ${item.candidate}</div><div class="answer">${escapeHtml(item.recommendation)}</div><details><summary>Mocked apply preview</summary><pre>${escapeHtml(item.preview ?? '(none)')}</pre></details><div class="reveal"><strong>${escapeHtml(item.preset)}</strong><span>${escapeHtml(item.model)}</span><span>${item.passed ? 'protocol pass' : 'protocol fail'} · ${escapeHtml(money(item.estimatedUsd))}</span></div></article>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cleo blind model review</title><style>:root{color-scheme:dark;font-family:Inter,system-ui;background:#09090b;color:#e4e4e7}body{margin:0}.wrap{max-width:1100px;margin:auto;padding:32px}h1{margin-bottom:4px}.hint{color:#a1a1aa;margin-bottom:24px}.toolbar{position:sticky;top:0;background:#09090bee;padding:12px 0;backdrop-filter:blur(10px);z-index:3}button{background:#0891b2;color:white;border:0;border-radius:8px;padding:10px 14px;cursor:pointer}.cards{display:grid;gap:16px}.card{background:#18181b;border:1px solid #27272a;border-radius:14px;padding:20px}.candidate{color:#67e8f9;font-weight:700;margin-bottom:12px}.answer{white-space:pre-wrap;line-height:1.55}.card details{margin-top:16px}.card pre{white-space:pre-wrap;background:#0f0f12;border:1px solid #27272a;border-radius:8px;padding:12px}.reveal{display:none;margin-top:16px;padding-top:12px;border-top:1px solid #27272a;gap:6px}.reveal span{display:block;color:#a1a1aa}body.revealed .reveal{display:block}</style></head><body><main class="wrap"><h1>Blind model review</h1><div class="hint">Judge the recommendation before revealing the model name and cost.</div><div class="toolbar"><button onclick="document.body.classList.toggle('revealed')">Reveal / hide identities</button></div><section class="cards">${cards}</section></main></body></html>`;
  await writeFile(join(outputDir, 'blind-review.html'), html);
}
