/**
 * Copy for the Settings row. DSH registers both built-in locales; the English
 * values are the fallback for every other UI language.
 */
export const NS = 'dshRtlFa'

export const en = Object.freeze({
  'title': 'Persian & RTL text',
  'description': 'Detect Persian, Arabic and Hebrew text in messages and Markdown, then align each block right-to-left. English prose, code, tables and URLs keep their normal LTR behavior.',
  'enabled.label': 'Enable RTL text support',
  'enabled.hint': 'Only text that actually contains an RTL script is changed.',
  'mode.label': 'Direction policy',
  'mode.hint': 'Automatic is recommended. The manual overrides affect RTL-script text only.',
  'mode.auto': 'Automatic (per block)',
  'mode.rtl': 'Always RTL for Persian/Arabic',
  'mode.ltr': 'Always LTR (manual override)',
  'composer.label': 'Apply to the message editor',
  'composer.hint': 'Right-align the composer while the draft contains Persian or Arabic.',
  'storage.hint': 'Saved in your DSH profile and shared by authenticated browsers.',
  'sample.label': 'Preview',
  'sample.text': 'برای اجرای ',
  'sample.code': 'npm install',
  'sample.after': ' ابتدا وارد پوشه پروژه شوید. مستندات: ',
  'sample.url': 'https://example.com/install',
  'error.save': 'Could not save the setting. The previous value is still active.',
  'error.unavailable': 'Settings are unavailable in this session.',
  'status.saving': 'Saving…',
})

export const zh = Object.freeze({
  'title': '波斯语与 RTL 文本',
  'description': '自动识别消息和 Markdown 中的波斯语、阿拉伯语与希伯来语，并按右到左对齐相应文本块。英文正文、代码、表格和链接保持原有 LTR 行为。',
  'enabled.label': '启用 RTL 文本支持',
  'enabled.hint': '只会修改确实包含 RTL 书写系统的文本。',
  'mode.label': '方向策略',
  'mode.hint': '推荐使用自动模式。手动覆盖仅作用于包含 RTL 文字的文本。',
  'mode.auto': '自动（按文本块）',
  'mode.rtl': '波斯语/阿拉伯语始终 RTL',
  'mode.ltr': '始终 LTR（手动覆盖）',
  'composer.label': '应用到消息编辑器',
  'composer.hint': '草稿包含波斯语或阿拉伯语时，将输入框内容右对齐。',
  'storage.hint': '保存在 DSH 配置中，并由已认证的浏览器共享。',
  'sample.label': '预览',
  'sample.text': 'برای اجرای ',
  'sample.code': 'npm install',
  'sample.after': ' ابتدا وارد پوشه پروژه شوید. مستندات: ',
  'sample.url': 'https://example.com/install',
  'error.save': '无法保存设置，之前的设置仍然有效。',
  'error.unavailable': '当前会话无法使用设置。',
  'status.saving': '正在保存…',
})
