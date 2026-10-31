/**
 * Browser half of dsh-rtl-fa.
 *
 * Official extension points used:
 * - `ctx.configForms` / `ui-settings` for durable, profile-backed preferences.
 * - `ctx.slots` `settings.general.item` for the feature-owned Settings row.
 * - `ctx.locale` for localized copy and live language switching.
 * - `dsh.client` in package.json for bundle delivery and teardown.
 */
import stylesCss from './styles.css'
import { RtlEngine } from './engine.js'
import { createSettingsController } from './settings.js'
import { SettingsRow } from './SettingsRow.js'
import { en, NS, zh } from './locale.js'

/** Host entry id, which is also the settings namespace used by configForms. */
export const ENTRY_ID = 'ui-rtl-fa'

/** Services required before the browser half activates. */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Activate the plugin.
 *
 * @param {object} ctx - DSH browser plugin context.
 * @returns {void}
 */
export function apply(ctx) {
  const form = ctx.configForms.get(ENTRY_ID)
  const controller = createSettingsController(form)
  const engine = new RtlEngine({
    document: globalThis.document,
    window: globalThis.window,
    stylesText: stylesCss,
    settings: controller.source.getSnapshot(),
  })

  const unsubscribe = controller.source.subscribe(() => {
    engine.setSettings(controller.source.getSnapshot())
  })

  engine.start(controller.source.getSnapshot())

  ctx.effect(
    () => () => {
      unsubscribe()
      engine.stop()
      controller.dispose()
    },
    'dsh-rtl-fa: engine and settings lifecycle',
  )

  ctx.effect(
    () => ctx.locale.register(NS, { en, zh }),
    'dsh-rtl-fa: settings dictionary',
  )

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'rtl-fa',
    order: 12,
    locale: NS,
    inject: () => ({
      // The `hooks` compartment is a member of the inject face, not of the
      // register options; the renderer binds it to `useRtlSettings`.
      hooks: { rtlSettings: controller.source },
      setSettings: controller.set,
    }),
  }, SettingsRow))
}
