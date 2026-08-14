# الخطوط المحلية

المشروع يستخدم حزم Fontsource المثبتة مع npm بدل `next/font/google`:

- `@fontsource-variable/fraunces`
- `@fontsource-variable/inter`
- `@fontsource/ibm-plex-mono`
- `@fontsource-variable/noto-kufi-arabic`

الخطوط تُضمّن داخل البناء، لذلك لا يحتاج Next.js إلى الاتصال بـ
`fonts.gstatic.com` وقت البناء أو التشغيل.

تعريفات الخطوط موجودة في `app/[locale]/layout.tsx`، وأسماء CSS variables
المستخدمة في التصميم لم تتغير.
