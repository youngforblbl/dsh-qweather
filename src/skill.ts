/**
 * 内置 qweather 技能：教模型何时用 qweather_weather / qweather_card，
 * 形状对齐官方 dsh-skill-badge 的内置技能 provider（bundled candidate）。
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const PROVIDER_NAME = 'dsh-qweather'
const SKILL_BODY_URL = new URL('../assets/qweather-skill.md', import.meta.url)
const RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('../assets/', import.meta.url)),
} as const
const INVOCATION = { modelInvocable: true, userInvocable: true } as const
const DESCRIPTION =
  '和风天气插件使用说明：qweather_weather（查天气数据回答问题）与 qweather_card（把天气画成对话内卡片）的参数、时间区间与信息类别。'

const CANDIDATE: SkillCandidate = {
  name: 'qweather',
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_BODY_URL,
}

/** 注册到 ctx.skills 的 provider。 */
export const qweatherSkillProvider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get(_candidate): Promise<SkillDefinition> {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: CANDIDATE.provider,
      source: CANDIDATE.source,
      resourceBase: RESOURCE_BASE,
      content: await readFile(SKILL_BODY_URL, 'utf8'),
    }
  },
}
