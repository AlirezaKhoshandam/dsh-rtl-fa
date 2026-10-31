/**
 * End-to-end check against a live DSH Web GUI.
 *
 * Usage: node tests/real-dsh.mjs <tokenized-dsh-url>
 * The URL carries a process credential; it is printed by `dsh web` and is not
 * stored in this repository.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const url = process.argv[2]
if (!url) throw new Error('usage: node tests/real-dsh.mjs <tokenized-dsh-url>')
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const artifactDir = join(root, 'artifacts')
await mkdir(artifactDir, { recursive: true })

const executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const consoleErrors = []
const pageErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => pageErrors.push(String(error)))

/**
 * Click a visible control matching one accessible name, tolerating an absent
 * optional onboarding overlay.
 *
 * @param {RegExp} name - accessible name pattern.
 * @returns {Promise<boolean>}
 */
async function clickButton(name) {
  const locator = page.getByRole('button', { name }).first()
  if (await locator.count() === 0) return false
  await locator.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(500)
  return true
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3500)
  await page.screenshot({ path: join(artifactDir, 'real-dsh-home.png'), fullPage: true })

  const onboarding = await page.getByText('Preview Notice', { exact: true }).count()
  if (onboarding > 0) await clickButton(/continue/i)

  const initial = await page.evaluate(() => {
    const boot = globalThis.__DSH_BOOT__
    const entries = Array.isArray(boot?.entries)
      ? boot.entries.map((entry) => typeof entry === 'string' ? entry : entry?.name ?? entry?.id ?? entry?.package)
      : boot?.entries
    return {
      title: document.title,
      pluginStyle: Boolean(document.querySelector('style[data-plugin="dsh-rtl-fa"]')),
      pluginMarkers: document.querySelectorAll('[data-dsh-rtl]').length,
      bootEntry: entries?.includes('dsh-rtl-fa') ?? false,
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        text: button.textContent?.trim().slice(0, 60),
        aria: button.getAttribute('aria-label'),
      })).slice(0, 40),
    }
  })

  // The test home has no API key; dismiss its first-run "Get started" dialog
  // before opening Settings via the application shortcut.
  const getStarted = await page.getByText('Get started', { exact: true }).count()
  if (getStarted > 0) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  let accountOpened = false
  let menuText = ''
  let settingsOpened = false
  await page.keyboard.press('Control+Alt+Comma')
  await page.waitForTimeout(900)
  settingsOpened = await page.evaluate(() => document.body.innerText.includes('Persian & RTL text'))
  if (!settingsOpened) {
    accountOpened = await clickButton(/account menu/i)
    menuText = await page.evaluate(() => document.body.innerText.slice(0, 3000))
    settingsOpened = await clickButton(/^settings$/i)
    await page.waitForTimeout(800)
  }
  await page.screenshot({ path: join(artifactDir, 'real-dsh-settings.png'), fullPage: true })

  const settings = await page.evaluate(() => {
    const rowTitle = [...document.querySelectorAll('*')].find((node) => node.children.length === 0 && node.textContent?.trim() === 'Persian & RTL text')
    const row = rowTitle?.closest('.dshRtlFa_group') ?? null
    const switches = [...document.querySelectorAll('.dshRtlFa_group [role="switch"]')].map((button) => ({
      label: button.getAttribute('aria-label'),
      checked: button.getAttribute('aria-checked'),
    }))
    const select = document.querySelector('.dshRtlFa_group select')
    return {
      row: row !== null,
      switches,
      selectValue: select?.value ?? null,
      selectOptions: select ? [...select.options].map((option) => option.textContent) : [],
      sample: document.querySelector('.dshRtlFa_sample')?.textContent ?? null,
      bodyHasTitle: document.body.innerText.includes('Persian & RTL text'),
    }
  })

  let toggledOff = null
  let toggledOn = null
  const enableSwitch = page.getByRole('switch', { name: /enable RTL text support/i }).first()
  if (await enableSwitch.count() > 0) {
    await enableSwitch.click()
    await page.waitForTimeout(700)
    toggledOff = await page.evaluate(() => ({
      checked: document.querySelector('.dshRtlFa_group [role="switch"]')?.getAttribute('aria-checked'),
      markers: document.querySelectorAll('[data-dsh-rtl]').length,
      style: Boolean(document.querySelector('style[data-plugin="dsh-rtl-fa"]')),
    }))
    await enableSwitch.click()
    await page.waitForTimeout(700)
    toggledOn = await page.evaluate(() => ({
      checked: document.querySelector('.dshRtlFa_group [role="switch"]')?.getAttribute('aria-checked'),
      style: Boolean(document.querySelector('style[data-plugin="dsh-rtl-fa"]')),
    }))
  }

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const newSession = await clickButton(/new session/i)
  await page.waitForTimeout(900)
  const composer = page.locator('[data-composer-input]').first()
  const composerFound = await composer.count() > 0
  let composerState = null
  if (composerFound) {
    await composer.click()
    await page.keyboard.type('برای اجرای دستور npm install ابتدا وارد پوشه پروژه شوید.')
    await page.waitForTimeout(800)
    composerState = await page.evaluate(() => {
      const input = document.querySelector('[data-composer-input]')
      return {
        dir: input?.getAttribute('dir') ?? null,
        direction: input ? getComputedStyle(input).direction : null,
        text: input?.innerText?.slice(0, 200) ?? null,
      }
    })
    await page.screenshot({ path: join(artifactDir, 'real-dsh-composer.png'), fullPage: true })
  }

  const report = {
    urlOrigin: new URL(url).origin,
    initial,
    onboarding,
    accountOpened,
    menuText,
    settingsOpened,
    settings,
    toggledOff,
    toggledOn,
    newSession,
    composerFound,
    composerState,
    consoleErrors,
    pageErrors,
  }
  await writeFile(join(artifactDir, 'real-dsh-report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
