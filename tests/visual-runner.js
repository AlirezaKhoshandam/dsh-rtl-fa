/*
 * In-page integration and visual assertions for tests/visual.mjs.
 *
 * The page posts one JSON result to the local test server. A red/green badge
 * stays visible in the screenshot so a human can see whether the plugin was
 * active, while the machine-readable report arrives over HTTP.
 */
;(async () => {
  const params = new URLSearchParams(location.search)
  const applyPlugin = params.get('plugin') !== 'off'
  const errors = []
  const checks = []

  const badge = document.createElement('div')
  badge.textContent = applyPlugin ? 'RTL plugin: ON' : 'RTL plugin: OFF'
  badge.style.cssText = [
    'position:fixed',
    'left:16px',
    'bottom:16px',
    'z-index:99',
    'padding:6px 10px',
    'border-radius:999px',
    'font:600 11px/16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'letter-spacing:.03em',
    applyPlugin ? 'background:#143d2b' : 'background:#3a3a40',
    'color:#fff',
    'box-shadow:0 4px 16px #0003',
  ].join(';')
  document.body.appendChild(badge)

  window.addEventListener('error', (event) => {
    errors.push(String(event.error ?? event.message))
  })
  window.addEventListener('unhandledrejection', (event) => {
    errors.push(String(event.reason))
  })

  function check(name, condition, detail) {
    checks.push({ name, ok: Boolean(condition), detail })
    if (!condition) throw new Error(`${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`)
  }

  function computed(selector) {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`missing fixture element: ${selector}`)
    const style = getComputedStyle(element)
    return {
      direction: style.direction,
      textAlign: style.textAlign,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      borderLeftWidth: style.borderLeftWidth,
      borderRightWidth: style.borderRightWidth,
    }
  }

  function finish(result) {
    const output = document.createElement('pre')
    output.id = 'testResults'
    output.style.display = 'none'
    output.textContent = JSON.stringify(result)
    document.body.appendChild(output)
    void fetch('/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result),
    }).catch((error) => {
      /* the screenshot remains usable even if the report cannot be posted */
      console.error(error)
    })
  }

  try {
    if (!applyPlugin) {
      check('plugin-off baseline has no markers', document.querySelectorAll('[data-dsh-rtl]').length === 0)
      finish({ ok: true, mode: 'baseline', checks, errors })
      return
    }

    const registration = window.__moduleRegistration
    check('bundle registered a module factory', registration?.id === 'dsh-rtl-fa', registration?.id)

    const React = {
      createElement() { return {} },
      useState(value) { return [value, () => {}] },
      useId() { return 'visual-id' },
      useSyncExternalStore() { return undefined },
    }
    const value = { enabled: true, mode: 'auto', composer: true }
    const listeners = new Set()
    const form = {
      getSnapshot: () => ({ status: 'ready', value: { ...value } }),
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      async mutate(operations) {
        for (const operation of operations) value[operation.path[0]] = operation.value
        for (const listener of [...listeners]) listener()
        return true
      },
    }
    const effects = []
    const registrations = []
    const ctx = {
      configForms: { get: () => form },
      effect(factory) { effects.push(factory()) },
      locale: { register() { return () => {} } },
      slots: {
        inject(_name, factory) { registrations.push(factory()) },
        register(options, component) { return { options, component } },
      },
    }
    const exports = registration.factory((request) => {
      if (request === 'react') return React
      throw new Error(`unexpected external module: ${request}`)
    })
    exports.apply(ctx)
    const actions = registrations[0].options.inject()
    check('settings row registered', registrations.length === 1 && registrations[0].options.id === 'rtl-fa')

    await new Promise((resolve) => setTimeout(resolve, 80))

    const styles = {
      userBubble: computed('#userBubble'),
      mixed: computed('#mixedParagraph'),
      english: computed('#assistantEnglish p'),
      code: computed('#codeBlock'),
      table: { direction: getComputedStyle(document.querySelector('#persianTable')).direction },
      tableFa: { direction: getComputedStyle(document.querySelector('#tableFa')).direction },
      tableEn: { direction: getComputedStyle(document.querySelector('#tableEn')).direction },
      allList: computed('#allRtlList'),
      quote: computed('#quoteBlock'),
      composer: computed('#composer'),
      markers: document.querySelectorAll('[data-dsh-rtl="rtl"]').length,
      codeDirAttr: document.querySelector('#codeBlock').getAttribute('dir'),
      englishDirAttr: document.querySelector('#assistantEnglish p').getAttribute('dir'),
    }

    check('Persian user bubble is RTL', styles.userBubble.direction === 'rtl', styles.userBubble)
    check('Persian user bubble starts at the inline start', ['start', 'right'].includes(styles.userBubble.textAlign), styles.userBubble.textAlign)
    check('mixed CLI + Persian paragraph is RTL', styles.mixed.direction === 'rtl', styles.mixed)
    check('English answer stays LTR', styles.english.direction === 'ltr', styles.english)
    check('code block stays LTR', styles.code.direction === 'ltr', styles.code)
    check('code block is left-aligned', styles.code.textAlign === 'left', styles.code.textAlign)
    check('code block has no plugin dir attribute', styles.codeDirAttr === null, styles.codeDirAttr)
    check('English paragraph has no plugin dir attribute', styles.englishDirAttr === null, styles.englishDirAttr)
    check('predominantly Persian table reverses its column order', styles.table.direction === 'rtl', styles.table)
    check('Persian table cell is RTL', styles.tableFa.direction === 'rtl', styles.tableFa)
    check('English table cell is explicitly reset to LTR', styles.tableEn.direction === 'ltr', styles.tableEn)
    check('all-RTL list is RTL', styles.allList.direction === 'rtl', styles.allList)
    check('all-RTL list reserves its marker gutter on the right', styles.allList.paddingRight === '18px' && styles.allList.paddingLeft === '0px', styles.allList)
    check('blockquote border moved to the right', styles.quote.borderRightWidth === '2px' && styles.quote.borderLeftWidth === '0px', styles.quote)
    check('Persian composer is RTL', styles.composer.direction === 'rtl', styles.composer)
    check('at least five blocks were marked', styles.markers >= 5, styles.markers)

    document.querySelector('#streamTarget').textContent = 'اکنون یک قطعهٔ فارسی در حال استریم است.'
    await new Promise((resolve) => setTimeout(resolve, 100))
    const streamedDirection = getComputedStyle(document.querySelector('#streamTarget')).direction
    check('streamed Persian mutation becomes RTL', streamedDirection === 'rtl', streamedDirection)

    const disabled = await actions.setSettings({ enabled: false })
    check('settings write disables the engine', disabled.ok === true, disabled)
    check('disable removes markers', document.querySelectorAll('[data-dsh-rtl]').length === 0)
    check('disable keeps the settings stylesheet', Boolean(document.querySelector('style[data-plugin="dsh-rtl-fa"]')))
    check('disable restores composer LTR', getComputedStyle(document.querySelector('#composer')).direction === 'ltr')

    const enabled = await actions.setSettings({ enabled: true, mode: 'rtl' })
    check('settings write re-enables the engine', enabled.ok === true, enabled)
    check('force-RTL mode marks Persian', getComputedStyle(document.querySelector('#userBubble')).direction === 'rtl')
    check('force-RTL mode leaves English unmarked', document.querySelector('#assistantEnglish p').getAttribute('dir') === null)

    await actions.setSettings({ enabled: true, mode: 'auto' })
    await new Promise((resolve) => setTimeout(resolve, 70))

    finish({
      ok: errors.length === 0,
      mode: 'plugin',
      browser: navigator.userAgent,
      checks,
      styles,
      streamedDirection,
      disabled,
      enabled,
      errors,
      effects: effects.length,
    })
  } catch (error) {
    errors.push(String(error?.stack ?? error))
    badge.style.background = '#7a1f1f'
    badge.textContent = 'RTL visual test: FAILED'
    finish({ ok: false, mode: applyPlugin ? 'plugin' : 'baseline', checks, errors })
  }
})()
