# الخطوط

الخطوط self-hosted في `public/fonts/`، ومعرَّفة كـ `@font-face` في
`app/globals.css`. Next.js ما بيتصلش بـ `fonts.gstatic.com` لا وقت البناء ولا التشغيل.

| الملف | الاستخدام | الحجم |
|---|---|---|
| `almarai-arabic-400/700/800.woff2` | كل النصوص العربية | ~32 KB للوزن |
| `inter-latin.woff2` | كل النصوص الإنجليزية (variable) | 48 KB |
| `fraunces-latin.woff2` | الـ wordmark بس (`.brand-wordmark`) | 36 KB |
| `plexmono-latin-400/500.woff2` | الأرقام والأسعار (`.figure`) | ~15 KB للوزن |

## ليه مش حزم Fontsource؟

`import '@fontsource-variable/inter'` بيجيب الـ `index.css` بتاع الحزمة، وفيه **7**
تعريفات `@font-face`: cyrillic، cyrillic-ext، greek، greek-ext، latin، latin-ext،
vietnamese. الموقع عربي وإنجليزي بس. الخمسة التانيين كانوا CSS بيتقرا قبل أول رسمة
على الشاشة، لحروف عمرها ما هتترسم.

## ليه Almarai مش Noto Kufi Arabic؟

- **الشكل:** Noto Kufi خط display، وكان بيتحط على فقرات كاملة. Almarai خط نصوص.
- **الحجم:** subset العربي بتاع Almarai = 32 KB، بتاع Noto Kufi = 124 KB. والعربي هو
  اللغة الافتراضية للموقع، يعني ده أكبر توفير متاح على أول تحميل.

## لو عايز تغيّر وزن أو تضيف خط

Almarai عنده 300 / 400 / 700 / 800 بس — **مفيش 500 ولا 600**. لو كتبت
`font-medium` أو `font-semibold` على نص عربي، المتصفح بيزوّر الوزن (fake bold)
وشكله بيبقى وحش. عشان كده في `globals.css` فيه قاعدة بتقفل الـ synthesis
وبتحوّل الأوزان دي لأقرب وزن حقيقي. لو ضفت وزن جديد، ضيف الملف في `public/fonts/`
و`@font-face` مقابله.
