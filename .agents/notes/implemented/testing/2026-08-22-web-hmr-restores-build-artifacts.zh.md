# Agent Note：Web HMR 测试恢复完整客户端产物

Status: implemented

[English](2026-08-22-web-hmr-restores-build-artifacts.md) | 中文

## Problem

Web HMR 浏览器测试会启动完整的 `dev:web` watcher，它既重写动态客户端 bundle，也重写 `apps/web/dist`。原有清理只恢复 `packages/*/*/lib/client.js` 及其 source map，导致后续 built-boot 测试拒绝该 checkout，因为 `.dsh-build/client-build-environment.json` 已经无法描述被改写的 Web 分发产物。

## Decision

HMR 测试会在启动 watcher 前，把 `apps/web/dist` 复制到既有临时工作目录。清理阶段先停止 watcher、恢复客户端 bundle，再停止 Host 和浏览器，用该快照替换生成的 Web 分发目录，最后删除临时工作目录。恢复失败会进入测试既有的清理错误聚合，不会被隐藏。

## Alternatives considered

**只恢复动态客户端 bundle。** 不采用，因为 `dev:web` 还会以 watch 模式运行 Vite，并重写完整构建记录所校验的 Web 分发目录。

**在 HMR 场景结束后再次执行完整构建。** 不采用，因为测试应在结算时恢复自己造成的变更；额外仓库构建更慢，也会掩盖不完整的清理。

## Consequences

HMR 场景仍然验证真实源码编辑可以在不刷新页面的情况下到达运行中的页面，而后续构建产物消费者会看到测试开始前的完整构建。临时分发副本会在测试结算时删除，绝不会进入 Git。
