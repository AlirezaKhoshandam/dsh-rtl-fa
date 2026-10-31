import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const bundleSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

/** Minimal React stand-in: the settings row is registered but never rendered. */
const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...props, children } }
  },
  useState(value) {
    return [value, () => {}]
  },
  useId() {
    return 'test-id'
  },
  useSyncExternalStore() {
    return undefined
  },
}

/**
 * Create a fake DSH client context and load the generated bundle exactly the
 * way the shell does: register a factory through `window.__ModuleLoader__`,
 * then call its exported `apply`.
 *
 * @returns {Promise<object>}
 */
async function loadPlugin() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <main data-chat-flow>
      <div data-chat-node-key="1">
        <p id="fa">متن فارسی برای تست پلاگین.</p>
        <p id="en">English stays LTR.</p>
      </div>
    </main>
    <div data-composer-seat><div data-composer-input contenteditable="true"><p>پیش‌نویس</p></div></div>
  </body></html>`, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  })

  let registration = null
  dom.window.__ModuleLoader__ = {
    load(entry) {
      registration = entry
    },
  }
  dom.window.eval(bundleSource)
  assert.equal(registration?.id, 'dsh-rtl-fa')

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
    async set(field, next) {
      return this.mutate([{ op: 'set', path: [field], value: next }])
    },
  }

  const effects = []
  const registrations = []
  const localeNamespaces = []
  const ctx = {
    configForms: { get: (id) => {
      assert.equal(id, 'ui-rtl-fa')
      return form
    } },
    effect(factory) {
      effects.push(factory())
    },
    locale: {
      register(namespace, dictionaries) {
        localeNamespaces.push([namespace, dictionaries])
        return () => {}
      },
    },
    slots: {
      inject(name, factory) {
        assert.equal(name, 'settings.general.item')
        registrations.push(factory())
        return () => {}
      },
      register(options, component) {
        return { options, component }
      },
    },
  }

  const exports = registration.factory((request) => {
    if (request === 'react') return React
    throw new Error(`unexpected external module: ${request}`)
  })
  exports.apply(ctx)

  return {
    dom,
    value,
    form,
    effects,
    registrations,
    localeNamespaces,
    close() {
      for (const dispose of effects.reverse()) dispose?.()
      dom.window.close()
    },
  }
}

test('the generated bundle registers the expected DSH module id', async () => {
  const plugin = await loadPlugin()
  plugin.close()
  assert.match(bundleSource, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(bundleSource, /id: "dsh-rtl-fa"/)
})

test('apply starts the engine for the existing transcript', async () => {
  const plugin = await loadPlugin()
  try {
    const doc = plugin.dom.window.document
    assert.equal(doc.querySelector('#fa').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#en').hasAttribute('dir'), false)
    assert.ok(doc.querySelector('style[data-plugin="dsh-rtl-fa"]'))
  } finally {
    plugin.close()
  }
})

test('registers the feature-owned Settings row and locale dictionary', async () => {
  const plugin = await loadPlugin()
  try {
    assert.equal(plugin.registrations.length, 1)
    const registration = plugin.registrations[0]
    assert.equal(registration.options.name, 'settings.general.item')
    assert.equal(registration.options.id, 'rtl-fa')
    assert.equal(registration.options.locale, 'dshRtlFa')
    assert.equal(typeof registration.options.inject().hooks.rtlSettings.getSnapshot, 'function')
    assert.equal(typeof registration.component, 'function')
    assert.equal(plugin.localeNamespaces[0][0], 'dshRtlFa')
    assert.ok(plugin.localeNamespaces[0][1].en)
    assert.ok(plugin.localeNamespaces[0][1].zh)
  } finally {
    plugin.close()
  }
})

test('renders the Settings row controls and forwards a switch gesture', () => {
  const pluginPromise = loadPlugin()
  return pluginPromise.then((plugin) => {
    try {
      const registration = plugin.registrations[0]
      const writes = []
      const snapshot = { enabled: true, mode: 'auto', composer: true, saving: false, error: null }
      const component = registration.component
      const tree = component({
        t: (key) => key,
        useRtlSettings: () => snapshot,
        setSettings: (patch) => {
          writes.push(patch)
          return Promise.resolve({ ok: true, error: null })
        },
      })
      const nodes = flatten(tree)
      const switches = nodes.filter((node) => node?.type === 'button' && node.props?.role === 'switch')
      const select = nodes.find((node) => node?.type === 'select')
      assert.equal(switches.length, 2)
      assert.equal(switches[0].props['aria-checked'], true)
      assert.equal(select.props.value, 'auto')
      assert.equal(nodes.filter((node) => node?.type === 'option').length, 3)
      switches[0].props.onClick()
      assert.equal(writes[0].enabled, false)
    } finally {
      plugin.close()
    }
  })
})

test('a settings write persists through configForms and disables the engine', async () => {
  const plugin = await loadPlugin()
  try {
    const doc = plugin.dom.window.document
    const registration = plugin.registrations[0]
    const actions = registration.options.inject()
    const result = await actions.setSettings({ enabled: false })
    assert.equal(result.ok, true)
    assert.equal(plugin.value.enabled, false)
    assert.equal(doc.querySelector('[data-dsh-rtl]'), null)
    assert.ok(doc.querySelector('style[data-plugin="dsh-rtl-fa"]'))

    const enabled = await actions.setSettings({ enabled: true, mode: 'rtl' })
    assert.equal(enabled.ok, true)
    assert.equal(doc.querySelector('#fa').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#en').hasAttribute('dir'), false)
  } finally {
    plugin.close()
  }
})

/**
 * Flatten the tiny React-element-shaped tree produced by the test stub.
 *
 * @param {object} node - root element.
 * @returns {Array<object>}
 */
function flatten(node) {
  if (node === null || node === undefined) return []
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (typeof node !== 'object') return []
  return [node, ...flatten(node.props?.children)]
}

test('a rejected Host write keeps the accepted value and reports an error', async () => {
  const plugin = await loadPlugin()
  try {
    plugin.form.mutate = async () => false
    const actions = plugin.registrations[0].options.inject()
    const result = await actions.setSettings({ enabled: false })
    assert.equal(result.ok, false)
    assert.equal(result.error, 'save-failed')
    assert.equal(plugin.value.enabled, true)
    assert.equal(plugin.registrations[0].options.inject().hooks.rtlSettings.getSnapshot().error, 'save-failed')
  } finally {
    plugin.close()
  }
})
