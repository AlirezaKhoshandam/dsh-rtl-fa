/**
 * Host half of dsh-rtl-fa.
 *
 * The plugin has no model-facing behavior and no Host runtime work beyond
 * exposing its preferences to the authenticated-browser Settings service.
 * Every field is `.volatile()`, which is the Cordis/settings contract for a
 * field that can change without remounting the plugin; the Settings provider
 * persists accepted values in the active profile's `cordis.patch.yml`.
 */
import z from '@deepseek-ai/schemastery'

/** Entry id of the plugin in the DSH profile; also its settings namespace. */
export const ENTRY_ID = 'ui-rtl-fa'

/** Default interaction mode: detect each block independently. */
export const DEFAULT_MODE = 'auto'

/** Supported direction policies. */
export const DIRECTION_MODES = Object.freeze(['auto', 'rtl', 'ltr'])

/**
 * Durable preferences shared by every authenticated browser of this profile.
 * `enabled` is the master switch; `mode` is the direction policy; `composer`
 * controls whether the Lexical message editor follows the detected direction.
 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  mode: z.union([...DIRECTION_MODES]).default(DEFAULT_MODE).volatile(),
  composer: z.boolean().default(true).volatile(),
})

/**
 * Mark the entry as self-configured so the generic Settings schema page does
 * not replace the feature-owned row registered by the client half. The child
 * injection keeps the plugin bootable in compositions without a settings
 * service (headless and SDK profiles).
 *
 * @param ctx - Cordis Host context.
 */
export function apply(ctx) {
  ctx.inject(['settings'], (child) => {
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      'dsh-rtl-fa: feature-owned settings form',
    )
  })
}
