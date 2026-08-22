/** Desktop visual capability inheritance contract across shipped and future presets. */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')

describe('Desktop vision preset inheritance', () => {
  it('keeps the base host tool set unchanged for all four shipped presets', () => {
    const patch = readFileSync(resolve(ROOT, 'packages/bundle/web-app/cordis.patch.yml'), 'utf8')
    expect(patch).toMatch(/- id: tool-skill\n\s+disabled: true/)
    expect(patch).toContain(`- id: attachment-local
  config:
    maxImageBytes: !!js "process.env.DSH_DESKTOP === '1' ? 10485760 : undefined"`)
    for (const preset of ['standard', 'code', 'minimal', 'cordis']) {
      expect(existsSync(resolve(ROOT, 'apps/cli/config/agent-presets', preset))).toBe(true)
    }
  })

  it('mounts the vision Tool, Skill and instructions into every live and future Agent scope', () => {
    const source = readFileSync(resolve(ROOT, 'packages/host/apiproxy/src/vision-enhancement.ts'), 'utf8')
    expect(source).toContain('scope.ctx.skills.register({\n        name: \'vision-enhancement\'')
    expect(source).toContain('scope.ctx.tools.register(visionTool)')
    expect(source).toContain('scope.ctx.systemPrompt.context({')
    expect(source).toContain('const scope = createScope(ctx, agent)')
    expect(source).toContain('ctx.on(\'agent/created\'')
    expect(source).toContain('for (const agent of ctx.agents.list()) mountAgent(agent)')
    expect(source).not.toContain('agent-presets/standard')
    expect(source).not.toContain('agent-presets/minimal')
  })
})
