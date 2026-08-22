/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SidebarRoot.module.css', () => {
  it('keeps desktop drag and safe-area rules behind the shell marker', () => {
    expect(declarations('.titlebarDragRegion')?.get('display')).toBe('none')
    expect(
      declarations(":global(html[data-dsh-desktop='true']) .titlebarDragRegion")?.get('-webkit-app-region'),
    ).toBe('drag')
    expect(
      declarations(":global(html[data-dsh-desktop='true']) .root")?.get('padding-top'),
    ).toBe('calc(6px + var(--dsh-desktop-titlebar-inset, 40px))')
    expect(
      declarations(":global(html[data-dsh-desktop='true']) .root button")?.get('-webkit-app-region'),
    ).toBe('no-drag')
  })

  it('admits native material only on supported desktop platforms', () => {
    expect(
      declarations(":global(html[data-dsh-desktop-platform='darwin']) .root")?.get('background'),
    ).toBe('transparent')
    expect(
      declarations(":global(html[data-dsh-desktop-platform='win32']) .root")?.get('background'),
    ).toBe('transparent')
    expect(css).not.toContain("data-dsh-desktop-platform='linux']) .root")
  })

  it('keeps Windows sidebar controls at their Web offsets without a drag strip', () => {
    const expanded = declarations(":global(html[data-dsh-desktop-platform='win32']) .root")
    const collapsed = declarations(":global(html[data-dsh-desktop-platform='win32']) .root.collapsed")
    expect(expanded?.get('padding-top')).toBe('6px')
    expect(collapsed?.get('padding-top')).toBe('18px')
    expect(
      declarations(":global(html[data-dsh-desktop-platform='win32']) .titlebarDragRegion")
        ?.get('display'),
    ).toBe('none')
  })

  it('places macOS sidebar content directly below the traffic lights', () => {
    const expanded = declarations(":global(html[data-dsh-desktop-platform='darwin']) .root")
    const collapsed = declarations(":global(html[data-dsh-desktop-platform='darwin']) .root.collapsed")
    expect(expanded?.get('--dsh-sidebar-collapsed-width')).toBe('90px')
    expect(expanded?.get('--dsh-sidebar-rail-inline-padding')).toBe('27px')
    expect(expanded?.get('padding-top')).toBe('32px')
    expect(collapsed?.get('padding-top')).toBe('48px')
    expect(
      declarations(":global(html[data-dsh-desktop-platform='darwin']) .titlebarDragRegion")
        ?.get('height'),
    ).toBe('32px')
  })

  it('keeps every shell control keyboard-visible', () => {
    for (const selector of ['.brand:focus-visible', '.iconButton:focus-visible', '.newSession:focus-visible']) {
      expect(declarations(selector)?.get('outline')).toBe(
        '2px solid var(--dsw-alias-state-business-primary)',
      )
    }
  })

  it('stacks every footer-action occupant above Settings', () => {
    const actionRules = [...css.matchAll(/\.footerActions\s*\{([^{}]*)\}/g)]
      .map(([, body = '']) => body.replace(/\s+/g, ' '))
    expect(actionRules).toContainEqual(expect.stringMatching(
      /display:\s*flex;.*flex-direction:\s*column;.*gap:\s*2px;/,
    ))
  })

  it('shares and cancels the wide shell trailing padding structurally', () => {
    const root = declarations('.root')
    expect(root?.get('--dsh-sidebar-inline-padding')).toBe('12px')
    expect(root?.get('padding')).toBe('6px var(--dsh-sidebar-inline-padding)')
    expect(declarations('.regionArea')?.get('margin-left')).toBe('-4px')
    expect(declarations('.regionArea')?.get('padding-left')).toBe('4px')
    expect(declarations('.regionArea')?.get('margin-right')).toBe(
      'calc(-1 * var(--dsh-sidebar-inline-padding))',
    )
    expect(declarations('.collapsed .regionArea')?.get('margin-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('padding-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('margin-right')).toBe('0')
  })

  it('moves the four upper controls while the settings seat only fades', () => {
    const animation = 'rail-in 150ms var(--ds-ease-in-out) backwards'
    for (const selector of [
      '.railIn .iconButton',
      '.railIn .newSession',
      '.railIn .regionArea',
    ]) {
      expect(declarations(selector)?.get('animation')).toBe(animation)
    }
    expect(declarations('.railIn .footArea')?.get('animation')).toBe(
      'rail-fade-in 150ms var(--ds-ease-in-out) backwards',
    )
    const railTranslation = [
      '@keyframes rail-in',
      'from',
      'opacity: 0;',
      'var(--dsh-sidebar-collapsed-width) - var(--dsh-sidebar-rail-inline-padding) + 3px',
    ]
    for (const text of railTranslation) expect(css).toContain(text)
    expect(css).toMatch(/@keyframes rail-fade-in\s*\{\s*from\s*\{\s*opacity: 0;\s*}\s*}/)
  })

  it('gives shell rail controls the same base anchor for their shared translation', () => {
    expect(declarations('.logoRow')?.get('height')).toBe('60px')
    expect(declarations('.root')?.get('--dsh-sidebar-rail-inline-padding')).toBe('10px')
    expect(declarations('.root.collapsed')?.get('padding')).toBe(
      '18px var(--dsh-sidebar-rail-inline-padding) 6px',
    )
    expect(declarations('.collapsed .logoRow')?.get('justify-content')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('align-self')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('width')).toBe('36px')
  })

  it('keeps the slotted brand row at the full artwork height', () => {
    expect(declarations('.brandIdentity')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('line-height')).toBe('24px')
    expect(declarations('.brandName')?.get('font-size')).toBe('18px')
    expect(declarations('.fallbackBrandName')?.get('font-size')).toBe('17px')
    expect(declarations('.fallbackBrandName')?.get('white-space')).toBe('nowrap')
  })
})
