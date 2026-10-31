import assert from 'node:assert/strict'
import test from 'node:test'
import { detectDirection, hasRtlLetters, normalizeSettings } from '../src/client/detection.js'

test('Persian prose is RTL', () => {
  const result = detectDirection('برای اجرای دستور npm install ابتدا وارد پوشه پروژه شوید.')
  assert.equal(result.direction, 'rtl')
  assert.ok(result.rtlLetters > result.ltrLetters)
})

test('English prose is not changed', () => {
  const result = detectDirection('Run npm install in the project directory first.')
  assert.equal(result.direction, 'ltr')
  assert.equal(result.rtlLetters, 0)
})

test('English prose that merely mentions a Persian word stays LTR', () => {
  const result = detectDirection('For Persian users, the greeting سلام is common in conversation.')
  assert.equal(result.direction, 'ltr')
})

test('A Persian sentence that starts with an English product name is RTL', () => {
  const result = detectDirection('DeepSeek Harness از مدل‌های پیشرفته پشتیبانی می‌کند.')
  assert.equal(result.direction, 'rtl')
  assert.equal(result.firstStrong, 'ltr')
})

test('Arabic and Hebrew are detected as RTL scripts', () => {
  assert.equal(detectDirection('مرحبا بالعالم، هذا نص عربي.').direction, 'rtl')
  assert.equal(detectDirection('שלום עולם, זה טקסט בעברית.').direction, 'rtl')
})

test('A first-strong RTL word wins over trailing English', () => {
  const result = detectDirection('سلام: this is a short translation note')
  assert.equal(result.direction, 'rtl')
  assert.equal(result.reason, 'rtl-first')
})

test('Digits, punctuation and URLs alone do not trigger RTL', () => {
  assert.equal(detectDirection('12345 (67%) — https://example.com/a/b').direction, 'ltr')
})

test('force RTL mode flips any block with an RTL letter', () => {
  const result = detectDirection('Release note: سلام', { mode: 'rtl' })
  assert.equal(result.direction, 'rtl')
  assert.equal(result.reason, 'forced-rtl')
})

test('manual LTR mode never changes a block', () => {
  const result = detectDirection('این متن کاملاً فارسی است.', { mode: 'ltr' })
  assert.equal(result.direction, 'ltr')
  assert.equal(result.reason, 'manual-ltr')
})

test('settings normalization rejects hand-edited invalid values', () => {
  assert.deepEqual(normalizeSettings(null), { enabled: true, mode: 'auto', composer: true })
  assert.deepEqual(normalizeSettings({ enabled: false, mode: 'nope', composer: 0 }), {
    enabled: false,
    mode: 'auto',
    composer: true,
  })
})

test('hasRtlLetters is a cheap script check', () => {
  assert.equal(hasRtlLetters('npm install'), false)
  assert.equal(hasRtlLetters('فقط فارسی'), true)
  assert.equal(hasRtlLetters(''), false)
})
