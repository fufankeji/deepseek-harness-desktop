# Plugin Center Contracts

English | [中文](README.zh.md)

Strict JSON-compatible catalog, preflight, and trusted-install operation contracts shared by the Desktop main process and the Plugin Center client. A Skill pack is represented only as a validated exact DSH Bundle with `catalogKind: skill-pack` and the `skill` capability; this package accepts no package source, Git URL, local path, executable, environment, or version range from the renderer.

One bounded catalog result may include a closed `notice` that distinguishes a successful GitHub-to-npm mapping, partially published repositories, source-only repositories, repositories without a DSH Bundle, and network fallback. The notice explains discovery context only and never grants artifact or mutation authority.

Preset Square uses a separate closed contract instead of extending the plugin catalog kinds. Its list, detail, archive metadata, preview, and install decoders restrict published entries and download URLs to `https://www.dshdesktop.com/preset/`, reject unknown fields, and carry only a bounded target id into the local import operation.

Each decoded item also carries closed catalog provenance: `fufan-official` or `community`. Provenance controls presentation and bundled archive resolution only; it never upgrades an installed Preset from user trust to protected system trust.

Catalog decoders reject unknown fields and validate ids, exact versions, bounds, approved media origins, section references, timestamps, compatibility summaries, activation evidence, and one matching trusted preflight for every exact detail before a snapshot can replace trusted cache. Preflight package and artifact authority stays inside Desktop projections and is never returned by list or detail reads.

Compatibility contracts separate three authorities:

- the renderer submits only `pluginId`, one exact `version`, and one closed `action`;
- the validated catalog supplies package identity, semantic-version ranges, platform artifacts, digests, capabilities, risk, conflicts, and expected runtime evidence;
- Desktop supplies the release versions, platform, catalog freshness, Profile revision, installed projection, protected identities, and active-operation state.

Every decision is scoped to those exact inputs and carries stable ordered reason codes. Artifact results expose bounded identity and reason facts only; they contain no archive bytes or local paths. The required `broad-application-authority` disclosure prevents technically validated metadata from being represented as an official code review or sandbox guarantee.

Installation intent contains only plugin id, exact version, and a stable idempotency key. Installed projections keep package, Bundle, source, protection, runtime, update, pending action, configuration routes, and declared owned data as separate facts. Enable, disable, update, and uninstall requests reuse the exact-id plus idempotency form. Post-uninstall data removal additionally requires the committed operation id, a bounded subset of declared relative paths, and the fixed `remove-owned-data` confirmation. Immutable operation snapshots use one ordered phase vocabulary and one closed failure vocabulary; start responses distinguish a new operation, a same-key join, and a different active operation without exposing package-manager authority.

## Model Experience

None, as this package only validates catalog and preflight values and registers nothing model-facing; a later activated plugin owns any model-visible behavior.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- This package validates values but does not fetch catalogs, download archives, mutate a Profile, restart the Host, or prove runtime activation; Desktop owns those effects.
- V1 mutation platforms are limited to packaged macOS arm64 and Windows x64, with artifacts restricted to approved HTTPS origins including the public npm registry.
- Registry integrity, digests, package identity, and risk labels reduce supply-chain uncertainty but do not constitute a DeepSeek security review or isolate plugin code; installed Host plugins retain broad application authority.
