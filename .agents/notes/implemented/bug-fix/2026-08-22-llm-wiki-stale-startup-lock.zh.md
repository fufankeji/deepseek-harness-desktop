# Agent Note: LLM Wiki 启动残留锁恢复

Status: implemented

[English](2026-08-22-llm-wiki-stale-startup-lock.md) | 中文

## Problem

FF–LLM Wiki 通过 `content/.wiki.lock` 串行化 Wiki 编译。API 进程被中断后可能留下该文件。锁获取超时与应用启动超时都是 30 秒，因此启动器会在锁实现终于清理残留文件的同一时刻终止 API。浏览器随后报告 API 未就绪，只有之后再次重试才可能成功。

## Decision

锁文件继续保存所有者 PID。锁获取在遇到 `EEXIST` 后读取该 PID：进程存活或无权探测时保留锁，PID 无效或进程已不存在时立即回收文件。删除前会再次读取内容，避免根据较早观察删除已被替换的锁。对存活所有者仍保留现有的有界等待。每个 Desktop 本地打包与平台发布命令都会在暂存 Host 前重新构建 FF–LLM Wiki，因此被忽略的生成运行时绝不会取自较早的本地构建。

## Verification

API 测试会创建残留锁，经生产 helper 获取锁，执行受保护操作，并在无需等待超时的情况下观察到清理。Desktop 验证前会从该源码重新构建打包运行时。

## Alternatives considered

**应用启动时总是删除锁。** 未采用，因为两个存活 API 或编译进程可能因此并发进入破坏性 Wiki 重建。

**只增加启动器超时。** 未采用，因为这只会让残留状态恢复等待更久，仍无法区分已崩溃所有者与正在运行的工作。

## Consequences

崩溃残留不再消耗 30 秒启动预算。存活编译器仍持有同一互斥锁，并保留有界超时行为。
