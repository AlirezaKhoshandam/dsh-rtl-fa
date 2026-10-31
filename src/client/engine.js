/**
 * DOM engine for dsh-rtl-fa.
 *
 * Design constraints:
 * - Never change the document, layout, or message-container direction. Only
 *   leaf text blocks receive `dir="rtl"`, so arbitrary English UI stays LTR.
 * - Work incrementally. A MutationObserver feeds changed roots; a single
 *   zero-delay task coalesces streaming deltas. At most one style rule block is
 *   installed, and removed nodes take their attributes with them.
 * - Respect author intent. A `dir` attribute, a `data-dsh-dir` override, code
 *   blocks, form controls, terminals, and `data-dsh-rtl-ignore` are boundaries.
 * - Be reversible. Every attribute this engine writes is removed on disable or
 *   plugin unload, with any original `dir` restored.
 */
import { detectDirection, hasRtlLetters, normalizeSettings } from './detection.js'

/** Package id used for the injected stylesheet. */
export const PLUGIN_ID = 'dsh-rtl-fa'

/** Attribute and selector names used across the engine and tests. */
export const ATTR_BLOCK = 'data-dsh-rtl'
export const ATTR_LIST = 'data-dsh-rtl-list'
export const ATTR_QUOTE = 'data-dsh-rtl-quote'
export const ATTR_ITEM = 'data-dsh-rtl-item'
export const ATTR_TABLE = 'data-dsh-rtl-table'
export const ATTR_IGNORE = 'data-dsh-rtl-ignore'
export const ATTR_MANUAL = 'data-dsh-dir'

/** Leaf blocks that can receive `dir` directly. */
const EXPLICIT_BLOCKS = new Set([
  'P',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TD',
  'TH',
  'DD',
  'DT',
  'FIGCAPTION',
  'CAPTION',
])

/** Content roots where generic block-level text (for example a user bubble) is safe to touch. */
const CONTENT_ROOT_SELECTOR = [
  '[data-chat-node-key]',
  '[data-chat-flow]',
  '[data-conversation-scroll]',
  '[data-composer-seat]',
  '[data-dsh-rtl-scope]',
  'article',
].join(', ')

/** Elements whose text must never participate in detection or be styled. */
const TEXT_STOP_SELECTOR = [
  'pre',
  'code',
  'kbd',
  'samp',
  'script',
  'style',
  'noscript',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  '.katex',
  '.katex-display',
  '.monaco-editor',
  '.xterm',
  '.cm-editor',
  `[${ATTR_IGNORE}]`,
].join(', ')

/** Interactive containers that must not be reshaped by a direction change. */
const INTERACTIVE_SELECTOR = 'button, [role="button"], label, summary, input, textarea, select'

/** Tags that make a container non-leaf even when CSS hides their display. */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
])

/** CSS display values that may form a leaf text block. */
const LEAF_DISPLAYS = new Set(['block', 'flow-root', 'list-item', 'table-cell'])

/** Stop tags for a list item's own label (nested lists have their own direction). */
const ITEM_STOP_SELECTOR = 'ul, ol, blockquote, pre, code, kbd, samp, textarea, select, option, svg, math, .katex'

/**
 * Direction-aware DOM controller.
 */
export class RtlEngine {
  /**
   * @param {object} options - engine dependencies.
   * @param {Document} options.document - browser document.
   * @param {Window} [options.window] - browser window (defaults to document.defaultView).
   * @param {object} [options.settings] - initial settings.
   * @param {string} [options.stylesText] - CSS injected by the client entry.
   * @param {{debug?: Function, warn?: Function}} [options.logger] - optional logger.
   */
  constructor({ document, window, settings = {}, stylesText = '', logger = {} }) {
    this.doc = document
    this.win = window ?? document.defaultView
    this.logger = logger
    this.stylesText = stylesText
    this.settings = normalizeSettings(settings)
    this.styles = null
    this.observer = null
    this.started = false
    this.observing = false
    this.frame = null
    this.pendingRoots = new Set()
    this.pendingComposers = new Set()
    this.fullScanPending = false
    this.originalDirections = new WeakMap()
    this.displayCache = new WeakMap()

    this.onMutations = this.onMutations.bind(this)
    this.onInput = this.onInput.bind(this)
    this.onFocusIn = this.onFocusIn.bind(this)
    this.flush = this.flush.bind(this)
  }

  /**
   * Install the stylesheet and begin observing. The stylesheet is needed even
   * while RTL rendering is disabled because it also styles the Settings row.
   *
   * @param {object} [settings] - optional settings to apply before starting.
   * @returns {void}
   */
  start(settings) {
    if (this.started) return
    if (settings !== undefined) this.settings = normalizeSettings(settings)
    if (!this.doc?.body) throw new Error('dsh-rtl-fa: the document body is not available')
    this.started = true
    this.installStyles()
    this.doc.addEventListener('input', this.onInput, true)
    this.doc.addEventListener('compositionend', this.onInput, true)
    this.doc.addEventListener('focusin', this.onFocusIn, true)
    if (this.settings.enabled) {
      this.observe()
      this.refreshAll()
    }
  }

  /**
   * Stop observing and remove every attribute and style this engine owns.
   *
   * @returns {void}
   */
  stop() {
    if (!this.started) return
    this.started = false
    this.disconnect()
    this.doc.removeEventListener('input', this.onInput, true)
    this.doc.removeEventListener('compositionend', this.onInput, true)
    this.doc.removeEventListener('focusin', this.onFocusIn, true)
    if (this.frame !== null) {
      this.cancelFrame(this.frame)
      this.frame = null
    }
    this.clearAll()
    this.styles?.remove()
    this.styles = null
    this.pendingRoots.clear()
    this.pendingComposers.clear()
    this.fullScanPending = false
  }

  /**
   * Apply a new immutable settings snapshot. Direction or composer changes
   * trigger a full, reversible rescan; enable/disable toggles observation.
   *
   * @param {object} settings - raw settings section.
   * @returns {void}
   */
  setSettings(settings) {
    const next = normalizeSettings(settings)
    const previous = this.settings
    this.settings = next
    if (!this.started) return

    if (!next.enabled) {
      this.disconnect()
      this.clearAll()
      return
    }

    if (!previous.enabled) {
      this.observe()
      this.refreshAll()
      return
    }

    if (previous.mode !== next.mode || previous.composer !== next.composer) {
      this.refreshAll()
    }
  }

  /**
   * Synchronously process every block. Used at startup and when a setting that
   * changes the outcome for existing content is edited.
   *
   * @returns {void}
   */
  refreshAll() {
    this.displayCache = new WeakMap()
    this.clearAll()
    if (!this.settings.enabled || !this.doc?.body) return
    const targets = new Set()
    this.collectTargets(this.doc.body, targets)
    for (const target of targets) this.applyTarget(target)
    const containers = new Set()
    for (const target of targets) this.collectContainers(target, containers)
    if (containers.size === 0) {
      for (const list of this.doc.querySelectorAll('ul, ol')) containers.add(list)
      for (const quote of this.doc.querySelectorAll('blockquote')) containers.add(quote)
      for (const table of this.doc.querySelectorAll('table')) containers.add(table)
    }
    this.syncContainers(containers)
    this.syncAllComposers()
  }

  /**
   * Process pending mutation roots now. Exposed so tests and diagnostics do not
   * have to wait for the scheduler.
   *
   * @returns {void}
   */
  flushNow() {
    if (this.frame !== null) {
      this.cancelFrame(this.frame)
      this.frame = null
    }
    this.flush()
  }

  /**
   * Number of blocks currently carrying a plugin-written direction.
   *
   * @returns {number}
   */
  get appliedCount() {
    return this.doc.querySelectorAll(`[${ATTR_BLOCK}], [${ATTR_LIST}], [${ATTR_QUOTE}], [${ATTR_ITEM}], [${ATTR_TABLE}]`).length
  }

  /** @private */
  installStyles() {
    if (this.doc.querySelector(`style[data-plugin="${PLUGIN_ID}"]`)) return
    const style = this.doc.createElement('style')
    style.dataset.plugin = PLUGIN_ID
    style.dataset.pluginCss = `${PLUGIN_ID}/styles.css`
    style.textContent = this.stylesText
    this.doc.head.appendChild(style)
    this.styles = style
  }

  /** @private */
  observe() {
    if (this.observing || !this.doc?.body) return
    const Observer = this.win?.MutationObserver ?? globalThis.MutationObserver
    if (typeof Observer !== 'function') {
      this.logger.warn?.('dsh-rtl-fa: MutationObserver is unavailable; streaming updates will not be re-evaluated')
      return
    }
    this.observer = new Observer(this.onMutations)
    this.observer.observe(this.doc.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })
    this.observing = true
  }

  /** @private */
  disconnect() {
    this.observer?.disconnect()
    this.observer = null
    this.observing = false
  }

  /** @private */
  onInput(event) {
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement
    const composer = target?.closest?.('[data-composer-input]')
    if (composer === null || composer === undefined) return
    this.pendingComposers.add(composer)
    this.schedule()
  }

  /** @private */
  onFocusIn(event) {
    const target = event.target?.nodeType === 1 ? event.target : null
    const composer = target?.closest?.('[data-composer-input]')
    if (composer === null || composer === undefined) return
    this.pendingComposers.add(composer)
    this.schedule()
  }

  /** @private */
  onMutations(records) {
    for (const record of records) {
      if (record.type === 'characterData') {
        this.addRoot(record.target.parentElement)
        this.addComposer(record.target.parentElement)
        continue
      }

      this.addRoot(record.target)
      this.addComposer(record.target)
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) {
          this.addRoot(node)
          this.addComposer(node)
        } else if (node.nodeType === 3) {
          this.addRoot(node.parentElement)
          this.addComposer(node.parentElement)
        }
      }
    }
    this.schedule()
  }

  /** @private */
  addRoot(node) {
    if (!node || node.nodeType !== 1 || !node.isConnected) return
    if (node === this.doc.body) {
      this.fullScanPending = true
      return
    }
    this.pendingRoots.add(node)
    if (this.pendingRoots.size > 250) {
      this.pendingRoots.clear()
      this.fullScanPending = true
    }
  }

  /** @private */
  addComposer(node) {
    const composer = node?.closest?.('[data-composer-input]')
    if (composer !== null && composer !== undefined) this.pendingComposers.add(composer)
  }

  /** @private */
  schedule() {
    if (!this.started || !this.settings.enabled || this.frame !== null) return
    /*
     * A zero-delay task coalesces one streaming burst without waiting for a
     * compositor frame. `requestAnimationFrame` is throttled or suspended in
     * background windows and headless captures, which would leave a late
     * streamed chunk misaligned until the user returns to the page.
     */
    this.frame = this.win.setTimeout(this.flush, 0)
  }

  /** @private */
  flush() {
    this.frame = null
    if (!this.started || !this.settings.enabled) return

    if (this.fullScanPending) {
      this.fullScanPending = false
      this.pendingRoots.clear()
      this.pendingComposers.clear()
      this.refreshAll()
      return
    }

    if (this.pendingRoots.size === 0 && this.pendingComposers.size === 0) return

    this.displayCache = new WeakMap()
    const roots = [...this.pendingRoots].filter((root) => root.isConnected)
    const composers = [...this.pendingComposers].filter((root) => root.isConnected)
    this.pendingRoots.clear()
    this.pendingComposers.clear()

    const targets = new Set()
    for (const root of roots) {
      this.collectDirtyBlock(root, targets)
      this.collectTargets(root, targets)
    }
    for (const target of targets) this.applyTarget(target)

    const containers = new Set()
    for (const target of targets) this.collectContainers(target, containers)
    for (const root of roots) {
      if (root.matches?.('ul, ol, blockquote')) containers.add(root)
      const list = root.closest?.('ul, ol')
      if (list) containers.add(list)
      const quote = root.closest?.('blockquote')
      if (quote) containers.add(quote)
    }
    this.syncContainers(containers)

    for (const composer of composers) this.syncComposer(composer)
  }

  /**
   * Collect every leaf block under `root` that contains non-whitespace text.
   * Direction is decided per block, after the whole block is known, which is
   * why a block can switch from RTL to LTR as a streamed sentence grows.
   *
   * @param {Element} root - subtree root.
   * @param {Set<Element>} out - accumulator of leaf blocks.
   * @returns {void}
   * @private
   */
  collectTargets(root, out) {
    if (!root || !root.isConnected) return
    if (root.nodeType === 3) {
      const target = this.targetFor(root)
      if (target) out.add(target)
      return
    }
    if (root.nodeType !== 1) return

    const walker = this.doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode: (node) => {
        if (node.nodeValue === null || node.nodeValue.trim() === '') return 2 /* FILTER_REJECT */
        return 1 /* FILTER_ACCEPT */
      },
    })

    let node = walker.nextNode()
    while (node !== null) {
      const target = this.targetFor(node)
      if (target) out.add(target)
      node = walker.nextNode()
    }
  }

  /**
   * A mutation can remove the last text node of a block. In that case the text
   * walker sees nothing and the previous RTL marker would otherwise survive.
   * Add the nearest explicit/generic block as a dirty target even when empty.
   *
   * @param {Element} root - mutation root.
   * @param {Set<Element>} out - target accumulator.
   * @returns {void}
   * @private
   */
  collectDirtyBlock(root, out) {
    let element = root?.nodeType === 1 ? root : root?.parentElement
    while (element && element !== this.doc.body && element !== this.doc.documentElement) {
      if (this.isExcluded(element)) return
      if (EXPLICIT_BLOCKS.has(element.tagName)) {
        out.add(element)
        return
      }
      if (this.isLeafTextBlock(element)) {
        out.add(element)
        return
      }
      element = element.parentElement
    }
  }

  /**
   * Resolve the nearest safe text block for one text node.
   *
   * Explicit semantic blocks win. A generic block (the user bubble is a plain
   * `div` in DSH) is accepted only inside a conversation content root, so
   * chrome such as the sidebar or menus is not reshaped.
   *
   * @param {Text} textNode - candidate text node.
   * @returns {Element|null}
   * @private
   */
  targetFor(textNode) {
    let element = textNode.parentElement
    let fallback = null

    while (element && element !== this.doc.body && element !== this.doc.documentElement) {
      if (this.isExcluded(element)) return null
      if (this.isForeignDirection(element)) return null
      if (element.matches(INTERACTIVE_SELECTOR)) return null

      if (EXPLICIT_BLOCKS.has(element.tagName)) return element

      if (fallback === null && this.isLeafTextBlock(element)) fallback = element
      element = element.parentElement
    }

    if (fallback !== null && fallback.closest(CONTENT_ROOT_SELECTOR) !== null) return fallback
    return null
  }

  /**
   * Whether an element is a boundary for the generic scanner.
   *
   * @param {Element} element - candidate ancestor.
   * @returns {boolean}
   * @private
   */
  isExcluded(element) {
    if (element.matches(TEXT_STOP_SELECTOR)) return true
    if (element.closest(`[${ATTR_IGNORE}]`) !== null) return true
    if (element.isContentEditable) return true
    if (element.closest('[contenteditable="true"]') !== null) return true
    return false
  }

  /**
   * Determine whether a block is a leaf container with only inline content.
   *
   * @param {Element} element - candidate generic block.
   * @returns {boolean}
   * @private
   */
  isLeafTextBlock(element) {
    if (element.closest(CONTENT_ROOT_SELECTOR) === null) return false
    if (!LEAF_DISPLAYS.has(this.displayOf(element))) return false
    for (const child of element.children) {
      if (BLOCK_TAGS.has(child.tagName)) return false
      if (['flex', 'grid', 'table', 'table-row', 'table-caption'].includes(this.displayOf(child))) return false
    }
    return true
  }

  /**
   * Cached `display` lookup for one batch.
   *
   * @param {Element} element - element to inspect.
   * @returns {string}
   * @private
   */
  displayOf(element) {
    let display = this.displayCache.get(element)
    if (display === undefined) {
      display = this.win?.getComputedStyle ? this.win.getComputedStyle(element).display : ''
      this.displayCache.set(element, display)
    }
    return display
  }

  /**
   * Whether a `dir` was supplied by the host or an earlier plugin. Our own
   * markers are not foreign and can be updated in place.
   *
   * @param {Element} element - candidate element.
   * @returns {boolean}
   * @private
   */
  isForeignDirection(element) {
    let node = element
    while (node && node !== this.doc.body && node !== this.doc.documentElement) {
      const ours = node.hasAttribute(ATTR_BLOCK)
        || node.hasAttribute(ATTR_LIST)
        || node.hasAttribute(ATTR_QUOTE)
        || node.hasAttribute(ATTR_TABLE)
      if (node.hasAttribute('dir') && !ours) return true
      node = node.parentElement
    }
    return false
  }

  /**
   * Apply the detected/manual direction to one leaf block.
   *
   * @param {Element} element - leaf block.
   * @returns {void}
   * @private
   */
  applyTarget(element) {
    if (!element.isConnected) return
    if (this.isForeignDirection(element) && !this.hasManualOverride(element)) {
      this.clearBlockDirection(element)
      return
    }

    const manual = this.closestManualDirection(element)
    let direction
    if (manual === 'rtl' || manual === 'ltr') {
      direction = manual
    } else {
      const text = this.extractText(element, element.tagName === 'LI' ? 'item' : 'leaf')
      if (text.trim() === '') {
        this.clearBlockDirection(element)
        return
      }
      direction = detectDirection(text, { mode: this.settings.mode }).direction
    }

    if (direction === 'rtl') this.setBlockDirection(element, 'rtl')
    else this.clearBlockDirection(element)
  }

  /**
   * The nearest explicit per-block override wins.
   *
   * @param {Element} element - content block.
   * @returns {'rtl'|'ltr'|'auto'|null}
   * @private
   */
  closestManualDirection(element) {
    const owner = element.closest(`[${ATTR_MANUAL}]`) ?? element
    if (!owner?.hasAttribute?.(ATTR_MANUAL)) return null
    const value = owner.getAttribute(ATTR_MANUAL)
    return value === 'rtl' || value === 'ltr' || value === 'auto' ? value : null
  }

  /**
   * @param {Element} element - block.
   * @returns {boolean}
   * @private
   */
  hasManualOverride(element) {
    return this.closestManualDirection(element) !== null
  }

  /**
   * @param {Element} element - leaf block.
   * @param {'rtl'|'ltr'} direction - direction to write.
   * @returns {void}
   * @private
   */
  setBlockDirection(element, direction) {
    if (this.isForeignDirection(element) && !this.hasManualOverride(element)) return
    if (!this.originalDirections.has(element)) this.originalDirections.set(element, element.getAttribute('dir'))
    element.setAttribute('dir', direction)
    element.setAttribute(ATTR_BLOCK, direction)
  }

  /** @private */
  clearBlockDirection(element) {
    if (!element.hasAttribute(ATTR_BLOCK)) return
    this.restoreDirection(element)
    element.removeAttribute(ATTR_BLOCK)
  }

  /**
   * Mark a list's direction (only for lists where every non-empty item is RTL,
   * plus an explicit LTR reset for a non-RTL nested list).
   *
   * @param {Element} list - ul/ol.
   * @param {'rtl'|'ltr'} direction - list direction.
   * @returns {void}
   * @private
   */
  setListDirection(list, direction) {
    if (this.isForeignDirection(list)) return
    if (!this.originalDirections.has(list)) this.originalDirections.set(list, list.getAttribute('dir'))
    list.setAttribute('dir', direction)
    list.setAttribute(ATTR_LIST, direction)
  }

  /** @private */
  clearListDirection(list) {
    if (!list.hasAttribute(ATTR_LIST)) return
    this.restoreDirection(list)
    list.removeAttribute(ATTR_LIST)
  }

  /**
   * Restore the `dir` value that existed before the plugin touched an element.
   *
   * @param {Element} element - element whose direction was written.
   * @returns {void}
   * @private
   */
  restoreDirection(element) {
    if (!this.originalDirections.has(element)) return
    const original = this.originalDirections.get(element)
    if (original === null) element.removeAttribute('dir')
    else element.setAttribute('dir', original)
    this.originalDirections.delete(element)
  }

  /**
   * Classify list items and move a list's direction only when every non-empty
   * item is RTL. Mixed lists keep their original block direction so English
   * items cannot inherit RTL from a Persian sibling; the padding rule still
   * reserves both gutters for their markers.
   *
   * @param {Element} list - ul/ol.
   * @returns {void}
   * @private
   */
  syncList(list) {
    if (!list.isConnected || !list.matches('ul, ol')) return
    if (this.isForeignDirection(list) || list.closest(`[${ATTR_IGNORE}]`) !== null) return

    const items = [...list.children].filter((child) => child.tagName === 'LI')
    const states = items.map((item) => this.listItemDirection(item))
    const nonEmpty = states.filter((state) => state !== null)
    const allRtl = nonEmpty.length > 0 && nonEmpty.every((state) => state === 'rtl')
    const parentRtl = list.parentElement?.closest(`[${ATTR_LIST}="rtl"]`) ?? null

    if (allRtl) {
      this.setListDirection(list, 'rtl')
    } else if (parentRtl !== null && parentRtl !== list) {
      /*
       * A nested list inherits the parent's CSS direction. Reset it to LTR so
       * an English nested list stays LTR; its own RTL items still carry their
       * own leaf direction.
       */
      this.setListDirection(list, 'ltr')
    } else {
      this.clearListDirection(list)
    }

    for (const [index, item] of items.entries()) {
      const rtl = states[index] === 'rtl'
      if (allRtl || !rtl) item.removeAttribute(ATTR_ITEM)
      else item.setAttribute(ATTR_ITEM, 'rtl')
    }
  }

  /**
   * Direction of one list item's own label. Nested lists and blockquotes are
   * excluded so a Persian parent does not become LTR merely because it has an
   * English code sample or sub-list.
   *
   * @param {Element} item - li element.
   * @returns {'rtl'|'ltr'|null}
   * @private
   */
  listItemDirection(item) {
    const text = this.extractText(item, 'item')
    if (text.trim() === '') return null
    return detectDirection(text, { mode: this.settings.mode }).direction
  }

  /**
   * A blockquote is decorated without a `dir` attribute. Its border and
   * inline padding move to the right, while each paragraph inside keeps its
   * independently detected direction.
   *
   * @param {Element} quote - blockquote element.
   * @returns {void}
   * @private
   */
  syncQuote(quote) {
    if (!quote.isConnected || this.isForeignDirection(quote)) return
    if (quote.closest(`[${ATTR_IGNORE}]`) !== null) return
    const text = this.extractText(quote, 'container')
    const direction = text.trim() === '' ? 'ltr' : detectDirection(text, { mode: this.settings.mode }).direction
    if (direction === 'rtl') quote.setAttribute(ATTR_QUOTE, 'rtl')
    else quote.removeAttribute(ATTR_QUOTE)
  }

  /**
   * Process the set of list/blockquote containers affected by a batch.
   *
   * @param {Set<Element>} containers - affected containers.
   * @returns {void}
   * @private
   */
  syncContainers(containers) {
    const ordered = [...containers].filter((element) => element.isConnected).sort(compareDocumentOrder)
    for (const element of ordered) {
      if (element.matches('ul, ol')) this.syncList(element)
      else if (element.matches('blockquote')) this.syncQuote(element)
      else if (element.matches('table')) this.syncTable(element)
    }
  }

  /**
   * A table whose cells are predominantly RTL also reverses its column order,
   * which is what a Persian/Arabic reader expects. Cells keep their own
   * direction: an English cell is explicitly reset to LTR so table-level
   * `direction: rtl` cannot turn its content into a right-aligned RTL run.
   *
   * @param {Element} table - table element.
   * @returns {void}
   * @private
   */
  syncTable(table) {
    if (!table.isConnected || this.isForeignDirection(table)) return
    if (table.closest(`[${ATTR_IGNORE}]`) !== null) return
    const manual = this.closestManualDirection(table)
    if (manual === 'ltr') {
      this.clearTableDirection(table)
      for (const cell of table.querySelectorAll('th, td')) {
        if (cell.getAttribute(ATTR_BLOCK) === 'ltr') this.clearBlockDirection(cell)
      }
      return
    }
    if (manual === 'rtl') {
      this.setTableDirection(table, 'rtl')
      return
    }

    const cells = [...table.querySelectorAll('th, td')]
    const states = cells.map((cell) => {
      const text = this.extractText(cell, 'container')
      return text.trim() === '' ? null : detectDirection(text, { mode: this.settings.mode }).direction
    })
    const rtlCells = states.filter((state) => state === 'rtl').length
    const ltrCells = states.filter((state) => state === 'ltr').length
    const majorityRtl = rtlCells > 0 && rtlCells > ltrCells

    if (majorityRtl) {
      this.setTableDirection(table, 'rtl')
      for (const [index, cell] of cells.entries()) {
        if (states[index] === 'rtl') this.setBlockDirection(cell, 'rtl')
        else if (states[index] === 'ltr') this.setBlockDirection(cell, 'ltr')
      }
      return
    }

    this.clearTableDirection(table)
    /*
     * Remove only the LTR resets this pass added for a previous RTL table. The
     * generic scanner never writes `ltr`, so no unrelated block is affected.
     */
    for (const cell of cells) {
      if (cell.getAttribute(ATTR_BLOCK) === 'ltr' && !this.hasManualOverride(cell)) this.clearBlockDirection(cell)
    }
  }

  /**
   * Write a table's block direction. Tables use their own marker so the
   * per-block CSS rules do not accidentally style table internals.
   *
   * @param {Element} table - table element.
   * @param {'rtl'|'ltr'} direction - direction to write.
   * @returns {void}
   * @private
   */
  setTableDirection(table, direction) {
    if (this.isForeignDirection(table)) return
    if (!this.originalDirections.has(table)) this.originalDirections.set(table, table.getAttribute('dir'))
    table.setAttribute('dir', direction)
    table.setAttribute(ATTR_TABLE, direction)
  }

  /** @private */
  clearTableDirection(table) {
    if (!table.hasAttribute(ATTR_TABLE)) return
    this.restoreDirection(table)
    table.removeAttribute(ATTR_TABLE)
  }

  /**
   * Add all list/blockquote ancestors of a target to a batch.
   *
   * @param {Element} target - leaf block.
   * @param {Set<Element>} out - accumulator.
   * @returns {void}
   * @private
   */
  collectContainers(target, out) {
    const list = target.closest('ul, ol')
    if (list) {
      out.add(list)
      const outer = list.parentElement?.closest('ul, ol')
      if (outer) out.add(outer)
    }
    const quote = target.closest('blockquote')
    if (quote) out.add(quote)
    const table = target.closest('table')
    if (table) out.add(table)
  }

  /**
   * Sync every composer input. Called on settings changes and full rescans.
   *
   * @returns {void}
   * @private
   */
  syncAllComposers() {
    for (const composer of this.doc.querySelectorAll('[data-composer-input]')) this.syncComposer(composer)
  }

  /**
   * Detect the message editor's direction and write it to the contenteditable
   * root. Streamed Lexical mutations and input events both feed this method.
   *
   * @param {Element} composer - contenteditable root.
   * @returns {void}
   * @private
   */
  syncComposer(composer) {
    const editable = composer.isContentEditable || composer.getAttribute('contenteditable') === 'true'
    if (!composer.isConnected || !editable || !this.settings.composer || composer.closest(`[${ATTR_IGNORE}]`) !== null) {
      this.clearBlockDirection(composer)
      return
    }
    if (this.isForeignDirection(composer)) {
      this.clearBlockDirection(composer)
      return
    }
    const text = this.extractText(composer, 'container')
    const direction = text.trim() === '' ? 'ltr' : detectDirection(text, { mode: this.settings.mode }).direction
    if (direction === 'rtl') this.setBlockDirection(composer, 'rtl')
    else this.clearBlockDirection(composer)
  }

  /**
   * Remove every marker and restore original `dir` values. Called when the
   * plugin is disabled or unloaded; safe to run repeatedly.
   *
   * @returns {void}
   * @private
   */
  clearAll() {
    for (const element of this.doc.querySelectorAll(`[${ATTR_BLOCK}], [${ATTR_LIST}], [${ATTR_QUOTE}], [${ATTR_ITEM}], [${ATTR_TABLE}]`)) {
      if (element.hasAttribute(ATTR_BLOCK) || element.hasAttribute(ATTR_LIST) || element.hasAttribute(ATTR_TABLE)) {
        this.restoreDirection(element)
      }
      element.removeAttribute(ATTR_BLOCK)
      element.removeAttribute(ATTR_LIST)
      element.removeAttribute(ATTR_QUOTE)
      element.removeAttribute(ATTR_ITEM)
      element.removeAttribute(ATTR_TABLE)
    }
    this.originalDirections = new WeakMap()
    this.displayCache = new WeakMap()
  }

  /**
   * Return the visible prose of a block for detection.
   *
   * Code, KaTeX, URL-only labels and form controls never bias the language
   * ratio. `leaf` ignores nested block descendants; `item` ignores nested
   * list/quote/code blocks; `container` includes all prose but still excludes
   * code and URL-only labels.
   *
   * @param {Element} root - block/container.
   * @param {'leaf'|'item'|'container'} mode - extraction policy.
   * @returns {string}
   * @private
   */
  extractText(root, mode) {
    const walker = this.doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode: (node) => {
        if (node.nodeValue === null || node.nodeValue.trim() === '') return 2 /* FILTER_REJECT */
        let ancestor = node.parentElement
        while (ancestor !== null && ancestor !== root) {
          if (ancestor.matches(TEXT_STOP_SELECTOR)) return 2
          if (mode === 'leaf' && EXPLICIT_BLOCKS.has(ancestor.tagName)) return 2
          if (mode === 'item' && ancestor.matches(ITEM_STOP_SELECTOR)) return 2
          ancestor = ancestor.parentElement
        }
        if (isUrlOnlyAnchorText(node)) return 2
        return 1
      },
    })

    const parts = []
    let node = walker.nextNode()
    while (node !== null) {
      parts.push(node.nodeValue)
      node = walker.nextNode()
    }
    return parts.join(' ')
  }

  /** @private */
  cancelFrame(handle) {
    this.win.clearTimeout(handle)
  }
}

/**
 * Keep two elements in stable document order so nested list decisions are made
 * from the outside in.
 *
 * @param {Element} left - first element.
 * @param {Element} right - second element.
 * @returns {number}
 */
function compareDocumentOrder(left, right) {
  if (left === right) return 0
  return left.compareDocumentPosition(right) & 4 /* DOCUMENT_POSITION_FOLLOWING */ ? -1 : 1
}

/**
 * A link whose entire label is a URL or e-mail address is an LTR technical
 * token, not natural-language evidence. Persian link labels still count.
 *
 * @param {Text} node - text node.
 * @returns {boolean}
 */
function isUrlOnlyAnchorText(node) {
  const anchor = node.parentElement?.closest('a')
  if (anchor === null || anchor === undefined) return false
  const label = anchor.textContent?.trim() ?? ''
  if (label === '') return false
  return /^(?:https?:\/\/|mailto:|www\.)\S+$/iu.test(label) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(label)
}

export { detectDirection, hasRtlLetters }

