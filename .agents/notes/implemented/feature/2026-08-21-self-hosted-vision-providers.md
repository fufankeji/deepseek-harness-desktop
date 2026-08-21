# Agent Note: Self-hosted vision providers

Status: implemented

English | [中文](2026-08-21-self-hosted-vision-providers.zh.md)

## Problem

Desktop visual enhancement could use only Bailian or OpenRouter. A user operating a local vision-language model through Ollama, vLLM, SGLang, or another OpenAI-compatible server could not select that endpoint, so image observations necessarily left the local environment.

## Decision

The existing visual-provider selector now includes Ollama, vLLM, SGLang, and a generic OpenAI-compatible route. Each self-hosted route carries an editable HTTP(S) API base, an explicit model id, and an optional API key. Ollama, vLLM, and SGLang provide their conventional local `/v1` addresses; the generic route requires the user to supply one. The Host appends `/chat/completions`, sends OpenAI-compatible text and data-URL image parts, rejects redirects, and retains the existing request and response bounds. A selected self-hosted route has no cloud fallback.

## Verification boundary

The host contract, client contract, Host implementation, and browser package compile together through their TypeScript project references. No Ollama, vLLM, or SGLang process was installed or started, and no image inference request was made, as required for this delivery.

## Alternatives considered

**One unlabelled custom endpoint only.** Rejected because the three requested engines have stable conventional local addresses that can remove avoidable setup errors while preserving an editable base.

**Install or manage local inference engines from Desktop.** Rejected because model weights, GPU runtimes, serving flags, and resource ownership belong to the user's deployment, not this integration.

**Reuse a cloud credential or endpoint when the local service fails.** Rejected because that would violate the route selection and could send private images off-device.

## Consequences

The feature integrates servers that implement the OpenAI-compatible multimodal Chat Completions shape. It does not claim that every model served by those engines supports images; the user must provide a vision-capable model and a server configuration with a working chat template. API keys remain optional for self-hosted routes but are sent as a Bearer token when supplied.
