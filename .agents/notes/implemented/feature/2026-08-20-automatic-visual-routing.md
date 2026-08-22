# Agent Note: Automatic visual routing behind one control

Status: implemented

English | [中文](2026-08-20-automatic-visual-routing.zh.md)

## Problem

Desktop already had a compatible visual sidecar when Harness added direct image input for capable conversation models. Exposing both mechanisms independently would give users overlapping controls and could send the same image through both the primary model and the sidecar. Requiring a compatible-provider key even when the selected model accepts images would also add needless setup.

## Decision

The composer keeps one user-facing switch named `视觉增强`. Activating it from the off state first selects the built-in `DeepSeek-V4-Flash-Vision-Exp` model for the current session and future blank sessions, then enables its native image route. While the capability remains enabled, later model changes still select exactly one route from exact model metadata: native image input when the model includes `image`, otherwise an already verified compatible sidecar. A model without declared image support and without a usable compatible provider is `unavailable` and opens the existing provider setup instead of accepting the image.

The Host owns the route decision through `vision.route` and the atomic `vision.activate` operation. Native activation writes only the enabled setting and requires no visual-provider credential. Compatible activation requires a configured and previously validated provider. The client reads the session's Host-accepted model selection; a disabled click selects the built-in visual model before activation, and the hover card reports the resolved route without adding a second mode selector. Changing models while enabled recomputes that route. The direct DeepSeek model editor exposes `Allow native image requests` as an exact-model capability declaration, not a route control, so private or future image-capable endpoints can provide the metadata used by the same automatic decision.

At the LLM boundary, a native route delegates the original image-bearing request exactly once. A compatible route replaces image blocks with the existing durable visual observations and does not forward the original image. While the switch is off, new image prompts are refused before attachment persistence and historical image blocks are replaced with an explicit model-visible omission marker; the UI and durable attachment history remain unchanged.

For the built-in `DeepSeek-V4-Flash-Vision-Exp` route, Studio reuses the Harness rc.2 image pipeline rather than adding a second Desktop transport. The attachment service admits the official 20 MiB source-image default and creates one bounded deterministic request version. DeepSeek normally receives a reusable Files API `file_id`; if Files resolution fails or times out, the complete request falls back to the same prepared bytes as bounded inline data URLs. A request never mixes file ids and inline images, and neither native branch invokes the compatible sidecar.

This decision composes the exact-model native capability with the cloud and self-hosted sidecars from [Selectable visual providers](2026-08-16-selectable-visual-providers.md). It changes model selection only when the user activates the disabled shortcut; it does not change provider credentials, attachment storage, or the settings dialog's compatible-provider configuration.

## Alternatives considered

**Expose Auto, Native, Qwen-compatible, and Off as four modes.** Rejected because Native and compatible are implementation routes determined by model capability, not independent user goals. A mode menu would duplicate the model selector and provider settings while allowing combinations that cannot work.

**Always run the compatible sidecar when enabled.** Rejected because capable models would receive a text observation instead of the original image, and any later attempt to also send the image would duplicate processing, latency, and provider cost.

**Always send images to the selected conversation model.** Rejected because explicitly text-only models need the verified compatibility path and would otherwise fail after the prompt was accepted.

**Let images pass while the switch is off.** Rejected because the single visible switch must control the complete product capability. Allowing native images while it reads off would make the UI state false.

## Consequences

Users enable or disable one capability and do not configure a separate compatible-provider key for the built-in visual model. The initial activation makes the model switch explicit in the existing selector; subsequent model changes may alter the route, so the Host rechecks it at prompt admission and stream time. Automatic native routing is intentionally evidence-based: adapters that omit modality metadata use the compatible path and must declare `image` before receiving original image blocks. Files reuse reduces repeated upload work, while the bounded all-inline fallback keeps one request recoverable without double-sending the image. Disabling the feature prevents model access to images without deleting attachments or rewriting session history.
