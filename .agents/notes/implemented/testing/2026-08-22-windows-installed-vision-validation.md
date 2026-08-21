# Agent Note: Validate V4 Vision through the installed Windows Desktop

Status: implemented

English | [中文](2026-08-22-windows-installed-vision-validation.zh.md)

## Problem

A packaged Sharp smoke proves that the Windows artifact can process images, but it does not prove that the installed Desktop, its packaged Host, the model selector, attachment transport, DeepSeek Files API, and V4 Vision response work together. Source-level adapter tests and macOS real-model journeys cannot close that Windows installation boundary.

## Decision

The dispatch-only Windows installer lifecycle workflow has an explicit `run_real_vision` input. When enabled, it requires a protected repository secret, seeds only an isolated Workspace and non-secret settings, installs the candidate into a custom directory, and launches that installed executable with a loopback CDP endpoint. A committed Playwright driver creates a session through the shipped UI, confirms the selected V4 Vision model, drops a generated blue PNG into the real composer, sends an image-grounded prompt, and requires the expected assistant marker. The workflow then validates the Files v3 index before continuing the existing running-uninstall, reinstall, and residual-repair journey. Ordinary lifecycle runs leave this credentialed lane disabled.

## Verification

The workflow contract test pins the opt-in input, protected secret name, installed-UI driver, and receipt field. TypeScript typechecking covers the driver. The native Windows run is successful only when the installed executable returns the image-grounded marker, writes at least one Files v3 record, and still completes the installer lifecycle checks.

## Alternatives considered

**Run only `llm-deepseek` adapter E2E on Windows.** Rejected because it bypasses the installed Electron application and packaged Host.

**Put the API key in the workflow, dispatch input, command line, or artifact.** Rejected because those surfaces are not credential stores and can leak into logs or retained evidence.

**Require every installer smoke to call the paid preview model.** Rejected because ordinary installer lifecycle verification should remain repeatable without a third-party credential or model availability.

## Consequences

Windows can now produce direct evidence for the same installed V4 Vision main path already exercised on macOS. The stronger lane depends on an explicitly supplied protected secret and current preview-model availability, so failures remain separate from keyless installer regressions. The secret is consumed only by the scoped verification step and is not retained in the installation receipt or uploaded artifact.
