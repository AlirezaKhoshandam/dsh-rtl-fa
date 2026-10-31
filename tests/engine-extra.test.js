import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { ATTR_BLOCK, ATTR_TABLE, RtlEngine } from '../src/client/engine.js'

const html = `<!doctype html><html><body>
  <main data-chat-flow>
    <div data-chat-node-key="1">
      <p id="ignored" data-dsh-rtl-ignore>این متن نباید تغییر کند.</p>
      <div data-dsh-rtl-ignore><p id="ignoredChild">نه این یکی.</p></div>
      <table id="manualTable" data-dsh-dir="ltr">
        <tbody><tr><td id="manualCell1">متن فارسی</td><td id="manualCell2">متن فارسی دوم</td></tr></tbody>
      </table>
      <table id="manualRtlTable" data-dsh-dir="rtl">
        <tbody><tr><td id="manualRtlCell">English cell</td></tr></tbody>
      </table>
    </div>
  </main>
</body></html>`

test('honours data-dsh-rtl-ignore and manual table direction', () => {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true })
  const doc = dom.window.document
  const engine = new RtlEngine({
    document: doc,
    window: dom.window,
    stylesText: '',
    settings: { enabled: true, mode: 'auto', composer: true },
  })
  engine.start()
  try {
    assert.equal(doc.querySelector('#ignored').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#ignoredChild').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#manualTable').hasAttribute('dir'), false)
    assert.equal(doc.querySelector('#manualCell1').hasAttribute(ATTR_BLOCK), false)
    assert.equal(doc.querySelector('#manualRtlTable').getAttribute(ATTR_TABLE), 'rtl')
    assert.equal(doc.querySelector('#manualRtlCell').getAttribute('dir'), 'rtl')
  } finally {
    engine.stop()
    dom.window.close()
  }
})
