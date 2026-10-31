# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-31

### Added

- Profile bundle with a Cordis Host half and a `dsh.client` browser half.
- Per-block Persian, Arabic, Hebrew and other RTL-script detection.
- Automatic and manual direction policies: `auto`, `rtl`, `ltr`.
- Markdown support for paragraphs, headings, lists, blockquotes, tables and
  user message bubbles.
- Streaming updates through a coalesced `MutationObserver`.
- LTR isolation for code, KaTeX, links, e-mail addresses and URLs.
- Composer direction detection for the Lexical message editor.
- Feature-owned Settings → General row with durable profile-backed settings.
- `data-dsh-dir`, `data-dsh-rtl-ignore` and `data-dsh-rtl-scope` escape hatches.
- Unit, jsdom, real-Chromium and live-DSH test suites.
