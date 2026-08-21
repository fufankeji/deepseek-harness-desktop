# Agent Note: 通过已安装 Windows Desktop 验证 V4 Vision

Status: implemented

[English](2026-08-22-windows-installed-vision-validation.md) | 中文

## 问题

打包后的 Sharp smoke 只能证明 Windows 产物可以处理图片，不能证明已安装 Desktop、打包 Host、模型选择器、附件传输、DeepSeek Files API 和 V4 Vision 响应已经协同工作。源码级适配器测试和 macOS 真实模型旅程无法关闭 Windows 安装边界。

## 决策

仅手动触发的 Windows 安装器生命周期工作流新增显式 `run_real_vision` 输入。启用时必须提供受保护的仓库 Secret；工作流只预置隔离 Workspace 和非敏感设置，把候选安装到自定义目录，并用 loopback CDP 端点启动这个已安装可执行文件。提交到仓库的 Playwright 驱动通过正式 UI 创建会话、确认已选择 V4 Vision 模型、把生成的蓝色 PNG 拖入真实输入框、发送依赖图片内容的提示，并要求助手返回预期标记。随后工作流校验 Files v3 索引，再继续既有的运行中卸载、重装和残留修复旅程。普通生命周期运行默认关闭这条凭证验证通道。

## 验证

工作流合同测试固定可选输入、受保护 Secret 名、已安装 UI 驱动和回执字段；TypeScript 类型检查覆盖驱动脚本。原生 Windows 运行只有在已安装可执行文件返回图片依据标记、写入至少一条 Files v3 记录，并继续完成安装器生命周期检查时才成功。

## 考虑过的替代方案

**只在 Windows 运行 `llm-deepseek` 适配器 E2E。** 否决，因为它绕过了已安装 Electron 应用和打包 Host。

**把 API Key 放进工作流、触发输入、命令行或产物。** 否决，因为这些表面不是凭证存储，可能泄漏到日志或保留证据中。

**要求每次安装器 smoke 都调用付费预览模型。** 否决，因为普通安装器生命周期验证应当在没有第三方凭证或模型可用性的情况下仍可重复执行。

## 后果

Windows 现在可以为 macOS 已经验证过的同一条已安装 V4 Vision 主路径生成直接证据。增强通道依赖显式提供的受保护 Secret 和当前预览模型可用性，因此它的失败与无凭证安装器回归保持分离。Secret 只由限定的验证步骤消费，不会保留在安装回执或上传产物中。
