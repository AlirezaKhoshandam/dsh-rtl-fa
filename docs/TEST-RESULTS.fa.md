# گزارش تست‌ها — dsh-rtl-fa

تاریخ اجرا: ۲۰۲۶-۱۰-۳۱ (Asia/Tehran)

## محیط

| مورد | مقدار |
|---|---|
| سیستم | Windows، x64 |
| DeepSeek Harness | 0.2.1-rc.5 (Desktop/Web client) |
| Node (توسعه) | 24.x |
| مرورگر تست | Microsoft Edge (Chromium) نصب‌شده |
| محیط تست یکپارچه | پروفایل ایزولهٔ DSH با `DSH_HOME` جداگانه |
| API model | در پروفایل تست تنظیم نشده بود؛ بنابراین تست واقعی روی پوسته، Settings و Composer انجام شد، نه تولید پاسخ مدل |

## ۱. تست‌های واحد، DOM و اتصال ماژول

```powershell
npm run build
npm test
```

نتیجه:

```
tests 29
pass 29
fail 0
```

گروه‌ها:

- **Detection (۱۱):** فارسی، عربی، عبری، متن ترکیبی، شروع انگلیسی با ادامهٔ فارسی، انگلیسی دارای یک واژهٔ فارسی، اعداد/URL، حالت‌های `auto`/`rtl`/`ltr`، normalize.
- **DOM Engine (۱۲):**
  - پاراگراف فارسی RTL، انگلیسی LTR، حباب کاربر RTL.
  - کد `pre/code` و برچسب URL بدون تغییر.
  - `dir` نویسنده و `data-dsh-dir` حفظ می‌شود.
  - فهرست کاملاً RTL و فهرست مختلط.
  - نقل‌قول بدون تحمیل جهت به فرزندان.
  - جدول با اکثریت فارسی و ریست صریح سلول انگلیسی.
  - Composer با ورودی فارسی/انگلیسی.
  - Streaming در هر دو جهت.
  - disable/stop و پاک‌سازی کامل.
  - محتوای خارج از content root دست‌نخورده.
  - `data-dsh-rtl-ignore` و override جدول.
- **Module + Settings (۶):**
  - شناسهٔ `dsh-rtl-fa` در `__ModuleLoader__`.
  - `apply` روی DOM موجود.
  - ثبت `settings.general.item` و دیکشنری `dshRtlFa`.
  - رندر ردیف و سوئیچ‌ها.
  - نوشتن موفق از طریق `configForms` و خاموش‌شدن engine.
  - نوشتن ناموفق و نمایش خطا بدون از دست دادن مقدار پذیرفته‌شده.

## ۲. تست بصری واقعی Chromium

```powershell
npm run test:visual
```

نتیجه:

```
checks: 26
assertions: passed
screenshots:
  artifacts/visual-before.png
  artifacts/visual-after.png
```

نمای موبایل جداگانه با viewport واقعی 430px در Playwright تولید شده است: `artifacts/visual-mobile.png`.

موارد تأییدشده با `getComputedStyle`:

- جهت حباب کاربر فارسی: `rtl`.
- جهت پاراگراف ترکیبی: `rtl`.
- پاسخ انگلیسی: `ltr`.
- بلوک کد: `ltr` و `text-align: left` و بدون `dir` پلاگین.
- سلول جدول فارسی: `rtl`؛ ستون‌های جدول RTL؛ سلول انگلیسی: `ltr` صریح.
- فهرست کاملاً فارسی: `rtl`، `padding-right: 18px`، `padding-left: 0`.
- نقل‌قول: `border-right-width: 2px`، `border-left-width: 0`.
- Composer فارسی: `rtl`.
- Streaming: افزودن متن فارسی به یک پاراگراف انگلیسی، جهت را به `rtl` تغییر داد.
- خاموش‌کردن: همهٔ markerها حذف شد، استایل باقی ماند، Composer به `ltr` بازگشت.
- روشن‌کردن مجدد و حالت `rtl`: فارسی RTL، انگلیسی بدون `dir`.

تصاویر:

- [قبل از پلاگین](images/visual-before.png)
- [بعد از پلاگین](images/visual-after.png)
- [نمای موبایل](images/visual-mobile.png)
- [مقایسهٔ قبل/بعد](images/visual-comparison.png)

## ۳. تست یکپارچه با DSH واقعی

پروفایل ایزولهٔ DSH با `dsh-rtl-fa` نصب و سرور واقعی Web اجرا شد. سپس Edge headless با URL توکن‌دار به آن متصل شد.

نتیجه:

| بررسی | نتیجه |
|---|---|
| `dsh-rtl-fa` در `window.__DSH_BOOT__.entries` | ✅ |
| تزریق `style[data-plugin="dsh-rtl-fa"]` | ✅ |
| خطای کنسول/صفحه | ۰ |
| ردیف **Persian & RTL text** در Settings → General | ✅ |
| دو سوئیچ و select سه‌گزینه‌ای | ✅ |
| تغییر سوئیچ و بازگشت | ✅ |
| ذخیره در `cordis.patch.yml` | ✅ (`enabled: true`) |
| Composer واقعی Lexical با متن فارسی | ✅ `dir="rtl"` و `direction: rtl` |
| اسکرین‌شات Settings | [real-dsh-settings.png](images/real-dsh-settings.png) |
| اسکرین‌شات Composer | [real-dsh-composer.png](images/real-dsh-composer.png) |

نمونهٔ بخش ذخیره‌شده:

```yaml
- id: ui-rtl-fa
  name: dsh-rtl-fa
  config:
    enabled: true
```

## ۴. شکاف‌های تست

- در پروفایل تست، API key مدل تنظیم نشده بود؛ بنابراین پاسخ واقعی مدل تولید نشد. نمایش Markdown پاسخ دستیار با fixture هم‌شکل DSH و همان CSS Markdown تست شد. Composer و Settings روی DSH واقعی تست شدند.
- تست Global UI (منوها، سایدبار) عمداً انجام نشد، چون پلاگین آن‌ها را تغییر نمی‌دهد.
- تست بارگذاری مجدد کل برنامه (فراتر از Refresh مرورگر) روی پروفایل دسکتاپ کاربر انجام نشد؛ ذخیره‌سازی Host و بازخوانی config در تست ایزوله بررسی شد.
- موبایل با viewport واقعی 430px در Playwright تولید شد؛ اسکرین‌شات CLI هدلس به دلیل حداقل عرض پنجرهٔ Chromium قابل اتکا نبود.

## ۵. اجرای مجدد

```powershell
npm run check
npm run test:visual
```

برای تست واقعی DSH:

```powershell
# 1. پلاگین را در یک پروفایل ایزوله نصب کنید
# 2. سرور را اجرا کنید
dsh --profile web --no-open --port 49999

# 3. URL چاپ‌شده را به اسکریپت بدهید
node tests/real-dsh.mjs "http://127.0.0.1:49999/?token=..."
```

URL توکن‌دار یک اعتبارنامهٔ فرایندی است و نباید در مخزن یا گزارش‌ها ذخیره شود.
