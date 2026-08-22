# @deepseek-ai/dsh-client-ui-sidebar

English | [中文](README.zh.md)

Sidebar shell plugin: the brand row, New Session action, first-level application-action seat `sidebar.primary.action`, layout-owned collapse control, scroll-aware region seat, and bottom-pinned Settings seat. [ui-workspace](../ui-workspace/README.md) owns the Workspace and Session browser rendered into `sidebar.workspaces`; this package neither derives its rows nor owns its view preferences. Collapse remains presentation-local: the layout-owned rail is 56px in Web, Windows, and Linux, and 90px on macOS desktop so the native traffic lights fit with a trailing inset. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The expanded brand row renders `sidebar.brand.mark` and `sidebar.brand.name` as independent single slots, while the collapsed rail renders the same mark slot. Without occupants, the shell uses the fish mark and a `DSH Local Build` label carrying the build's 7-character `DSH_CLIENT_COMMIT_HASH` badge. A deployment package can replace either value without replacing the New Session control or rail geometry; declaration-aware `slots.inject()` lets such a package activate before or after the sidebar.

On macOS, an Electron document exposes a sidebar-top drag strip and meets the sidebar content at 32px so the logo row begins directly below the traffic lights; its internal 60px geometry stays unchanged. Windows uses the ordinary 6px expanded and 18px rail offsets without a sidebar drag strip because window movement belongs to the Conversation caption row. Sidebar controls remain `no-drag` wherever a platform drag strip is present. Web reserves no native title-bar space. On macOS and Windows the sidebar root is transparent for the layout-owned native material; Linux retains the normal sidebar fill.

New Session starts the runtime's page-local frontend Session Intent. The runtime targets the explicit Workspace used by a scoped action, otherwise the current Session's Workspace, otherwise the most recently active Workspace; when none exists it clears into the blank New Session page. Workspace-specific controls and the shared picker belong to ui-workspace.

`SidebarRootComponentProps` composes the layout owner share (including current `primaryPage`), the global `useSessions` and `useWorkspaces` hooks, the declared brand, `sidebar.primary.action`, `sidebar.workspaces`, `sidebar.footer.action`, and `sidebar.settings` child slots, and injected `startSession` plus sidebar-toggle callbacks. There is no plugin store.

During a live collapse, the shell holds the expanded content at its current width while it fades out for 150ms. The four upper controls—the shell toggle and New Session plus add and search rendered through `sidebar.workspaces`—then share one 150ms fade and leftward translation, ending with the layout's 300ms column slide; this is 49px for the 56px rail and 66px for the macOS 90px rail. Every 36px control box follows the same path to its centered rail position: a 10px inline inset in the 56px rail and 27px in the macOS rail. The bottom-pinned `sidebar.settings` control shares the fade timing but has no horizontal translation. A page that starts collapsed renders the rail statically, and reduced-motion mode disables both transitions.

Scrollbars in the column are a pointer affordance: the shell rebinds ui-theme's [scrollbar indirection](../ui-theme/README.md) to `transparent` whenever the pointer is outside it, and keeps the thumb drawn for 2s after the pointer leaves, so a list nobody is pointing at carries no bar. The reservation that keeps rows from moving belongs to the scrolling region ([ui-workspace](../ui-workspace/README.md)), so revealing a thumb never reflows.

The foot stacks every `sidebar.footer.action` occupant above the bottom-pinned `sidebar.settings` seat in both sidebar widths. Each occupant receives only the column state (`wide`) and owns its row or rail-button geometry; ui-settings registers the Settings trigger row and panel in the final seat.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; SidebarRoot, the row components, and the tree derivation remain package-internal behind the slot registration.

## Model Experience

None, as the sidebar renders the browser session list; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Session state-dot rendering is owned by [ui-workspace](../ui-workspace/README.md)** — no done/error notification sources are available.
- **Workspace browser behavior is composition-owned** — grouping, ordering, search, and row state belong to [ui-workspace](../ui-workspace/README.md), not this shell.
- **"New task completed" unread marking is local viewing state** — completion-time > last-seen never reaches the host.
