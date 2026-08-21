/** Provider-selectable vision-enhancement API contract. */

import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Compatible visual providers supported by the Studio bridge. */
export type VisionProvider = 'bailian' | 'openrouter' | 'ollama' | 'vllm' | 'sglang' | 'custom'

/** Value-free provider status exposed to the client. */
export interface VisionProviderView {
  id: VisionProvider
  name: string
  configured: boolean
  defaultModel: string
  apiKeyUrl: string
  modelEditable: boolean
  defaultBaseUrl?: string
  baseUrlEditable?: boolean
  apiKeyRequired?: boolean
}

/** Host-authoritative visual-enhancement status. */
export interface VisionStatusView {
  enabled: boolean
  configured: boolean
  provider: VisionProvider
  model: string
  apiKeyUrl: string
  baseUrl?: string
  providers: readonly VisionProviderView[]
}

/** Verified visual description returned for one image probe. */
export interface VisionTestView {
  provider: VisionProvider
  model: string
  baseUrl?: string
  description: string
}

/** Automatic image route selected for the exact session model. */
export type VisionRouteMode = 'off' | 'native' | 'compatible' | 'unavailable'

/** Exact path the Host will use for images on one selected LLM route. */
export interface VisionRouteView {
  mode: VisionRouteMode
  modelProvider: string
  model: string
  provider?: VisionProvider
  providerName?: string
  visionModel?: string
}

/** RPC surface for visual-enhancement status, routing, verification, and activation. */
export interface VisionApi {
  status(request: RpcRequest<{}>): Promise<RpcResponse<VisionStatusView>>
  route(request: RpcRequest<{
    modelProvider: string
    model: string
  }>): Promise<RpcResponse<VisionRouteView>>
  activate(request: RpcRequest<{
    modelProvider: string
    model: string
  }>): Promise<RpcResponse<VisionRouteView>>
  test(request: RpcRequest<{
    mediaType: ImageMediaType
    data: string
    question?: string
    name?: string
  }>, signal?: AbortSignal): Promise<RpcResponse<VisionTestView>>
  enable(request: RpcRequest<{
    apiKey?: string
    provider?: VisionProvider
    model?: string
    baseUrl?: string
    mediaType: ImageMediaType
    data: string
    question?: string
    name?: string
  }>, signal?: AbortSignal): Promise<RpcResponse<VisionTestView>>
}
