# Agent Note: LLM Wiki stale startup lock recovery

Status: implemented

English | [中文](2026-08-22-llm-wiki-stale-startup-lock.zh.md)

## Problem

FF–LLM Wiki serializes Wiki compilation through `content/.wiki.lock`. An interrupted API process can leave that file behind. The lock acquisition timeout and the application launch timeout were both 30 seconds, so the launcher terminated the API at the same moment the lock implementation finally removed the stale file. The browser then reported that the API was not ready, and only a later retry could succeed.

## Decision

The lock file continues to contain its owner PID. Lock acquisition reads that PID after `EEXIST`, preserves the lock when the process is alive or inaccessible, and immediately reclaims the file when the PID is invalid or no longer exists. It reads the contents again before removal so a replaced lock is not deleted based on an earlier observation. The existing bounded wait remains the fallback for a live owner. Every Desktop package and platform release command rebuilds FF–LLM Wiki before staging the Host, so the ignored generated runtime is never taken from an earlier local build.

## Verification

An API test creates a stale lock, acquires it through the production helper, runs the protected operation, and observes cleanup without waiting for the timeout. The packaged runtime is rebuilt from this source before Desktop verification.

## Alternatives considered

**Always delete the lock at application startup.** Rejected because two live API or compiler processes could then enter the destructive Wiki rebuild concurrently.

**Only increase the launcher timeout.** Rejected because it would turn stale-state recovery into a longer delay without distinguishing a crashed owner from active work.

## Consequences

Crash residue no longer consumes the 30-second launch budget. A live compiler still owns the same mutual exclusion and retains the bounded timeout behavior.
