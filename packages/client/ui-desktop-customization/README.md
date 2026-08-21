# Desktop customization

English | [中文](README.zh.md)

Desktop-only browser plugin for learner-facing visual enhancement, background selection, the visible update center, and the Beyondata attribution badge. The package is mounted only when the Desktop Host exports `DSH_DESKTOP=1`; persistence and update operations cross the fixed Electron preload bridge. The update card labels the Studio shell version and embedded Harness core version separately.

The package ships five named background themes plus the image-free original UI: Whale Maid is the first-run default, while Cloud Cat, Jiutian Deep-Space Compute Observatory, Jiutian Quantum Glass Laboratory, and Jiutian Dawn Compute Horizon remain selectable. Their stable identifiers are persisted without duplicating bundled images in `userData`. The custom-background path still accepts PNG, JPEG, or WebP up to 16 MB, renders a 1920×1080 WebP locally, persists it under Electron `userData`, and applies ThemeRuntime token overrides. No selected image is uploaded.

The visual-enhancement Settings row and the composer shortcut consume one Host-backed status source. One switch chooses exactly one route from exact model metadata: an image-capable primary model receives the native request, while a text-only model uses the already verified compatible sidecar. The setup dialog selects Bailian or OpenRouter, keeps Bailian on its fixed `qwen3.8-max` model, and lets an OpenRouter user enter a compatible vision model (default `openai/gpt-4.1-mini`). User-entered keys are stored under application-owned credential references; ambient `DASHSCOPE_API_KEY` and `OPENROUTER_API_KEY` values remain read-only fallbacks and are never write targets. The built-in DeepSeek visual model normally receives deterministic request images through reusable Files API references and falls back to bounded all-inline images when file resolution fails. Neither native branch calls the compatible sidecar. The shortcut activates a native route directly or opens the same real-image verification flow when compatible setup is required, disables through the same Settings namespace while enabled, and explains the selected route on hover. Host-pushed settings and credential updates refresh both entries together.

## Model Experience

None, as this browser-side package only controls the Host-owned visual capability and registers no model-facing context itself.

#### KV Cache effect

The package itself adds no tokens or KV-cache entries; after this UI enables visual enhancement, the Host-owned capability governs all Skill, Tool, and visual-observation effects.

## Known Limitations and Deferred Work

- The current learner-facing update card keeps online actions disabled; it reports both installed versions and directs learners to the release page.
- Signed installers, platform release metadata, and release publishing are deferred to the three-platform packaging phase.
