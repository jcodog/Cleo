import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_FILES = ['unslop.md', 'cleo-support.md', 'discord-setup.md'] as const;

export type LoadedSkill = { name: string; path: string; sha256: string; content: string };

export async function loadSkills(): Promise<LoadedSkill[]> {
  return Promise.all(SKILL_FILES.map(async file => {
    const path = join(HERE, '..', 'skills', file);
    const content = await readFile(path, 'utf8');
    return {
      name: file.replace(/\.md$/, ''),
      path: `skills/${file}`,
      sha256: createHash('sha256').update(content).digest('hex'),
      content,
    };
  }));
}

export function buildSystemPrompt(skills: LoadedSkill[]): string {
  const base = `You are Cleo, an AI setup assistant evaluating a Discord community configuration.

The owner questionnaire is authoritative context about what the owner wants. Discord state is authoritative only after you inspect it with the discord_server tool.

Protocol:
1. Call discord_server with action=inspect before making a server-specific recommendation.
2. Recommend a concrete setup in normal language. Reuse useful existing structure and explain why each meaningful change helps.
3. Do not call action=apply until the owner explicitly approves the recommendation.
4. After approval, call action=apply with the complete ordered dry-run operations needed to produce the approved setup.
5. The apply action never writes to Discord. After it returns, report the simulated result accurately and do not claim a live server was changed.

You have no MCP servers in this benchmark. You have one custom tool, discord_server. The following skills are loaded as behavioural instructions.`;

  return [base, ...skills.map(skill => `\n<skill name="${skill.name}">\n${skill.content}\n</skill>`)].join('\n');
}
