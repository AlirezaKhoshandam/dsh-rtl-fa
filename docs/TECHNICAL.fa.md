# مستندات فنی dsh-rtl-fa

نسخهٔ ۱.۰.۰ · سازگار با DeepSeek Harness 0.2.1-rc.5 · MIT

## ۱. نتیجهٔ بررسی معماری DSH

DeepSeek Harness یک هستهٔ Cordis دارد که هر پروفایل از چند لایهٔ پلاگین ساخته می‌شود:

- `package.json` پروفایل، فهرست مرتب `dsh.profile.bundles` را نگه می‌دارد.
- هر باندل یک `cordis.patch.yml` دارد که ردیف‌های Loader را اضافه یا بازنویسی می‌کند.
- ردیف‌های پلاگین می‌توانند هم نیمهٔ Host و هم نیمهٔ Client داشته باشند.
- نیمهٔ Client با `dsh.client` در `package.json` اعلام می‌شود؛ سرویس `dsh-client-modules` آن را از مسیر `./client` سرو می‌کند و در مرورگر با `window.__ModuleLoader__` بارگذاری می‌کند.
- UI از طریق سرویس‌های رسمی `ctx.slots`، `ctx.locale` و `ctx.configForms` توسعه می‌یابد.
- تنظیمات پایدار از طریق `settings.configure` و فیلدهای `.volatile()` در `cordis.patch.yml` پروفایل ذخیره می‌شود.
- `settings.general.item` یک list slot رسمی برای ردیف‌های Settings → General است.

در نتیجه، راه‌حل اصولی چنین است:

```
پروفایل
  └─ باندل dsh-rtl-fa (cordis.patch.yml)
       └─ ردیف ui-rtl-fa
            ├─ Host half: Config + settings.configure
            └─ Client half: dsh.client → lib/client.js
                 ├─ RtlEngine (DOM + MutationObserver)
                 ├─ Settings row (slots + locale)
                 └─ Config controller (configForms)
```

هیچ فایلی از Core تغییر نکرده است.

## ۲. فایل‌های اصلی

| مسیر | نقش |
|---|---|
| `cordis.patch.yml` | ردیف `ui-rtl-fa` را در پروفایل insert می‌کند. |
| `src/index.js` | `Config` با سه فیلد volatile و `settings.configure({auto:false})`. |
| `src/client/index.js` | `apply`، اتصال engine به configForms، ثبت ردیف Settings و دیکشنری locale. |
| `src/client/detection.js` | تشخیص خالص جهت بر اساس اسکریپت‌های Unicode. |
| `src/client/engine.js` | انتخاب بلوک، استخراج متن، اعمال/حذف `dir`، Observer و زمان‌بندی. |
| `src/client/settings.js` | کنترلر observable + صف نوشتن اتمی روی `configForms`. |
| `src/client/SettingsRow.js` | رابط تنظیمات با توکن‌های DSH. |
| `src/client/styles.css` | قواعد جهت‌دهی scoped و ظاهر ردیف. |
| `lib/index.js` | کپی Host half برای اجرا. |
| `lib/client.js` | خروجی bundler با wrapper رسمی `__ModuleLoader__.load`. |

## ۳. قرارداد Host

```js
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  mode: z.union(['auto', 'rtl', 'ltr']).default('auto').volatile(),
  composer: z.boolean().default(true).volatile(),
})

export function apply(ctx) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
```

- `.volatile()` یعنی تغییر مقدار نیازی به remount پلاگین ندارد.
- `auto: false` یعنی Settings عمومی نباید فرم خودکار بسازد؛ پلاگین صفحهٔ اختصاصی خود را ثبت می‌کند.
- `ctx.inject(['settings'], …)` باعث می‌شود پلاگین در پروفایل بدون سرویس Settings هم boot شود.

## ۴. قرارداد Client

`package.json`:

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web" }
}
```

`inject = ['slots', 'locale', 'configForms']` وابستگی‌های سرویس را اعلام می‌کند. ردیف Settings با این ثبت:

```js
ctx.slots.inject('settings.general.item', () => ctx.slots.register({
  name: 'settings.general.item',
  id: 'rtl-fa',
  order: 12,
  locale: NS,
  inject: () => ({
    hooks: { rtlSettings: controller.source },
    setSettings: controller.set,
  }),
}, SettingsRow))
```

نکتهٔ مهم: `hooks` عضو **inject face** است، نه top-level گزینه‌های register. renderer آن را به `useRtlSettings` تبدیل می‌کند؛ این مورد در تست واقعی DSH اعتبارسنجی شده است.

## ۵. الگوریتم تشخیص

### ۵.۱ اسکریپت‌ها

از `\p{Script=...}` استفاده می‌شود تا وابستگی به فهرست واژه یا بازه‌های دستی نداشته باشیم:

```
Arabic, Hebrew, Syriac, Thaana, Nko, Samaritan, Mandaic, Adlam
```

همهٔ حروف غیر RTL (لاتین، سیریلیک، یونانی، ارمنی، گرجی، Han، Hiragana، Katakana، Hangul) در مخرج سهم شرکت می‌کنند. اعداد، علائم، فاصله و ایموجی حرف نیستند.

### ۵.۲ حالت `auto`

برای هر بلوک:

1. اگر هیچ حرف RTL نبود → LTR.
2. اگر فقط حرف RTL بود → RTL.
3. اگر اولین حرف قوی RTL بود و حداقل دو حرف RTL وجود داشت → RTL.
4. اگر نسبت حروف RTL به کل حروف ≥ ۰٫۳ بود → RTL.
5. در غیر این صورت → LTR.

این ترکیب، هم پاراگراف فارسی که با نام انگلیسی شروع می‌شود را RTL می‌کند و هم پاراگراف انگلیسی که فقط یک واژهٔ فارسی نقل کرده را LTR نگه می‌دارد.

### ۵.۳ حالت‌های دستی

- `rtl`: هر بلوک دارای حداقل یک حرف RTL، RTL می‌شود (برای «اجبار فارسی»).
- `ltr`: هیچ بلوکی RTL نمی‌شود (override دستی).

### ۵.۴ استخراج متن

`extractText(root, mode)` با TreeWalker:

- `leaf`: متن بلوک برگ، بدون بلوک‌های تودرتوی دیگر.
- `item`: متن یک آیتم فهرست، بدون زیرفهرست/نقل‌قول/کد.
- `container`: همهٔ متن قابل مشاهده، برای نقل‌قول/جدول/Composer.

در همهٔ حالت‌ها این‌ها حذف می‌شوند:

- `pre`, `code`, `kbd`, `samp`
- `script`, `style`, `noscript`, `textarea`, `select`, `option`
- `svg`, `math`, `.katex`, `.katex-display`
- `.monaco-editor`, `.xterm`, `.cm-editor`
- خود `data-dsh-rtl-ignore`
- متن لینک‌هایی که تمام برچسبشان URL یا ایمیل است

## ۶. انتخاب بلوک در DOM

`targetFor(textNode)` از گرهٔ متن به بالا حرکت می‌کند:

1. اگر به `pre/code/...`، کنترل تعاملی، `contenteditable` یا `[data-dsh-rtl-ignore]` برسد → هیچ تغییری نمی‌دهد.
2. اگر به یک `dir` نویسنده‌شده برسد که مال این پلاگین نیست → احترام می‌گذارد.
3. اولین بلوک صریح (`p`, `li`, `h1`…`h6`, `td`, `th`, `dd`, `dt`, `figcaption`, `caption`) را برمی‌گرداند.
4. برای متن داخل `div` عمومی (مثل حباب پیام کاربر)، فقط اگر داخل یک content root مانند `[data-chat-node-key]`، `[data-chat-flow]`، `[data-conversation-scroll]` یا `[data-dsh-rtl-scope]` باشد، نزدیک‌ترین بلوک برگ را برمی‌گرداند.

این محدودیت باعث می‌شود سایدبار، منوها و کنترل‌های عمومی بازچینش نشوند.

## ۷. اعمال جهت و برگشت‌پذیری

- فقط `dir="rtl"` و `data-dsh-rtl="rtl"` روی بلوک نوشته می‌شود.
- مقدار اولیهٔ `dir` در WeakMap ذخیره و هنگام disable/unload دقیقاً بازگردانده می‌شود.
- `clearAll()` همهٔ `data-dsh-rtl*`ها را حذف و جهت‌های اصلی را برمی‌گرداند.
- `stop()` استایل تزریق‌شده، observer، listenerها و همهٔ نشانه‌ها را پاک می‌کند.

## ۸. Bidi و CSS

```css
[data-dsh-rtl="rtl"] {
  direction: rtl;
  text-align: start;
  unicode-bidi: isolate;
}
```

- `isolate` از نشت bidi بین بلوک و اطراف جلوگیری می‌کند.
- `text-align: start` با `direction: rtl` به راست تبدیل می‌شود، ولی `text-align` صریح سلول جدول را از بین نمی‌برد.
- `code` و `pre` داخل بلوک RTL:

```css
direction: ltr;
unicode-bidi: isolate;
text-align: left;
```

- لینک‌ها `unicode-bidi: isolate` می‌گیرند؛ URL/ایمیل به‌عنوان run مستقل LTR نمایش داده می‌شود.
- KaTeX هم ایزوله LTR می‌شود.
- `unicode-bidi: plaintext` استفاده **نمی‌شود**، چون خطی که با `npm` شروع شده را داخل پاراگراف فارسی LTR می‌کند.

## ۹. فهرست‌ها

- اگر همهٔ آیتم‌های غیرخالی RTL باشند، خود `ul/ol` با `dir=rtl` علامت‌گذاری می‌شود و padding به سمت راست می‌رود.
- اگر فهرست مختلط باشد، جهت خود فهرست تغییر نمی‌کند تا آیتم انگلیسی `direction: rtl` را به ارث نبرد. بلوک فارسی داخل آیتم RTL می‌شود و CSS با `:has()` فضای هر دو سمت را رزرو می‌کند.
- زیرفهرست غیر RTL داخل فهرست RTL به‌صورت صریح LTR ریست می‌شود.

## ۱۰. جدول‌ها

- هر سلول جداگانه تشخیص داده می‌شود.
- اگر تعداد سلول‌های RTL از LTR بیشتر باشد، `table` با `dir="rtl"` می‌چرخد (ترتیب ستون‌ها RTL می‌شود).
- سلول انگلیسی در چنین جدولی **صریحاً** `dir="ltr"` می‌گیرد تا متنش راست‌چین نشود.
- برای جدول مفهوماً LTR با سلول‌های فارسی زیاد، `data-dsh-dir="ltr"` روی `<table>` بگذارید.
- padding سلول اول/آخر با logical edgeها هماهنگ می‌شود.

## ۱۱. نقل‌قول

`blockquote` فقط `data-dsh-rtl-quote="rtl"` می‌گیرد و `dir` نمی‌گیرد. بنابراین:

- حاشیه و padding آن به سمت راست منتقل می‌شود؛
- پاراگراف‌های داخل آن جهت مستقل خود را حفظ می‌کنند؛
- یک پاراگراف انگلیسی داخل نقل‌قول فارسی، انگلیسی می‌ماند.

## ۱۲. Streaming و محتوای پویا

- یک `MutationObserver` روی `document.body` با `childList`، `subtree` و `characterData`.
- تغییرات در یک batch با `setTimeout(0)` جمع می‌شوند. `requestAnimationFrame` عمداً استفاده نشده چون در پنجرهٔ پس‌زمینه/headless throttle می‌شود و آخرین chunk استریم ممکن است تا بازگشت کاربر جابه‌جا بماند.
- فقط ریشه‌های تغییر‌یافته اسکن می‌شوند، نه کل سند.
- اگر یک بلوک آخرین متن خود را از دست بدهد، `collectDirtyBlock` همان بلوک را پاک می‌کند.
- برای جلوگیری از حلقه، observer صفات را نمی‌بیند؛ پلاگین فقط attribute می‌نویسد.

## ۱۳. تنظیمات پایدار

`configForms.get('ui-rtl-fa')` یک فرم مشترک بر اساس entry id می‌دهد. کنترلر:

- مقدار پذیرفته‌شدهٔ Host را به snapshot immutable تبدیل می‌کند.
- نوشتن‌ها را در یک زنجیرهٔ Promise سریال می‌کند.
- همهٔ تغییرات یک gesture را در یک `mutate` اتمی می‌فرستد.
- در صورت رد شدن نوشتن، مقدار قبلی Host را دوباره می‌خواند و خطا را نشان می‌دهد.

تست واقعی نشان داد تغییر سوئیچ به این صورت در `cordis.patch.yml` ذخیره می‌شود:

```yaml
- id: ui-rtl-fa
  name: dsh-rtl-fa
  config:
    enabled: true
```

## ۱۴. کارایی

- تشخیص هر بلوک O(n) روی متن همان بلوک است.
- اسکن اولیه یک‌بار انجام می‌شود؛ stream فقط بلوک‌های تغییر‌یافته را می‌بیند.
- batchهای بزرگ‌تر از ۲۵۰ ریشه به یک full scan محدود تبدیل می‌شوند.
- `getComputedStyle` فقط برای بلوک‌های عمومی و با cache در هر batch خوانده می‌شود.
- CSS یک‌بار تزریق می‌شود؛ بدون وابستگی runtime و بدون شبکه.

## ۱۵. امنیت

- هیچ `innerHTML` یا `dangerouslySetInnerHTML` وجود ندارد.
- هیچ درخواست شبکه‌ای ساخته نمی‌شود.
- محتوای پیام‌ها فقط خوانده می‌شود؛ نه ذخیره، نه ارسال.
- پلاگین فقط attribute روی DOM و کلیدهای تنظیمات در پروفایل می‌نویسد.
- تنظیمات از طریق Host و با مجوز کاربر پروفایل ذخیره می‌شود.

## ۱۶. ماتریس تست

| لایه | تعداد | پوشش |
|---|---|---|
| Detection | ۱۱ | فارسی، عربی، عبری، ترکیبی، انگلیسی، عدد/URL، حالت‌های auto/rtl/ltr، normalize |
| DOM Engine | ۱۲ | بلوک‌های فارسی/انگلیسی، کد، URL، جدول، فهرست، نقل‌قول، Composer، Streaming، disable/stop، manual/ignore |
| Module + Settings | ۶ | wrapper `__ModuleLoader__`، apply، ثبت slot/locale، رندر ردیف، نوشتن موفق/ناموفق |
| Chromium Visual | ۲۶ | computed direction/text-align، کد، جدول، فهرست، quote، Composer، Streaming، روشن/خاموش |
| Real DSH | ۱ سناریو | boot graph، استایل، Settings row، تغییر سوئیچ، Composer واقعی، صفر خطا |

دستورها:

```powershell
npm run build
npm test
npm run test:visual
node tests/real-dsh.mjs "<tokenized dsh web URL>"   # اختیاری؛ نیازمند پروفایل تست
```

## ۱۷. محدودیت‌ها و تصمیم‌های آگاهانه

- **فهرست مختلط:** جهت خود فهرست خنثی می‌ماند تا آیتم انگلیسی RTL نشود. نشانگر RTL برای آیتم‌های فارسی در فهرست مختلط به سمت راست نمی‌رود، ولی متن آن‌ها راست‌چین است. این معاوضه برای جلوگیری از خرابی محتوای انگلیسی انتخاب شده است.
- **جدول با اکثریت فارسی:** ترتیب ستون‌ها RTL می‌شود. برای جدول LTR از `data-dsh-dir="ltr"` استفاده کنید.
- **تشخیص اسکریپت:** اعداد و علائم به‌تنهایی جهت را تغییر نمی‌دهند.
- **محدودهٔ DOM:** divهای عمومی فقط داخل content rootهای شناخته‌شده پردازش می‌شوند تا Chrome UI بازچینش نشود.
- **سرویس Settings:** در پروفایل بدون `configForms` ردیف تنظیمات وجود ندارد؛ engine همچنان با مقادیر پیش‌فرض boot می‌شود.
- **مرورگر:** Chromium 120+؛ DSH همین موتور را همراه دارد. `:has()` برای فهرست مختلط استفاده می‌شود.

## ۱۸. نقاط توسعه

- افزودن گزینهٔ «شدت تشخیص» در `Config` و `detection.js`.
- افزودن دکمهٔ جهت دستی برای هر پیام از طریق اسلات `conversation.chat.assistant-actions` (فعلاً override سطح بلوک با `data-dsh-dir`).
- افزودن پشتیبانی از فونت فارسی اختصاصی از طریق توکن‌های `--dsh-font-family-*`.
- گسترش به TUI/سایر سطوح DSH؛ این نسخه عمداً فقط Web/Desktop GUI است.
