import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  ATTR_BLOCK,
  ATTR_ITEM,
  ATTR_LIST,
  ATTR_QUOTE,
  ATTR_TABLE,
  RtlEngine,
} from '../src/client/engine.js'

const stylesText = await readFile(new URL('../src/client/styles.css', import.meta.url), 'utf8')

const fixture = `<!doctype html><html><body>
  <main data-chat-flow>
    <div data-chat-node-key="user-1">
      <div id="bubble">برای اجرای دستور npm install ابتدا وارد پوشه پروژه شوید.</div>
      <p id="fa">متن کاملاً فارسی برای آزمایش.</p>
      <p id="en">This paragraph is entirely English and must stay LTR.</p>
      <p id="mixed">DeepSeek Harness از مدل‌های پیشرفته پشتیبانی می‌کند.</p>
      <p id="inline">برای نصب از <code>npm install</code> استفاده کنید.</p>
      <p id="url">مستندات در <a href="https://example.com/install">https://example.com/install</a> است.</p>
      <p id="authored" dir="ltr">این متن باید با dir نویسنده باقی بماند.</p>
      <p id="manual" data-dsh-dir="ltr">این هم باید به‌صورت دستی LTR بماند.</p>
      <p id="stream">Streaming starts in English.</p>
      <pre id="pre"><code id="code">npm install</code></pre>
      <ul id="mixedList">
        <li id="mixedFa">مورد فارسی</li>
        <li id="mixedEn">English item</li>
      </ul>
      <ul id="allList">
        <li id="allFa1">مورد اول</li>
        <li id="allFa2">مورد دوم</li>
      </ul>
      <blockquote id="quote"><p id="quoteP">نقل‌قول فارسی برای آزمایش.</p></blockquote>
      <table id="table"><tbody><tr><td id="cell">خانه فارسی</td><td id="cell2">مورد دوم</td><td id="cellEn">English cell</td></tr></tbody></table>
    </div>
  </main>
  <div data-composer-seat>
    <div id="composer" data-composer-input contenteditable="true" role="textbox">
      <p id="draft">پیش‌نویس فارسی</p>
    </div>
  </div>
  <div data-chat-rtl-ignore-note="outside"></div>
</body></html>`

/**
 * Build an engine with a fresh JSDOM document.
 *
 * @param {object} [settings] - engine settings override.
 * @returns {{dom: JSDOM, doc: Document, engine: RtlEngine, close: Function}}
 */
function setup(settings = {}) {
  const dom = new JSDOM(fixture, { url: 'http://localhost/', pretendToBeVisual: true })
  const doc = dom.window.document
  const engine = new RtlEngine({
    document: doc,
    window: dom.window,
    stylesText,
    settings: { enabled: true, mode: 'auto', composer: true, ...settings },
  })
  engine.start()
  return {
    dom,
    doc,
    engine,
    close: () => {
      engine.stop()
      dom.window.close()
    },
  }
}

/** Wait for MutationObserver microtasks and the engine's rAF scheduler. */
async function settle(engine) {
  await new Promise((resolve) => setTimeout(resolve, 0))
  engine.flushNow()
}

test('marks Persian blocks and leaves English blocks untouched', () => {
  const { doc, close } = setup()
  try {
    assert.equal(doc.querySelector('#fa').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#fa').getAttribute(ATTR_BLOCK), 'rtl')
    assert.equal(doc.querySelector('#en').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#en').hasAttribute(ATTR_BLOCK), false)
    assert.equal(doc.querySelector('#mixed').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#bubble').getAttribute('dir'), 'rtl')
  } finally {
    close()
  }
})

test('does not touch code, inline code, URL-only labels or authored dir', () => {
  const { doc, close } = setup()
  try {
    assert.equal(doc.querySelector('#pre').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#code').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#inline').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#inline code').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#url').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#url a').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#authored').getAttribute('dir'), 'ltr')
    assert.equal(doc.querySelector('#authored').hasAttribute(ATTR_BLOCK), false)
    assert.equal(doc.querySelector('#manual').hasAttribute('dir'), false)
  } finally {
    close()
  }
})

test('moves an all-RTL list marker side and keeps a mixed list neutral', () => {
  const { doc, close } = setup()
  try {
    assert.equal(doc.querySelector('#allList').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#allList').getAttribute(ATTR_LIST), 'rtl')
    assert.equal(doc.querySelector('#mixedList').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#mixedFa').getAttribute(ATTR_ITEM), 'rtl')
    assert.equal(doc.querySelector('#mixedEn').hasAttribute(ATTR_ITEM), false)
  } finally {
    close()
  }
})

test('decorates a blockquote without forcing direction on its children', () => {
  const { doc, close } = setup()
  try {
    assert.equal(doc.querySelector('#quote').getAttribute(ATTR_QUOTE), 'rtl')
    assert.equal(doc.querySelector('#quote').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#quoteP').getAttribute('dir'), 'rtl')
  } finally {
    close()
  }
})

test('reverses a predominantly RTL table and resets its English cells', () => {
  const { doc, close } = setup()
  try {
    assert.equal(doc.querySelector('#table').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#table').getAttribute(ATTR_TABLE), 'rtl')
    assert.equal(doc.querySelector('#cell').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#cellEn').getAttribute('dir'), 'ltr')
    assert.equal(doc.querySelector('#cellEn').getAttribute(ATTR_BLOCK), 'ltr')
  } finally {
    close()
  }
})

test('propagates direction to the composer and updates on input', async () => {
  const { doc, engine, close } = setup()
  try {
    assert.equal(doc.querySelector('#composer').getAttribute('dir'), 'rtl')
    doc.querySelector('#draft').textContent = 'English draft only'
    doc.querySelector('#composer').dispatchEvent(new (doc.defaultView.Event)('input', { bubbles: true }))
    await settle(engine)
    assert.equal(doc.querySelector('#composer').hasAttribute('dir'), false)
  } finally {
    close()
  }
})

test('streaming mutations re-evaluate one block in both directions', async () => {
  const { doc, engine, close } = setup()
  try {
    const stream = doc.querySelector('#stream')
    assert.equal(stream.hasAttribute('dir'), false)

    stream.textContent = 'اکنون متن فارسی است.'
    await settle(engine)
    assert.equal(stream.getAttribute('dir'), 'rtl')

    stream.textContent = 'Back to English.'
    await settle(engine)
    assert.equal(stream.hasAttribute('dir'), false)
  } finally {
    close()
  }
})

test('disabling removes every marker but keeps the settings stylesheet', () => {
  const { doc, engine, close } = setup()
  try {
    assert.ok(doc.querySelector('style[data-plugin="dsh-rtl-fa"]'))
    engine.setSettings({ enabled: false })
    assert.equal(doc.querySelector(`[${ATTR_BLOCK}]`), null)
    assert.equal(doc.querySelector(`[${ATTR_LIST}]`), null)
    assert.equal(doc.querySelector(`[${ATTR_QUOTE}]`), null)
    assert.ok(doc.querySelector('style[data-plugin="dsh-rtl-fa"]'))
  } finally {
    close()
  }
})

test('manual LTR and force-RTL policies are reversible', () => {
  const { doc, engine, close } = setup()
  try {
    engine.setSettings({ enabled: true, mode: 'ltr', composer: true })
    assert.equal(doc.querySelector(`[${ATTR_BLOCK}]`), null)

    engine.setSettings({ enabled: true, mode: 'rtl', composer: true })
    assert.equal(doc.querySelector('#fa').getAttribute('dir'), 'rtl')
    assert.equal(doc.querySelector('#en').hasAttribute('dir'), false)

    engine.setSettings({ enabled: true, mode: 'auto', composer: true })
    assert.equal(doc.querySelector('#fa').getAttribute('dir'), 'rtl')
  } finally {
    close()
  }
})

test('stop removes all attributes and the injected stylesheet', () => {
  const { doc, engine, close } = setup()
  try {
    engine.stop()
    assert.equal(doc.querySelector(`[${ATTR_BLOCK}]`), null)
    assert.equal(doc.querySelector('style[data-plugin="dsh-rtl-fa"]'), null)
  } finally {
    close()
  }
})

test('does not style generic text outside a conversation content root', () => {
  const dom = new JSDOM('<!doctype html><body><aside><div id="sidebar">متن فارسی در نوار کناری</div></aside></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const engine = new RtlEngine({
    document: dom.window.document,
    window: dom.window,
    stylesText,
    settings: { enabled: true, mode: 'auto', composer: true },
  })
  engine.start()
  try {
    assert.equal(dom.window.document.querySelector('#sidebar').hasAttribute('dir'), false)
  } finally {
    engine.stop()
    dom.window.close()
  }
})
