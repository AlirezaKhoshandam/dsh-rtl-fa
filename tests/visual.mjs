/**
 * Real-Chromium visual and cascade test.
 *
 * Serves the fixture and the generated DSH client bundle over a loopback HTTP
 * server, launches the installed Edge/Chrome in headless mode, and receives the
 * in-page assertions over an HTTP POST. This avoids Playwright's
 * `--remote-debugging-pipe`, which some constrained Windows sandboxes deny,
 * while still exercising Chromium's real bidi layout and the plugin's CSS.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const artifactDir = join(root, 'artifacts')
await mkdir(artifactDir, { recursive: true })

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const executablePath = browserCandidates.find((candidate) => existsSync(candidate))
if (executablePath === undefined) throw new Error('No Edge/Chrome executable found for the visual test')

/** @type {(value: object) => void} */
let resolveResult
let resultPromise = null

const server = createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/result') {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    response.writeHead(204).end()
    resolveResult?.(result)
    return
  }

  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const requested = decodeURIComponent(url.pathname)
  const filePath = resolve(root, `.${normalize(requested)}`)
  if (relative(root, filePath).startsWith('..')) {
    response.writeHead(403).end('forbidden')
    return
  }
  try {
    const body = await readFile(filePath)
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
    }[extname(filePath)] ?? 'application/octet-stream'
    response.writeHead(200, { 'content-type': type }).end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
})

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
const address = server.address()
if (address === null || typeof address === 'string') throw new Error('Could not bind the visual test server')
const origin = `http://127.0.0.1:${address.port}`

/**
 * Run one headless browser pass and wait for the in-page report.
 *
 * @param {object} options - pass options.
 * @param {string} options.query - URL query string.
 * @param {string} options.screenshot - absolute output path.
 * @param {number} options.width - viewport width.
 * @param {number} options.height - viewport height.
 * @returns {Promise<object>}
 */
async function runBrowser({ query, screenshot, width, height }) {
  resultPromise = new Promise((resolveRun, rejectRun) => {
    const timer = setTimeout(() => rejectRun(new Error('visual test timed out waiting for the in-page result')), 30000)
    resolveResult = (value) => {
      clearTimeout(timer)
      resolveRun(value)
    }
  })

  const profileDir = join(artifactDir, `.browser-${Date.now()}`)
  await mkdir(profileDir, { recursive: true })
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=6000',
    `--window-size=${width},${height}`,
    `--user-data-dir=${profileDir}`,
    `--screenshot=${screenshot}`,
    `${origin}/tests/visual-fixture.html?${query}`,
  ]
  const child = spawn(executablePath, args, { stdio: 'inherit' })
  const exited = new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit)
    child.once('exit', (code, signal) => resolveExit({ code, signal }))
  })

  const result = await Promise.race([
    resultPromise,
    exited.then(({ code, signal }) => {
      throw new Error(`browser exited before reporting a result (code ${String(code)}, signal ${String(signal)})`)
    }),
  ])

  const exit = await Promise.race([
    exited,
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout({ code: 'timeout' }), 5000)),
  ])
  if (exit.code === 'timeout') child.kill()
  return result
}

try {
  const baseline = await runBrowser({
    query: 'plugin=off',
    screenshot: join(artifactDir, 'visual-before.png'),
    width: 1200,
    height: 2600,
  })
  assert.equal(baseline.ok, true)
  assert.equal(baseline.mode, 'baseline')

  const plugin = await runBrowser({
    query: 'plugin=on',
    screenshot: join(artifactDir, 'visual-after.png'),
    width: 1200,
    height: 2600,
  })
  assert.equal(plugin.ok, true, JSON.stringify(plugin.errors, null, 2))
  assert.equal(plugin.mode, 'plugin')
  for (const check of plugin.checks) assert.equal(check.ok, true, check.name)
  assert.ok(plugin.styles.markers >= 5)
  assert.equal(plugin.styles.userBubble.direction, 'rtl')
  assert.equal(plugin.styles.english.direction, 'ltr')
  assert.equal(plugin.styles.code.direction, 'ltr')
  assert.equal(plugin.styles.table.direction, 'rtl')
  assert.equal(plugin.styles.tableFa.direction, 'rtl')
  assert.equal(plugin.styles.tableEn.direction, 'ltr')
  assert.equal(plugin.styles.allList.direction, 'rtl')
  assert.equal(plugin.styles.allList.paddingRight, '18px')
  assert.equal(plugin.styles.allList.paddingLeft, '0px')
  assert.equal(plugin.styles.quote.borderRightWidth, '2px')
  assert.equal(plugin.styles.quote.borderLeftWidth, '0px')
  assert.equal(plugin.styles.composer.direction, 'rtl')
  assert.equal(plugin.streamedDirection, 'rtl')

  const report = { browser: executablePath, origin, baseline, plugin }
  await writeFile(join(artifactDir, 'visual-report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({
    browser: executablePath,
    screenshots: [
      'artifacts/visual-before.png',
      'artifacts/visual-after.png',
    ],
    checks: plugin.checks.length,
    assertions: 'passed',
  }, null, 2))
} finally {
  server.close()
}
