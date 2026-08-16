# Agent Note: Desktop Plugin Discovery page

Status: implemented

English | [中文](2026-08-16-desktop-plugin-discovery-page.zh.md)

## Problem

Plugin Center combines catalog browsing with installed-package management, compatibility explanations, recovery notices, and lifecycle actions. As the public catalog grows, users need a faster way to scan current recommendations and recent additions without making the management page denser or weakening its operational responsibilities.

## Decision

The Desktop client registers `plugin-discovery` immediately after `plugin-center` in `sidebar.primary.action` and gives it an independent keyed `main.page`. Plugin Discovery consumes the existing public Plugin catalog and installed projection through the same Desktop bridge; it introduces no package source, catalog authority, or mutation path.

The overview preserves the catalog's server-owned Featured, Popular, and Recent ordering. It presents one Featured card, a compact Popular ranking, Recently updated cards, search, and only the capability categories that match returned reviewed metadata. The client does not calculate a popularity score, relabel Recent as a guaranteed same-day release, or display growth figures without an auditable catalog field.

Opening an entry keeps the discovery position and reveals a right-side exact-version panel. The panel reads the existing detail and compatibility decisions, while Install uses the existing compatibility check, explicit broad-authority acknowledgement, immutable plugin id and version intent, and operation progress dialog. An installed entry opens Plugin Center for management instead of duplicating enable, disable, update, or uninstall controls.

## Interaction ownership

Plugin Discovery owns search text, selected view, capability category, selected detail, and local panel focus. The Desktop catalog owns membership and order, the compatibility bridge owns installation eligibility, the operation bridge owns progress, and Plugin Center remains the only installed-composition manager.

## Alternatives considered

**Expand Plugin Center with another section.** This keeps one entry but makes discovery compete with installed state, recovery, configuration, and lifecycle actions in an already dense page.

**Show client-computed growth and download metrics.** The current summary does not carry auditable time-series evidence, so derived or decorative figures would misrepresent catalog facts.

**Copy a public navigation-site landing page.** Large marketing heroes and category grids use desktop space poorly and break the existing Harness navigation and card density.

## Consequences

Users gain a separate, compact discovery journey while every install still passes the trusted Desktop path. The page can expose only the ranking meanings and categories supported by current catalog metadata; a future growth view requires a catalog contract change and backend evidence before the UI adds it.
