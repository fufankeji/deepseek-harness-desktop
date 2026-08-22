/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * Two-level selection per figma 496:26454's MenuDropdown: the root menu is
 * the Model / reasoning row pair (label + current value + a right chevron),
 * each opening a side card on hover, focus, or click — the provider-grouped model list over
 * the shared directory, and the adapter levels. DeepSeek's off/low/high/max ids
 * render as localized thinking modes; other routes keep adapter-owned names.
 * The trigger (313:14108's ToggleButton) shows both values.
 * Data and submission ride the SAME per-session ModelDirectory as the
 * /model popup; exact-model reasoning metadata and the selected effort come
 * from the Host rather than a client-owned vocabulary. A rejected selection
 * announces through the shared transient Toast anchored to the composer
 * card; the in-menu strip with Retry remains the catalog-load surface.
 */
import {
  useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type FocusEvent,
} from 'react'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14,
  IconWarningOutline16, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'

type ModelTranslate = PropsLocale<'model'>['t']

/** Which root row currently owns the visible side card. */
type Submenu = 'model' | 'effort'

/** Grace period for crossing the visual gap between the root and side menus. */
const SUBMENU_LEAVE_DELAY_MS = 240

/** DeepSeek's first-party multimodal route shipped in the Desktop catalog. */
const DEEPSEEK_NATIVE_VISION_MODEL = 'deepseek-v4-flash-vision-exp'

/** One dynamic effort row; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
  description?: string
}

function isDeepSeekProvider(id: string, name: string): boolean {
  return id === 'deepseek' || id.startsWith('deepseek-') || name.toLocaleLowerCase() === 'deepseek'
}

function isDeepSeekNativeVision(provider: string, model: string): boolean {
  return provider === 'deepseek-official' && model === DEEPSEEK_NATIVE_VISION_MODEL
}

function deepSeekEffortLabel(id: string, t: ModelTranslate): string | undefined {
  if (id === 'off') return t('deepseek.effort.off')
  if (id === 'low') return t('deepseek.effort.low')
  if (id === 'high') return t('deepseek.effort.high')
  if (id === 'max') return t('deepseek.effort.max')
  return undefined
}

function deepSeekEffortDescription(id: string, t: ModelTranslate): string | undefined {
  if (id === 'off') return t('deepseek.effort.offDescription')
  if (id === 'low') return t('deepseek.effort.lowDescription')
  if (id === 'high') return t('deepseek.effort.highDescription')
  if (id === 'max') return t('deepseek.effort.maxDescription')
  return undefined
}

/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the trigger and, while open, the two-level menu.
 */
export function ModelSelect(
  { locked, available, directory, load, select, t }:
  ModelSelectInjected & { locked: boolean } & PropsLocale<'model'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [submenu, setSubmenu] = useState<Submenu | null>(null)
  // The in-menu error strip serves catalog loads (its Retry re-runs the
  // load); a rejected SELECTION announces through the transient toast
  // instead, so the strip renders only while the latest failure-capable
  // action was a load.
  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout>>()
  const id = useId()

  const choices = useMemo(() => state.groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: {
        provider: group.id,
        model: model.id,
        ...model.reasoning?.defaultEffort === undefined
          ? {}
          : { reasoningEffort: model.reasoning.defaultEffort },
      } satisfies ModelSelection,
    }))), [state.groups])
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const reasoning = currentChoice?.model.reasoning
  const usesDeepSeekThinking = currentChoice !== undefined
    && isDeepSeekProvider(currentChoice.group.id, currentChoice.group.name)
  const currentUsesNativeVision = currentChoice !== undefined
    && isDeepSeekNativeVision(currentChoice.group.id, currentChoice.model.id)
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effectiveEffortInfo = reasoning?.efforts.find(level => level.id === effectiveEffort)
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : usesDeepSeekThinking
        ? deepSeekEffortLabel(effectiveEffort, t) ?? effectiveEffortInfo?.name ?? effectiveEffort
        : effectiveEffortInfo?.name ?? effectiveEffort
  const effortChoices = useMemo<readonly EffortChoice[]>(() => reasoning === undefined
    ? []
    : [
      ...reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
        : [],
      ...reasoning.efforts.map((effort: ModelReasoningEffort) => {
        const description = effort.description
          ?? (usesDeepSeekThinking ? deepSeekEffortDescription(effort.id, t) : undefined)
        return {
          key: `effort:${effort.id}`,
          effort: effort.id,
          label: usesDeepSeekThinking
            ? deepSeekEffortLabel(effort.id, t) ?? effort.name
            : effort.name,
          ...description === undefined ? {} : { description },
        }
      }),
    ], [reasoning, t, usesDeepSeekThinking])
  const busy = state.status === 'selecting'

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  // Mount-time load resolves the trigger label; every open refreshes.
  useEffect(() => {
    if (available) {
      lastActionRef.current = 'load'
      load()
    }
  }, [available, load])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  useEffect(() => () => {
    if (submenuCloseTimer.current !== undefined) clearTimeout(submenuCloseTimer.current)
  }, [])

  if (!available) return null

  const show = (): void => {
    setSubmenu(null)
    setOpen(true)
    reload()
  }

  const close = (restoreFocus = false): void => {
    if (submenuCloseTimer.current !== undefined) {
      clearTimeout(submenuCloseTimer.current)
      submenuCloseTimer.current = undefined
    }
    setOpen(false)
    setSubmenu(null)
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }


  const keepSubmenuOpen = (): void => {
    if (submenuCloseTimer.current === undefined) return
    clearTimeout(submenuCloseTimer.current)
    submenuCloseTimer.current = undefined
  }

  const openSubmenu = (next: Submenu): void => {
    keepSubmenuOpen()
    setSubmenu(next)
  }

  const scheduleSubmenuClose = (): void => {
    keepSubmenuOpen()
    submenuCloseTimer.current = setTimeout(() => {
      submenuCloseTimer.current = undefined
      setSubmenu(null)
    }, SUBMENU_LEAVE_DELAY_MS)
  }

  const moveFocus = (offset: number): void => {
    const items = itemRefs.current.filter(item => item !== null)
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    const next = (Math.max(active, 0) + offset + items.length) % items.length
    items[next]?.focus()
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      // Escape dismisses the side card first, then the whole selector.
      if (submenu !== null) setSubmenu(null)
      else close(true)
      return
    }
    if (event.key === 'ArrowLeft' && submenu !== null) {
      event.preventDefault()
      setSubmenu(null)
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return
    close()
  }

  const settleSelection = (accepted: boolean): void => {
    if (accepted) {
      if (rootRef.current !== null) close(true)
      return
    }
    const message = directory.getSnapshot().error
    if (message !== null) {
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, text: t('error.action', { message }) })
    }
  }

  const choose = (selection: ModelSelection): void => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    lastActionRef.current = 'select'
    void select(selection).then(settleSelection)
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    const selection: ModelSelection = {
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    lastActionRef.current = 'select'
    void select(selection).then(settleSelection)
  }

  const modelLabel = currentChoice?.model.name ?? t('trigger.fallback')
  const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
  const accessibleModelLabel = currentUsesNativeVision
    ? `${modelLabel} · ${t('model.nativeVision')}`
    : modelLabel
  const triggerAria = currentChoice === undefined
    ? t('trigger.selectAria')
    : effortLabel === undefined
      ? t('trigger.aria', { model: accessibleModelLabel })
      : usesDeepSeekThinking
        ? t('trigger.ariaThinking', { model: accessibleModelLabel, effort: effortLabel })
        : t('trigger.ariaEffort', { model: accessibleModelLabel, effort: effortLabel })
  const menuAria = usesDeepSeekThinking ? t('menu.ariaDeepSeek') : t('menu.aria')
  const effortMenuLabel = usesDeepSeekThinking ? t('menu.thinking') : t('menu.effort')
  itemRefs.current = []
  let itemIndex = 0
  const itemRef = () => {
    const at = itemIndex++
    return (node: HTMLButtonElement | null) => { itemRefs.current[at] = node }
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onRootKeyDown} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={triggerLabel}
        disabled={locked}
        onClick={() => {
          if (open) {
            close()
          } else {
            show()
          }
        }}
      >
        <span className={css.triggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={css.triggerEffort}>{effortLabel}</span>}
        <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
      </button>

      {open && (
        <div
          className={css.menuRegion}
          onMouseEnter={keepSubmenuOpen}
          onMouseLeave={scheduleSubmenuClose}
        >
          <div
            id={`${id}-menu`}
            className={css.menu}
            role="menu"
            aria-label={menuAria}
            aria-busy={state.status === 'loading' || busy}
          >
            <button
              ref={itemRef()}
              type="button"
              role="menuitem"
              className={css.cell}
              aria-haspopup="menu"
              aria-expanded={submenu === 'model'}
              aria-controls={submenu === 'model' ? `${id}-model-menu` : undefined}
              onMouseEnter={() => { openSubmenu('model') }}
              onFocus={() => { openSubmenu('model') }}
              onClick={() => { openSubmenu('model') }}
            >
              <span className={css.cellLabel}>{t('menu.model')}</span>
              <span className={css.cellValue}>{modelLabel}</span>
              <IconChevronRightOutline14 className={css.cellChevron} />
            </button>
            {reasoning !== undefined && (
              <button
                ref={itemRef()}
                type="button"
                role="menuitem"
                className={css.cell}
                aria-haspopup="menu"
                aria-expanded={submenu === 'effort'}
                aria-controls={submenu === 'effort' ? `${id}-effort-menu` : undefined}
                onMouseEnter={() => { openSubmenu('effort') }}
                onFocus={() => { openSubmenu('effort') }}
                onClick={() => { openSubmenu('effort') }}
              >
                <span className={css.cellLabel}>{effortMenuLabel}</span>
                <span className={css.cellValue}>{effortLabel}</span>
                <IconChevronRightOutline14 className={css.cellChevron} />
              </button>
            )}
          </div>

          {submenu === 'model' && (
            <div
              id={`${id}-model-menu`}
              className={clsx(css.menu, css.submenu)}
              role="menu"
              aria-label={t('menu.model')}
              aria-busy={state.status === 'loading' || busy}
              onMouseEnter={keepSubmenuOpen}
            >
              {state.status === 'loading' && (
                <div className={css.status}>{t('status.loading')}</div>
              )}
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={css.error}>
                  <span>{t('error.action', { message: state.error })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                </div>
              )}
              {state.failures.map(failure => (
                <div className={css.warning} key={failure.id}>
                  <span>{t('warning.groupLoad', { name: failure.name, message: failure.message })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                </div>
              ))}
              <div className={clsx(css.groups, 'scrollable')}>
                {state.groups.map((group) => {
                  const headingId = `${id}-${group.id}`
                  return (
                    <section role="group" aria-labelledby={headingId} className={css.group} key={group.id}>
                      <div className={css.groupTitle} id={headingId}>{group.name}</div>
                      {group.models.map((model) => {
                        const selected = state.current?.provider === group.id && state.current.model === model.id
                        const nativeVision = isDeepSeekNativeVision(group.id, model.id)
                        return (
                          <button
                            ref={itemRef()}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            className={clsx(css.option, selected && css.selected)}
                            key={model.id}
                            title={model.name}
                            disabled={busy}
                            onClick={() => { choose({ provider: group.id, model: model.id }) }}
                          >
                            <span className={css.optionCopy}>
                              <span className={css.modelTitle}>
                                <span className={css.modelName}>{model.name}</span>
                                {nativeVision && (
                                  <span className={css.nativeVisionBadge}>
                                    {t('model.nativeVisionRecommended')}
                                  </span>
                                )}
                              </span>
                              {model.description !== undefined && (
                                <span className={css.description}>{model.description}</span>
                              )}
                            </span>
                            <span className={css.check}>
                              {selected ? <IconCheckOutline16 /> : null}
                            </span>
                          </button>
                        )
                      })}
                    </section>
                  )
                })}
              </div>
              {state.status === 'ready' && choices.length === 0 && (
                <div className={css.empty}>{t('empty.models')}</div>
              )}
            </div>
          )}

          {submenu === 'effort' && (
            <div
              id={`${id}-effort-menu`}
              className={clsx(css.menu, css.submenu)}
              role="menu"
              aria-label={effortMenuLabel}
              aria-busy={busy}
              onMouseEnter={keepSubmenuOpen}
            >
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={css.error}>
                  <span>{t('error.action', { message: state.error })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
                </div>
              )}
              {effortChoices.length === 0
                ? <div className={css.empty}>{t('empty.efforts')}</div>
                : effortChoices.map(level => (
                  <button
                    ref={itemRef()}
                    type="button"
                    role="menuitemradio"
                    aria-checked={effectiveEffort === level.effort}
                    className={clsx(css.option, effectiveEffort === level.effort && css.selected)}
                    key={level.key}
                    disabled={busy}
                    onClick={() => { chooseEffort(level.effort) }}
                  >
                    <span className={css.optionCopy}>
                      <span className={css.modelName}>{level.label}</span>
                      {level.description !== undefined && (
                        <span className={css.description}>{level.description}</span>
                      )}
                    </span>
                    <span className={css.check}>
                      {effectiveEffort === level.effort ? <IconCheckOutline16 /> : null}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutline16 />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
