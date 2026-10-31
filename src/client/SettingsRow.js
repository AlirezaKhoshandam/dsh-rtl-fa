/**
 * Settings -> General -> Persian & RTL text row.
 *
 * The component is deliberately small and dependency-free apart from React:
 * all durable state and write serialization live in the settings controller.
 */
import React from 'react'

const h = React.createElement

/**
 * @param {object} props - slot-composed props.
 * @param {Function} props.t - namespace translator.
 * @param {Function} props.useRtlSettings - hook exposing the settings snapshot.
 * @param {Function} props.setSettings - queued Host write callback.
 * @returns {object}
 */
export function SettingsRow({ t, useRtlSettings, setSettings }) {
  const snapshot = useRtlSettings((value) => value)
  const enabled = snapshot.enabled === true
  const mode = snapshot.mode ?? 'auto'
  const composer = snapshot.composer !== false
  const busy = snapshot.saving === true

  const errorKey = snapshot.error === 'unavailable' ? 'error.unavailable'
    : snapshot.error === null || snapshot.error === undefined ? null : 'error.save'

  const directionSelect = h(
    'select',
    {
      className: 'dshRtlFa_select',
      value: mode,
      disabled: busy || !enabled,
      'aria-label': t('mode.label'),
      onChange: (event) => {
        void setSettings({ mode: event.target.value })
      },
    },
    h('option', { value: 'auto' }, t('mode.auto')),
    h('option', { value: 'rtl' }, t('mode.rtl')),
    h('option', { value: 'ltr' }, t('mode.ltr')),
  )

  return h(
    'div',
    { className: 'dshRtlFa_group' },
    h('div', { className: 'dshRtlFa_heading' }, t('title')),
    h('div', { className: 'dshRtlFa_description' }, t('description')),

    h(
      'div',
      { className: 'dshRtlFa_rows' },
      h(
        'div',
        { className: 'dshRtlFa_row' },
        h(
          'div',
          { className: 'dshRtlFa_rowText' },
          h('div', { className: 'dshRtlFa_label' }, t('enabled.label')),
          h('div', { className: 'dshRtlFa_hint' }, t('enabled.hint')),
        ),
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            className: 'dshRtlFa_switch',
            'aria-checked': enabled,
            'aria-label': t('enabled.label'),
            disabled: busy,
            onClick: () => {
              void setSettings({ enabled: !enabled })
            },
          },
          h('span', { className: 'dshRtlFa_thumb', 'aria-hidden': 'true' }),
        ),
      ),

      h(
        'div',
        { className: 'dshRtlFa_row' },
        h(
          'div',
          { className: 'dshRtlFa_rowText' },
          h('div', { className: 'dshRtlFa_label' }, t('mode.label')),
          h('div', { className: 'dshRtlFa_hint' }, t('mode.hint')),
        ),
        directionSelect,
      ),

      h(
        'div',
        { className: 'dshRtlFa_row' },
        h(
          'div',
          { className: 'dshRtlFa_rowText' },
          h('div', { className: 'dshRtlFa_label' }, t('composer.label')),
          h('div', { className: 'dshRtlFa_hint' }, t('composer.hint')),
        ),
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            className: 'dshRtlFa_switch',
            'aria-checked': composer,
            'aria-label': t('composer.label'),
            disabled: busy || !enabled,
            onClick: () => {
              void setSettings({ composer: !composer })
            },
          },
          h('span', { className: 'dshRtlFa_thumb', 'aria-hidden': 'true' }),
        ),
      ),
    ),

    h('div', { className: 'dshRtlFa_hint' }, t('storage.hint')),
    busy && h('div', { className: 'dshRtlFa_status', role: 'status' }, t('status.saving')),
    errorKey !== null && h('div', { className: 'dshRtlFa_error', role: 'alert' }, t(errorKey)),

    h(
      'div',
      { className: 'dshRtlFa_sample', dir: 'rtl', lang: 'fa', 'aria-label': t('sample.label') },
      h('span', { className: 'dshRtlFa_label', style: { fontSize: '11px', opacity: 0.75 } }, `${t('sample.label')}:`),
      ' ',
      t('sample.text'),
      h('code', { className: 'dshRtlFa_sampleCode' }, t('sample.code')),
      t('sample.after'),
      h(
        'a',
        {
          className: 'dshRtlFa_sampleUrl',
          href: 'https://example.com/install',
          target: '_blank',
          rel: 'noopener noreferrer',
          onClick: (event) => event.preventDefault(),
        },
        t('sample.url'),
      ),
    ),
  )
}
