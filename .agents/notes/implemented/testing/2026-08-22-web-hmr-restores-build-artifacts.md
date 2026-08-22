# Agent Note: Web HMR tests restore complete client artifacts

Status: implemented

English | [中文](2026-08-22-web-hmr-restores-build-artifacts.zh.md)

## Problem

The Web HMR browser test starts the complete `dev:web` watcher, which rewrites both dynamic client bundles and `apps/web/dist`. Its cleanup restored only `packages/*/*/lib/client.js` and source maps. A later built-boot test therefore rejected the checkout because `.dsh-build/client-build-environment.json` no longer described the modified Web distribution.

## Decision

The HMR test snapshots `apps/web/dist` into its existing temporary world before starting the watcher. Cleanup stops the watcher, restores the client bundles, stops the Host and browser, replaces the generated Web distribution with that snapshot, and then removes the temporary world. Restoration failures join the test's existing cleanup aggregate instead of being hidden.

## Alternatives considered

**Restore only dynamic client bundles.** Rejected because `dev:web` also runs Vite in watch mode and rewrites the Web distribution consumed by the complete-build record.

**Run another complete build after the HMR scenario.** Rejected because the test owns the mutation and must restore its inputs at settlement; an extra repository build is slower and would hide incomplete cleanup.

## Consequences

The HMR scenario still proves a real source edit reaches a live page without refresh, while later built-artifact consumers observe exactly the complete build that existed before the test. The temporary distribution copy is deleted at test settlement and never enters Git.
