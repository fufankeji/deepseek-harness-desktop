/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` reads identically to `trigger.fallback` today and is
 * still a separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'command.description': '选择本会话使用的模型',
  'option.loadError': '目录加载失败：{message}',
  'trigger.fallback': '选择模型',
  'trigger.selectAria': '选择模型',
  'trigger.aria': '选择模型，当前 {model}',
  'trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
  'trigger.ariaThinking': '选择模型，当前 {model}，思考模式 {effort}',
  'menu.aria': '模型与推理等级',
  'menu.ariaDeepSeek': 'DeepSeek 模型设置',
  'menu.model': '模型',
  'menu.effort': '推理等级',
  'menu.thinking': '思考模式',
  'model.nativeVision': '支持图片',
  'model.nativeVisionRecommended': '支持图片',
  'effort.providerDefault': '跟随模型默认',
  'deepseek.effort.off': '关闭思考',
  'deepseek.effort.low': '低强度思考',
  'deepseek.effort.high': '深度思考',
  'deepseek.effort.max': '最大思考',
  'deepseek.effort.offDescription': '不启用深度思考',
  'deepseek.effort.lowDescription': '减少推理消耗，适合简单任务',
  'deepseek.effort.highDescription': '启用深度思考，适合大多数开发任务',
  'deepseek.effort.maxDescription': '使用最高推理强度，适合复杂任务',
  'status.loading': '正在刷新模型列表…',
  'error.action': '模型操作失败：{message}',
  'action.reload': '重新加载',
  'warning.groupLoad': '{name} 加载失败：{message}',
  'empty.models': '没有可用的模型。',
  'blocked.composer': '当前模型不可用，请先选择模型',
  'empty.efforts': '当前模型未提供推理等级。',
} satisfies Record<string, string>

/** The model namespace key union. */
export type ModelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'command.description': 'Select the model for this conversation',
  'option.loadError': 'Catalog failed to load: {message}',
  'trigger.fallback': 'Select model',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'trigger.ariaThinking': 'Select model, current {model}, thinking mode {effort}',
  'menu.aria': 'Model and reasoning effort',
  'menu.ariaDeepSeek': 'DeepSeek model settings',
  'menu.model': 'Model',
  'menu.effort': 'Effort',
  'menu.thinking': 'Thinking mode',
  'model.nativeVision': 'Image input',
  'model.nativeVisionRecommended': 'Image input',
  'effort.providerDefault': 'Default',
  'deepseek.effort.off': 'Thinking off',
  'deepseek.effort.low': 'Low thinking',
  'deepseek.effort.high': 'Deep thinking',
  'deepseek.effort.max': 'Maximum thinking',
  'deepseek.effort.offDescription': 'Answers without deep thinking',
  'deepseek.effort.lowDescription': 'Uses less reasoning for simple tasks',
  'deepseek.effort.highDescription': 'Uses deep thinking for most development tasks',
  'deepseek.effort.maxDescription': 'Uses the highest reasoning effort for complex tasks',
  'status.loading': 'Refreshing model list…',
  'error.action': 'Model operation failed: {message}',
  'action.reload': 'Reload',
  'warning.groupLoad': '{name} failed to load: {message}',
  'empty.models': 'No models available.',
  'blocked.composer': 'This model is unavailable — select one to continue',
  'empty.efforts': 'This model provides no reasoning effort levels.',
} satisfies Record<ModelKey, string>
