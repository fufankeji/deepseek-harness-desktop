/** Real Windows installed-app V4 Vision smoke driven through the shipped Electron UI. */

import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const VISION_MODEL = 'DeepSeek-V4-Flash-Vision-Exp'
const EXPECTED_RESPONSE = 'WINDOWS_VISION_BLUE'

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`${name} is required`)
  return value
}

const cdpEndpoint = requiredEnvironment('DSH_DESKTOP_VISION_CDP')
const imagePath = requiredEnvironment('DSH_DESKTOP_VISION_IMAGE_PATH')
requiredEnvironment('DSH_DESKTOP_VISION_WORKSPACE_TITLE')

const browser = await chromium.connectOverCDP(cdpEndpoint)
try {
  const page = browser.contexts()[0]?.pages()[0]
  if (page === undefined) throw new Error('installed Desktop exposed no renderer page')
  await page.waitForSelector('[class*="frame"]', { timeout: 90_000 })

  const newSession = page.getByRole('button', { name: /^(?:New session|新建会话)$/u }).first()
  await newSession.waitFor({ timeout: 30_000 })
  await newSession.click()

  const composer = page.locator('textarea:enabled').first()
  await composer.waitFor({ timeout: 30_000 })

  const modelTrigger = page.getByRole('button', { name: /(?:Select model|选择模型)/u }).first()
  await modelTrigger.waitFor({ timeout: 20_000 })
  const selectedModel = await modelTrigger.getAttribute('aria-label')
  if (!selectedModel?.includes(VISION_MODEL)) {
    throw new Error(`installed Desktop selected an unexpected model: ${String(selectedModel)}`)
  }

  const image = await readFile(imagePath)
  await page.evaluate(({ base64, filename }) => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], filename, { type: 'image/png' }))
    const init: DragEventInit = { bubbles: true, cancelable: true, dataTransfer: transfer }
    document.dispatchEvent(new DragEvent('dragenter', init))
    document.dispatchEvent(new DragEvent('dragover', init))
    document.dispatchEvent(new DragEvent('drop', init))
  }, { base64: image.toString('base64'), filename: 'windows-vision-blue.png' })

  await page.getByRole('button', {
    name: /(?:Remove image|移除图片) windows-vision-blue\.png/u,
  }).waitFor({ timeout: 30_000 })

  await composer.fill(
    'Inspect the attached image. If its main color is blue, answer only WINDOWS_VISION_BLUE. '
    + 'Otherwise answer only WINDOWS_VISION_OTHER. Do not call tools.',
  )
  await composer.press('Enter')

  const assistant = page.locator('[data-chat-flow-kind="assistant-step"]')
    .filter({ hasText: EXPECTED_RESPONSE })
  await assistant.waitFor({ timeout: 180_000 })
  const response = (await assistant.last().textContent())?.trim() ?? ''
  if (!response.includes(EXPECTED_RESPONSE)) {
    throw new Error('installed Desktop returned no image-grounded marker')
  }
  const turnFailure = page.locator('[data-chat-flow-kind="turn-error"]')
  if (await turnFailure.count() > 0) {
    throw new Error(`installed Desktop exposed a turn failure: ${await turnFailure.last().textContent()}`)
  }

  console.log(JSON.stringify({
    installedDesktop: true,
    model: VISION_MODEL,
    imageAttached: true,
    groundedResponse: EXPECTED_RESPONSE,
  }))
} finally {
  await browser.close()
}
