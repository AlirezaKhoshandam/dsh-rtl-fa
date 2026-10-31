# انتشار dsh-rtl-fa در GitHub

این راهنما برای انتشار همین پوشه به‌عنوان یک مخزن مستقل GitHub نوشته شده است.

> نکتهٔ مهم: DSH فایل ساخته‌شدهٔ `lib/client.js` را سرو می‌کند و هنگام نصب از Git،
> build اجرا نمی‌کند. بنابراین `lib/` باید در مخزن commit شود. پوشه‌های
> `node_modules/`، `artifacts/` و فایل‌های `.tgz` نباید commit شوند.

## ۰. وضعیت این پروژه

مخزن محلی در همین پوشه با شاخهٔ `main` و اولین commit آماده است. تنها کار باقی‌مانده
ساختن مخزن روی GitHub و push کردن است.

مخزن محلی شامل این موارد است:

- سورس `src/`
- خروجی ساخته‌شدهٔ `lib/`
- تست‌ها، مستندات و تصاویر
- `LICENSE`، `README.md`، `README.fa.md`
- CI در `.github/workflows/ci.yml`

## ۱. یک مخزن خالی در GitHub بسازید

در GitHub:

1. **New repository**
2. نام: `dsh-rtl-fa`
3. Public (برای اینکه دیگران هم بتوانند نصب کنند)
4. گزینه‌های **Add a README**، **Add .gitignore** و **Choose a license** را
   خالی بگذارید؛ این‌ها از قبل در پروژه هستند.
5. **Create repository**

سپس آدرس مخزن را بردارید؛ یکی از این دو:

```text
https://github.com/<USERNAME>/dsh-rtl-fa.git
git@github.com:<USERNAME>/dsh-rtl-fa.git
```

## ۲. remote را وصل کنید و push کنید

در PowerShell:

```powershell
cd C:\Users\alire\Documents\deepseek-harness\default-workspace\dsh-rtl-fa

git remote add origin https://github.com/<USERNAME>/dsh-rtl-fa.git
git branch -M main
git push -u origin main
```

اگر Git Credential Manager نصب باشد، پنجرهٔ ورود GitHub باز می‌شود. در غیر این صورت
برای HTTPS به **Personal Access Token** نیاز دارید (رمز عبور معمولی GitHub پذیرفته
نمی‌شود). ساخت توکن:

- GitHub → Settings → Developer settings → Personal access tokens
- حداقل دسترسی `Contents: Read and write` برای همین مخزن

برای SSH:

```powershell
ssh -T git@github.com
git remote set-url origin git@github.com:<USERNAME>/dsh-rtl-fa.git
git push -u origin main
```

## ۳. GitHub CLI (اختیاری)

`gh` روی این سیستم نصب نیست. اگر بخواهید از CLI استفاده کنید:

```powershell
winget install --id GitHub.cli
gh auth login
```

بعد از ورود، از داخل پوشه:

```powershell
gh repo create dsh-rtl-fa --public --source=. --remote=origin --push
```

این دستور مخزن را می‌سازد، remote را تنظیم می‌کند و شاخهٔ `main` را push می‌کند.

## ۴. فرادادهٔ مخزن را کامل کنید

در صفحهٔ **About** مخزن:

Description:

```text
Intelligent Persian, Arabic and RTL text layout for the DeepSeek Harness Web GUI.
```

Topics:

```text
deepseek-harness dsh deepseek plugin rtl persian farsi arabic bidi markdown
```

همچنین:

- License: MIT (GitHub آن را از `LICENSE` تشخیص می‌دهد)
- Issues: فعال
- Discussions: اختیاری
- Social preview: می‌توانید `docs/images/visual-comparison.png` را بارگذاری کنید

سپس `package.json` را با آدرس واقعی خود به‌روز کنید:

```powershell
npm pkg set repository.type=git `
  repository.url=git+https://github.com/<USERNAME>/dsh-rtl-fa.git `
  homepage=https://github.com/<USERNAME>/dsh-rtl-fa `
  bugs.url=https://github.com/<USERNAME>/dsh-rtl-fa/issues

git add package.json package-lock.json
git commit -m "chore: point package metadata at the GitHub repository"
git push
```

> اگر `npm pkg set` را اجرا می‌کنید، `node_modules` لازم نیست؛ فقط `package.json`
> تغییر می‌کند.

## ۵. اولین Release و tag

ساخت tag:

```powershell
git tag -a v1.0.0 -m "dsh-rtl-fa v1.0.0"
git push origin v1.0.0
```

در GitHub:

1. **Releases → Draft a new release**
2. Tag: `v1.0.0`
3. Title: `dsh-rtl-fa v1.0.0`
4. توضیحات: خلاصهٔ قابلیت‌ها و لینک `CHANGELOG.md`
5. فایل نصب را attach کنید:

```powershell
npm pack
```

فایل `dsh-rtl-fa-1.0.0.tgz` ساخته می‌شود. همین فایل را به Release ضمیمه کنید.
فایل `.tgz` در Git commit نمی‌شود (در `.gitignore` هست).

## ۶. نصب از GitHub در DSH

دو گزینه دارید:

### الف) از صفحهٔ Plugins

**Plugins → Add plugin → Install a third-party plugin** و یکی از این‌ها:

```text
git+https://github.com/<USERNAME>/dsh-rtl-fa.git#v1.0.0
```

یا آدرس asset همان Release:

```text
https://github.com/<USERNAME>/dsh-rtl-fa/releases/download/v1.0.0/dsh-rtl-fa-1.0.0.tgz
```

سپس باندل `dsh-rtl-fa` را روشن کنید و صفحه را Refresh کنید.

### ب) نصب دستی در پروفایل

در `package.json` پروفایل:

```json
{
  "dependencies": {
    "dsh-rtl-fa": "github:<USERNAME>/dsh-rtl-fa#v1.0.0"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-rtl-fa"
      ]
    }
  }
}
```

و سپس در پوشهٔ پروفایل:

```powershell
pnpm install
```

## ۷. CI

فایل `.github/workflows/ci.yml` بعد از هر push به `main` و هر Pull Request اجرا
می‌شود:

1. `npm ci --ignore-scripts`
2. `npm run build`
3. `npm test`
4. `npm pack --dry-run`

تست بصری به Edge/Chrome نصب‌شده نیاز دارد و عمداً در CI نیست. آن را محلی اجرا کنید:

```powershell
npm install --ignore-scripts
npm run build
npm run test:visual
```

## ۸. انتشار نسخهٔ بعدی

```powershell
# نسخه را در package.json و CHANGELOG.md به‌روز کنید
npm run build
npm test

git add -A
git commit -m "release: v1.0.1"
git tag -a v1.0.1 -m "dsh-rtl-fa v1.0.1"
git push origin main
git push origin v1.0.1
```

سپس یک GitHub Release جدید بسازید و tarball تازه را ضمیمه کنید.

## ۹. چک‌لیست قبل از push

```powershell
git status
git log --oneline -3
git ls-files | Select-String -Pattern "node_modules|^artifacts/|\.tgz$"
git grep -n -I -E "token=|api[_-]?key|BEGIN .*PRIVATE KEY" -- .
```

انتظار:

- `git status` تمیز باشد.
- `lib/` در `git ls-files` باشد.
- `node_modules/`، `artifacts/` و `.tgz` در فهرست فایل‌های tracked نباشند.
- هیچ توکن یا کلید خصوصی در مخزن نباشد.

## ۱۰. انتشار در npm (اختیاری)

برای GitHub نیازی به npm نیست. اگر خواستید:

```powershell
npm login
npm publish --access public
```

نام `dsh-rtl-fa` ممکن است قبلاً گرفته شده باشد. در آن صورت از یک scope استفاده کنید
(مثلاً `@<USERNAME>/dsh-rtl-fa`) و نام row را در `cordis.patch.yml` و فهرست
`dsh.profile.bundles` هم به‌روز کنید. برای پروژهٔ فعلی، نصب مستقیم از GitHub کافی است.
