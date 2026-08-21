/** Zod schemas for the provider-selectable vision-enhancement API. */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

const imageMediaTypeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const visionProviderSchema = z.enum(['bailian', 'openrouter', 'ollama', 'vllm', 'sglang', 'custom'])
const visionRouteModeSchema = z.enum(['off', 'native', 'compatible', 'unavailable'])
const visionProviderValueSchema = z.object({
  id: visionProviderSchema,
  name: z.string().min(1),
  configured: z.boolean(),
  defaultModel: z.string().max(255),
  apiKeyUrl: z.url(),
  modelEditable: z.boolean(),
  defaultBaseUrl: z.url().max(2_048).optional(),
  baseUrlEditable: z.boolean().optional(),
  apiKeyRequired: z.boolean().optional(),
})

/** Empty payload accepted by the vision status endpoint. */
export const visionStatusRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'vision.status'>>>
/** Host-authoritative visual-enhancement status payload. */
export const visionStatusValueSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  provider: visionProviderSchema,
  model: z.string().max(255),
  apiKeyUrl: z.url(),
  baseUrl: z.url().max(2_048).optional(),
  providers: z.array(visionProviderValueSchema).min(2).max(6),
}) satisfies z.ZodType<Wire<ResponseValue<'vision.status'>>>

/** Exact provider and model route submitted for image routing. */
export const visionRouteRequestSchema = z.object({
  modelProvider: z.string().trim().min(1).max(255),
  model: z.string().trim().min(1).max(255),
}) satisfies z.ZodType<Wire<RequestPayload<'vision.route'>>>

/** Host-selected image route for an exact provider and model. */
export const visionRouteValueSchema = z.object({
  mode: visionRouteModeSchema,
  modelProvider: z.string().min(1),
  model: z.string().min(1),
  provider: visionProviderSchema.optional(),
  providerName: z.string().min(1).optional(),
  visionModel: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'vision.route'>>>

/** Route submitted when automatic visual enhancement is activated. */
export const visionActivateRequestSchema = visionRouteRequestSchema satisfies z.ZodType<Wire<RequestPayload<'vision.activate'>>>
/** Activated automatic visual-enhancement route. */
export const visionActivateValueSchema = visionRouteValueSchema satisfies z.ZodType<Wire<ResponseValue<'vision.activate'>>>

/** Image probe accepted by the visual-provider test endpoint. */
export const visionTestRequestSchema = z.object({
  mediaType: imageMediaTypeSchema,
  data: z.string().min(1).max(14_000_000),
  question: z.string().max(2_000).optional(),
  name: z.string().max(255).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'vision.test'>>>

/** Image probe plus optional provider credentials accepted by enable. */
export const visionEnableRequestSchema = visionTestRequestSchema.extend({
  apiKey: z.string().min(1).max(16_384).optional(),
  provider: visionProviderSchema.optional(),
  model: z.string().trim().min(1).max(255).optional(),
  baseUrl: z.url().max(2_048).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'vision.enable'>>>

/** Verified visual description returned by a provider. */
export const visionTestValueSchema = z.object({
  provider: visionProviderSchema,
  model: z.string().min(1),
  baseUrl: z.url().max(2_048).optional(),
  description: z.string().min(1),
}) satisfies z.ZodType<Wire<ResponseValue<'vision.test'>>>

/** Verified enable result returned by a provider. */
export const visionEnableValueSchema = visionTestValueSchema satisfies z.ZodType<Wire<ResponseValue<'vision.enable'>>>
