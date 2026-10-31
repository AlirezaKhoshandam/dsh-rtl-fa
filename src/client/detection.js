/**
 * Pure language/direction detection for dsh-rtl-fa.
 *
 * The algorithm deliberately works on Unicode script properties rather than a
 * hard-coded Persian word list. It therefore covers Persian, Arabic, Urdu,
 * Hebrew and the other RTL scripts supported by the JavaScript RegExp engine,
 * while remaining independent of the UI language.
 */

/** Settings defaults shared by the browser controller and tests. */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  mode: 'auto',
  composer: true,
})

/** Modes accepted by the engine. */
export const MODES = Object.freeze(['auto', 'rtl', 'ltr'])

/**
 * Unicode scripts written right-to-left. \p{Script=...} is used instead of a
 * hand-maintained code-point range so newly assigned letters in an existing
 * script are covered by the browser's Unicode tables.
 */
const RTL_SCRIPT = /\p{Script=Arabic}|\p{Script=Hebrew}|\p{Script=Syriac}|\p{Script=Thaana}|\p{Script=Nko}|\p{Script=Samaritan}|\p{Script=Mandaic}|\p{Script=Adlam}/u

/** Any Unicode letter, used to distinguish words from digits/punctuation. */
const LETTER = /\p{L}/u

/** Letters that are not RTL; counted to estimate the paragraph's dominant script. */
const LTR_LETTER = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/**
 * Normalize persisted Host values into the small settings object the engine
 * consumes. Hand-edited YAML is untrusted input, so every field is validated.
 *
 * @param {unknown} input - raw config section.
 * @returns {{enabled: boolean, mode: 'auto'|'rtl'|'ltr', composer: boolean}}
 */
export function normalizeSettings(input) {
  const value = input !== null && typeof input === 'object' ? input : {}
  return Object.freeze({
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SETTINGS.enabled,
    mode: MODES.includes(value.mode) ? value.mode : DEFAULT_SETTINGS.mode,
    composer: typeof value.composer === 'boolean' ? value.composer : DEFAULT_SETTINGS.composer,
  })
}

/**
 * Detect one text block's direction.
 *
 * `auto` is not a naive first-strong-character test: a paragraph that starts
 * with an English product name and continues in Persian should still be RTL.
 * It is also not a plain ratio test, because a Persian sentence followed by a
 * long English quotation is still a Persian paragraph. The policy is:
 *
 * 1. RTL when an RTL letter is the first strong character and at least two RTL
 *    letters are present.
 * 2. Otherwise RTL when at least 30% of the letters in the block are RTL.
 * 3. Otherwise LTR.
 *
 * `rtl` is the explicit "force Persian RTL" policy: any RTL letter wins.
 * `ltr` is the explicit manual override that leaves the block LTR.
 *
 * @param {string} text - visible prose, with code and URL labels already removed.
 * @param {{mode?: 'auto'|'rtl'|'ltr'}} [options] - detection policy.
 * @returns {{direction: 'rtl'|'ltr', rtlLetters: number, ltrLetters: number, firstStrong: 'rtl'|'ltr'|null, reason: string}}
 */
export function detectDirection(text, options = {}) {
  const mode = MODES.includes(options.mode) ? options.mode : 'auto'
  const source = typeof text === 'string' ? text : ''

  if (mode === 'ltr') {
    return result('ltr', 0, 0, null, 'manual-ltr')
  }

  let rtlLetters = 0
  let ltrLetters = 0
  let firstStrong = null

  for (const char of source) {
    if (!LETTER.test(char)) continue
    const isRtl = RTL_SCRIPT.test(char)
    if (isRtl) rtlLetters += 1
    else if (LTR_LETTER.test(char)) ltrLetters += 1
    else continue
    if (firstStrong === null) firstStrong = isRtl ? 'rtl' : 'ltr'
  }

  if (mode === 'rtl') {
    return result(rtlLetters > 0 ? 'rtl' : 'ltr', rtlLetters, ltrLetters, firstStrong, rtlLetters > 0 ? 'forced-rtl' : 'no-rtl-letters')
  }

  if (rtlLetters === 0) return result('ltr', 0, ltrLetters, firstStrong, 'no-rtl-letters')
  if (ltrLetters === 0) return result('rtl', rtlLetters, 0, firstStrong, 'rtl-only')

  const ratio = rtlLetters / (rtlLetters + ltrLetters)
  if (firstStrong === 'rtl' && rtlLetters >= 2) return result('rtl', rtlLetters, ltrLetters, firstStrong, 'rtl-first')
  if (ratio >= 0.3) return result('rtl', rtlLetters, ltrLetters, firstStrong, 'rtl-share')
  return result('ltr', rtlLetters, ltrLetters, firstStrong, 'ltr-dominant')
}

/**
 * Whether a string contains at least one RTL letter. Cheap pre-check used by
 * the DOM scanner before it builds the block's visible prose.
 *
 * @param {string} text - candidate text.
 * @returns {boolean}
 */
export function hasRtlLetters(text) {
  return RTL_SCRIPT.test(typeof text === 'string' ? text : '')
}

/**
 * Build one immutable detection result.
 *
 * @param {'rtl'|'ltr'} direction - detected paragraph direction.
 * @param {number} rtlLetters - number of RTL letters.
 * @param {number} ltrLetters - number of LTR letters.
 * @param {'rtl'|'ltr'|null} firstStrong - first strong letter direction.
 * @param {string} reason - stable diagnostic reason.
 * @returns {{direction: 'rtl'|'ltr', rtlLetters: number, ltrLetters: number, firstStrong: 'rtl'|'ltr'|null, reason: string}}
 */
function result(direction, rtlLetters, ltrLetters, firstStrong, reason) {
  return Object.freeze({ direction, rtlLetters, ltrLetters, firstStrong, reason })
}
