# Agent Note：自托管视觉提供方

状态：已实现

[English](2026-08-21-self-hosted-vision-providers.md) | 中文

## 问题

Desktop 视觉增强只能使用百炼或 OpenRouter。通过 Ollama、vLLM、SGLang 或其他 OpenAI-compatible 服务运行本地视觉语言模型的用户无法选择该 endpoint，因此图片观察结果必然离开本地环境。

## 决策

现有视觉提供方选择器新增 Ollama、vLLM、SGLang 和通用 OpenAI-compatible 路由。每个自托管路由都包含可编辑的 HTTP(S) API Base、明确的模型 ID 和可选 API Key。Ollama、vLLM 与 SGLang 提供各自约定的本地 `/v1` 地址，通用路由则要求用户自行填写。Host 追加 `/chat/completions`，发送 OpenAI-compatible 文本与 data URL 图片内容块，拒绝重定向，并保留既有请求和响应边界。选定自托管路由后不存在云端回退。

## 验证边界

Host 协议、客户端协议、Host 实现与浏览器包已经通过 TypeScript 项目引用完成联合编译。按照本次交付要求，没有安装或启动 Ollama、vLLM、SGLang 进程，也没有发起图片推理请求。

## 考虑过的替代方案

**只提供一个无标签的自定义 endpoint。** 未采用，因为三个指定引擎都有稳定的约定本地地址；提供可编辑预设可以减少不必要的配置错误。

**由 Desktop 安装或管理本地推理引擎。** 未采用，因为模型权重、GPU 运行时、服务参数和资源所有权属于用户部署，不属于本次接入。

**本地服务失败时复用云端凭据或 endpoint。** 未采用，因为这会违反路由选择，并可能把私密图片发送到设备之外。

## 后果

本功能接入实现 OpenAI-compatible 多模态 Chat Completions 结构的服务。它不声称这些引擎托管的每个模型都支持图片；用户必须填写支持视觉的模型，并以可用 chat template 启动服务。自托管路由可以不填写 API Key；一旦填写，Host 会以 Bearer token 发送。
