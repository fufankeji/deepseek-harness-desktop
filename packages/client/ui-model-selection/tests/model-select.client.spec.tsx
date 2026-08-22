// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

// The seat's key domain is model ∪ common; the stub mirrors the real lookup
// chain: package dictionary, then common vocabulary, then the key.
const t: ComponentProps<typeof ModelSelect>['t'] = (key, params) => {
  const template = (zh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'low', name: 'Low' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max' },
  ],
  defaultEffort: 'high',
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning }],
    }],
    failures: [],
    status: 'ready',
    error: null,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ModelSelect reasoning effort', () => {
  it('renders adapter metadata and submits the effort as part of the session selection', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', {
      name: '选择模型，当前 DeepSeek-V4-Flash，思考模式 深度思考',
    })
    fireEvent.click(trigger)
    const rootMenu = screen.getByRole('menu', { name: 'DeepSeek 模型设置' })
    const thinkingRow = screen.getByRole('menuitem', { name: /思考模式/ })
    fireEvent.mouseEnter(thinkingRow)
    expect(rootMenu).toBeTruthy()
    expect(thinkingRow.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu', { name: '思考模式' })).toBeTruthy()
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent))
      .toEqual([
        '关闭思考不启用深度思考',
        '低强度思考减少推理消耗，适合简单任务',
        '深度思考启用深度思考，适合大多数开发任务',
        '最大思考使用最高推理强度，适合复杂任务',
      ])

    fireEvent.click(screen.getByRole('menuitemradio', { name: /最大思考/ }))
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'max',
      })
      expect(trigger.getAttribute('aria-label')).toBe('选择模型，当前 DeepSeek-V4-Flash，思考模式 最大思考')
    })
  })

  it('keeps the side menu selectable while the pointer crosses its visual gutter', () => {
    vi.useFakeTimers()
    render(<ModelSelect
      locked={false}
      available
      directory={createSnapshotStore<ModelDirectoryState>(state())}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型，当前/ }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /模型/ }))
    const sideMenu = screen.getByRole('menu', { name: '模型' })
    const region = screen.getByRole('menu', { name: 'DeepSeek 模型设置' }).parentElement
    expect(region).not.toBeNull()
    fireEvent.mouseLeave(region as HTMLElement)
    fireEvent.mouseEnter(sideMenu)
    act(() => { vi.advanceTimersByTime(300) })
    expect(screen.getByRole('menu', { name: '模型' })).toBeTruthy()
  })

  it('switches to another model and back through the same stable menu path', async () => {
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({ groups }))
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ groups, current: selection }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型，当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Pro' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '选择模型，当前 DeepSeek-V4-Pro' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '选择模型，当前 DeepSeek-V4-Pro' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' }))
    await waitFor(() => {
      expect(screen.getByRole('button', {
        name: '选择模型，当前 DeepSeek-V4-Flash，思考模式 深度思考',
      })).toBeTruthy()
    })
    expect(select).toHaveBeenNthCalledWith(1, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    expect(select).toHaveBeenNthCalledWith(2, { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })

  it('marks the DeepSeek native vision model as the recommended multimodal route', () => {
    const vision = {
      id: 'deepseek-v4-flash-vision-exp',
      name: 'DeepSeek-V4-Flash-Vision-Exp',
    }
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'deepseek-official', model: vision.id },
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
          vision,
        ],
      }],
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    const trigger = screen.getByRole('button', {
      name: /DeepSeek-V4-Flash-Vision-Exp · 支持图片/,
    })
    expect(trigger.textContent).toBe('DeepSeek-V4-Flash-Vision-Exp')
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    const option = screen.getByRole('menuitemradio', {
      name: /DeepSeek-V4-Flash-Vision-Exp.*支持图片/,
    })
    expect(option.getAttribute('aria-checked')).toBe('true')
  })

  it('offers provider default only when the adapter does not configure a model default', () => {
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'provider',
        name: 'Provider',
        models: [{
          id: 'model',
          name: 'Model',
          reasoning: { efforts: [{ id: 'standard', name: 'Standard' }] },
        }],
      }],
      current: { provider: 'provider', model: 'model' },
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', {
      name: '选择模型，当前 Model，推理等级 跟随模型默认',
    }))
    fireEvent.click(screen.getByRole('menuitem', { name: /推理等级/ }))
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent))
      .toEqual(['跟随模型默认', 'Standard'])
  })

  it('prompts for a selection when the current model is no longer advertised', () => {
    const directory = createSnapshotStore(state({
      current: { provider: 'deepseek-official', model: 'removed-model' },
    }))
    const select = vi.fn().mockResolvedValue(true)
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', { name: '选择模型' })
    expect(trigger.textContent).toContain('选择模型')
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem', { name: /推理等级/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.queryByText('removed-model')).toBeNull()
    expect(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })).toBeTruthy()
  })

  it('announces a rejected selection as a transient toast and keeps the in-menu strip for loads', async () => {
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({ groups }))
    const select = vi.fn(async () => {
      directory.set(state({ groups, status: 'error', error: 'model-unavailable: session already contains images' }))
      return false
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }))
    const toast = await screen.findByRole('alert')
    expect(toast.textContent).toContain('模型操作失败：model-unavailable: session already contains images')
    // The selection failure does not render the in-menu load strip (no Retry).
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('renders no Agent-bound control for an addressed subagent session', () => {
    const load = vi.fn()
    render(<ModelSelect
      locked={false}
      available={false}
      directory={createSnapshotStore(state())}
      load={load}
      select={vi.fn().mockResolvedValue(false)}
      t={t}
    />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})
