/**
 * Browser-side settings controller for dsh-rtl-fa.
 *
 * The Host owns the durable values. This controller only:
 * - mirrors the accepted `configForms` snapshot into an immutable object,
 * - serializes writes so rapid switch/select gestures cannot race,
 * - exposes a tiny observable source for the slot `hooks` compartment.
 *
 * Keeping the form as the single fact source means a rejected write falls back
 * to the previously accepted Host document instead of leaving the UI in an
 * optimistic state that will disappear after restart.
 */
import { DEFAULT_SETTINGS, normalizeSettings } from './detection.js'

/**
 * Create a settings controller around one Host config form.
 *
 * @param {object} form - `ctx.configForms.get('ui-rtl-fa')` handle.
 * @param {{onSnapshot?: Function}} [options] - optional observer for the engine.
 * @returns {{
 *   source: {getSnapshot: Function, subscribe: Function},
 *   settings: Function,
 *   set: Function,
 *   dispose: Function,
 * }}
 */
export function createSettingsController(form, options = {}) {
  let disposed = false
  /** @type {Set<Function>} */
  const listeners = new Set()
  let pending = 0
  let error = null
  let current = normalizeSettings(readAccepted(form))
  let snapshot = makeSnapshot(current, pending, error)
  let chain = Promise.resolve()

  const publish = (nextSettings = current, nextPending = pending, nextError = error) => {
    current = nextSettings
    snapshot = makeSnapshot(current, nextPending, nextError)
    if (disposed) return
    for (const listener of [...listeners]) listener()
    options.onSnapshot?.(snapshot)
  }

  const adopt = () => {
    if (disposed) return
    const next = normalizeSettings(readAccepted(form))
    if (!sameSettings(next, current) || (pending > 0) !== snapshot.saving) {
      publish(next, pending, error)
    }
  }

  const unsubscribeForm = form?.subscribe?.(adopt)

  /**
   * Persist a partial settings patch. Calls are queued, so even a fast sequence
   * of switch clicks writes one revision after another and the last accepted
   * value is what the Host document holds.
   *
   * @param {Partial<{enabled: boolean, mode: 'auto'|'rtl'|'ltr', composer: boolean}>} patch - fields to write.
   * @returns {Promise<{ok: boolean, error: string|null}>}
   */
  function set(patch) {
    if (disposed) return Promise.resolve({ ok: false, error: 'disposed' })
    if (form === null || form === undefined) return Promise.resolve({ ok: false, error: 'unavailable' })
    if (!hasWritableStatus(form)) return Promise.resolve({ ok: false, error: 'unavailable' })

    const task = chain.then(async () => {
      if (disposed) return { ok: false, error: 'disposed' }
      const accepted = normalizeSettings(readAccepted(form))
      const next = normalizeSettings({ ...accepted, ...patch })
      const operations = []
      if (patch.enabled !== undefined && next.enabled !== accepted.enabled) {
        operations.push({ op: 'set', path: ['enabled'], value: next.enabled })
      }
      if (patch.mode !== undefined && next.mode !== accepted.mode) {
        operations.push({ op: 'set', path: ['mode'], value: next.mode })
      }
      if (patch.composer !== undefined && next.composer !== accepted.composer) {
        operations.push({ op: 'set', path: ['composer'], value: next.composer })
      }
      if (operations.length === 0) return { ok: true, error: null }

      pending += 1
      error = null
      publish(current, pending, error)
      let ok = false
      try {
        ok = await form.mutate(operations)
      } catch {
        ok = false
      } finally {
        pending = Math.max(0, pending - 1)
        error = ok ? null : 'save-failed'
        const nextAccepted = normalizeSettings(readAccepted(form))
        publish(nextAccepted, pending, error)
      }
      return { ok, error }
    })

    chain = task.catch(() => ({ ok: false, error: 'save-failed' }))
    return task
  }

  return {
    source: Object.freeze({
      getSnapshot: () => snapshot,
      subscribe(listener) {
        if (disposed) return () => {}
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }),
    settings: () => snapshot,
    set,
    dispose() {
      disposed = true
      listeners.clear()
      unsubscribeForm?.()
    },
  }
}

/**
 * Read the accepted resolved value from one config form snapshot.
 *
 * @param {object} form - config form.
 * @returns {object}
 */
function readAccepted(form) {
  try {
    return form?.getSnapshot?.().value ?? DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * The config form may be present but temporarily unavailable while the Host
 * settings document is loading. In that state a write cannot be accepted.
 *
 * @param {object} form - config form.
 * @returns {boolean}
 */
function hasWritableStatus(form) {
  const snapshot = form?.getSnapshot?.()
  if (snapshot === undefined) return false
  return snapshot.status === 'ready' || snapshot.status === 'loading' || snapshot.status === 'idle'
}

/**
 * @param {object} settings - normalized settings.
 * @param {number} saving - number of in-flight writes.
 * @param {string|null} error - last write error code.
 * @returns {object}
 */
function makeSnapshot(settings, saving, error) {
  return Object.freeze({
    enabled: settings.enabled,
    mode: settings.mode,
    composer: settings.composer,
    saving: saving > 0,
    error,
  })
}

/**
 * @param {object} left - normalized settings.
 * @param {object} right - normalized settings.
 * @returns {boolean}
 */
function sameSettings(left, right) {
  return left.enabled === right.enabled && left.mode === right.mode && left.composer === right.composer
}
