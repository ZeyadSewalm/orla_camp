# الإصلاحات — OrlaDent Camp

كل حاجة اتظبطت في النسخة دي، والسبب الحقيقي وراها.

---

## 1. زرار تغيير اللغة

### السبب الحقيقي

العربي هو اللغة الافتراضية **من غير prefix** في الـ URL، يعني:

- عربي → `/pricing`
- إنجليزي → `/en/pricing`

الـ `next-intl` middleware عنده `localeDetection` شغال by default. لما يجيله request على URL من
غير prefix، بيقرأ كوكي اسمه `NEXT_LOCALE` عشان يعرف الصفحة دي بأي لغة. ولو الكوكي مكتوب فيه
`en`، بيعمل **redirect** لـ `/en/pricing`.

الزرار القديم كان بيعمل `router.push('/pricing')` وبس. الكوكي كان لسه فيه `en`، فالـ middleware
كان بيرجّعه فورًا على `/en/pricing`. يعني:

- **عربي ← إنجليزي**: شغال.
- **إنجليزي ← عربي**: مش بيحصل حاجة خالص.

ده مش تخمين — اتأكدت منه على build حقيقي:

```
GET /pricing  (Cookie: NEXT_LOCALE=en)  →  307 redirect إلى /en/pricing   ← البَج
GET /pricing  (Cookie: NEXT_LOCALE=ar)  →  200 عربي                        ← بعد الإصلاح
```

### الحل

**`components/LocaleSwitcher.tsx`** — الزرار دلوقتي:

1. يكتب كوكي `NEXT_LOCALE` بالأول (قبل أي navigation).
2. يروح لنفس الصفحة باللغة الجديدة، ومعاها الـ query string (كان بيضيع قبل كده).
3. يعمل `router.refresh()` — ده ضروري، لأن الـ `<html lang/dir>` والـ Header وكل نصوص
   الصفحة راندرينج على السيرفر، فلازم الـ RSC payload يتجاب من جديد بدل ما يتقري من
   الـ client cache بلغته القديمة.
4. فيه `useTransition` عشان الزرار يتقفل ثانية وقت التحويل بدل ما تدوس مرتين.

**`i18n.ts`** — اسم الكوكي (`NEXT_LOCALE`) بقى ثابت `export`-ed، عشان الزرار والـ middleware
ياخدوه من مصدر واحد وما يختلفوش أبدًا.

**`middleware.ts`** —

- الكوكي اتظبط explicitly في `createIntlMiddleware`.
- أهم حاجة: لو `next-intl` قرر يعمل redirect، بنرجّعه **على طول** ومنكملش نداء Supabase عليه.
  قبل كده كنا بنعمل auth check على response أصلًا هو 307، وده كان بيضيّع وقت، ومرات
  بيضيّع كوكي الـ session نفسه.

> **ملحوظة:** مكتبة الترجمة (`next-intl`) كانت متظبطة صح من الأساس — الملفات `messages/ar.json`
> و`messages/en.json` فيهم نفس الـ 219 مفتاح بالظبط، ومفيش مفتاح ناقص في أي لغة، وكل صفحة
> بتنادي `unstable_setRequestLocale`. المشكلة كانت في الكوكي بس.

---

## 2. "Invalid login credentials"

### أول حاجة لازم تتقال بصراحة

المشروع ده **مفيهوش login route** أصلاً، و**مفيهوش bcrypt** تتظبط.

الـ authentication كله على **Supabase Auth (GoTrue)**. كلمة السر متخزنة hashed بـ bcrypt جوه
Supabase نفسه في `auth.users.encrypted_password` — في schema التطبيق **مش مسموحله** يقراها ولا
يكتب فيها.

يعني:

- التطبيق **مستحيل** يعمل hash لكلمة سر ويقارنها، لأنه أصلاً مش شايف الـ hash المتخزن. لو
  عملنا كده، المقارنة هتفشل كل مرة.
- **إضافة صف في جدول `profiles` مش بتعمل حساب.** جدول `profiles` ده النص الوصفي بس (اسم، دور،
  اشتراك). نص الـ credentials عايش في `auth.users`. صف في `profiles` من غير مستخدم في
  `auth.users` وراه = بالظبط الرسالة اللي بتشوفها: `Invalid login credentials`.

### الأسباب الفعلية للرسالة دي، ومعالجة كل واحد

Supabase بيرجّع نفس الجملة دي لأكتر من حالة مختلفة تمامًا، وده اللي بيخلي المشكلة تبان مستعصية:

| السبب | الإصلاح |
|---|---|
| مسافة زيادة أو حرف كابيتال في الإيميل — كيبورد الموبايل بيعملها لوحده | `AuthForm.tsx` بقى يعمل `trim().toLowerCase()` قبل ما يبعت، ويظبط الحقل قدامك عند الخروج منه |
| الحساب موجود بس **الإيميل مش متأكد** | `create-admin` بيعمل الحساب بـ `email_confirm: true`، والرسالة بقت بتقولك كده صراحة |
| مستخدم في `auth.users` من غير صف في `profiles` (اتعمل قبل الـ trigger) | `migration-005` بيعمل backfill لكل الصفوف الناقصة |
| الـ `handle_new_user` trigger وقع، فالـ signup ما تمّش أصلاً | الـ trigger بقى ما يقعش المستخدم لو الـ profile فشل |
| الـ anon key من project تاني غير الـ URL | `npm run check-auth` بيقارن الـ project ref جوه الـ JWT ويقولك |

### إنشاء Admin افتراضي — الطريقة الصح

```bash
npm run create-admin -- admin@orladent.com 'كلمة-سر-قوية'
```

`scripts/create-admin.mjs` بيستخدم **Supabase Admin API** بالـ service-role key:

- بيعمل المستخدم في `auth.users` (Supabase هو اللي بيعمل الـ bcrypt hash — إحنا لأ).
- `email_confirm: true` — من غيرها الحساب بيتعمل غير مؤكَّد وكل محاولة دخول بترجع رسالة
  شكلها زي كلمة سر غلط.
- بيعمل upsert للـ profile بـ `role: 'admin'` و`has_access: true`.
- **آمن تشغّله أكتر من مرة**: لو المستخدم موجود، بيغيّر كلمة السر ويأكّد الإيميل بدل ما يفشل.
  يعني هو كمان أداة "نسيت كلمة السر" لأي حساب.

### تشخيص أي حساب

```bash
npm run check-auth -- someone@example.com
```

بيقولك بالترتيب: الـ env variables، المستخدم موجود ولا لأ، الإيميل متأكد ولا لأ، الـ profile
موجود ودوره إيه، وأي صفوف `profiles` معندهاش مستخدم وراها (دي حسابات مستحيل تدخل بيها أبدًا).

### `supabase/migration-005-auth-repair.sql`

شغّله مرة واحدة في Supabase SQL editor بعد `migration-004`. بيعمل:

1. **backfill** للـ profiles الناقصة لكل مستخدم في `auth.users`.
2. الـ `handle_new_user` trigger بقى ما يوقّعش عملية إنشاء الحساب لو حصلت مشكلة في الـ profile
   (كان بيرجّع "Database error saving new user" ويلغي الـ signup بالكامل).
3. trigger جديد يخلي `profiles.email` متزامن لو غيّرت الإيميل من لوحة Supabase.

---

## 3. الـ Responsive

### السبب الأكبر: مقياس الخطوط

ده كان أهم سبب في تكسّر الشكل على الموبايل، وأصعب واحد يتشاف.

في `tailwind.config.ts` كان فيه `fontSize` scale **بيستبدل** الافتراضي بتاع Tailwind:

```
text-xs = 14px      text-lg  = 28px
text-sm = 16px      text-xl  = 40px
text-base = 20px    text-2xl = 64px    ← مش 24px
```

بس الكود مكتوب في كل حتة على أساس أرقام Tailwind العادية. يعني `text-2xl` على عنوان كارت —
اسم الباقة في صفحة الأسعار، عنوان بلوك في المنهج، اسم الطالب في الأدمن — كان بيتعرض
**64 بكسل** على موبايل عرضه 390. الكلمة الواحدة كانت بتدفع الكارت اللي هي جواه برّه الشاشة.

وأوضح مثال على الخلل: في صفحة الهوم كان مكتوب `text-2xl md:text-3xl`. يعني **64px على الموبايل،
و30px على الديسكتوب** — الهرم مقلوب بالظبط.

**الحل:** المقياس بقى **fluid** بـ `clamp()`. كل قيمة قصوى زي ما هي بالظبط، فشكل الديسكتوب
**ما اتغيرش ولا بكسل**؛ الأحجام بس بتصغر تدريجيًا تحت 1100px بدل ما تفيض:

```
text-2xl:  36px على الموبايل  →  64px على الديسكتوب
text-xl:   28px              →  40px
text-lg:   20px              →  28px
```

### الـ viewport meta tag

اتضاف explicitly في `app/[locale]/layout.tsx` كـ `export const viewport`. Next بيحط واحد
افتراضي، بس أول ما أي حاجة تانية تعرّف `viewport` الافتراضي بيقع — ومن غيره الموبايل بيرندر
الصفحة بعرض 980px ويصغّرها، فكل حاجة تبان "مزنوقة ومكسورة" مهما الـ CSS كويس.

`maximum-scale=5` والـ pinch-zoom سايبينه شغال بقصد — تقفيل الزوم ده حاجة بتتعمل كتير وإحنا
بنطارد نفس البَج ده، وهي مشكلة accessibility حقيقية.

### `app/globals.css`

- **`overflow-x: clip` بدل `hidden`** على `html`/`body`. `overflow: hidden` على أب في الشجرة
  **بيقتل `position: sticky`** بصمت — الهيدر الـ sticky كان بيبطّل يلزق على الموبايل بالظبط
  للسبب ده. `clip` بيمنع السكرول الأفقي من غير ما يعمل scroll container.
- `overflow-wrap: break-word` على النصوص — لينك أو مصطلح إنجليزي وسط كلام عربي كان بيوسّع
  الكونتينر أعرض من الشاشة.
- `min-width: 0` على أولاد الـ flex/grid. الافتراضي `min-width: auto` معناه إن العنصر **بيرفض**
  يصغر عن محتواه — وده بالظبط اللي بيخلي كلمة واحدة طويلة تطلّع صف كامل برّه الشاشة بدل ما
  تلف جواه.
- **`font-size: 16px` على كل `input` تحت 768px.** iOS بيزوّم الصفحة كلها أول ما تدوس على input
  خطه أصغر من 16px، وعمره ما بيرجع يصغّر. في فورم اللوجين والدفع ده كان شكله إن اللياوت بيتكسر
  عند اللمس.
- الـ `clip-path` المائل اتقفل على الموبايل — كان بيقص من النص نفسه عند العروض الضيقة.
- `.no-scrollbar` للصفوف الأفقية (نافيجيشن الموبايل).

### تعديلات على مستوى الصفحات

- **`page.tsx` (الهوم):** عنوان الهيرو كان `clamp(3rem, 6.2vw, 5rem)` — الحد الأدنى 48px مش
  بيدخل شاشة 360px. بقى `clamp(2rem, 8vw, 5rem)`، والديسكتوب لسه بيوصل نفس الـ 5rem. الأزرار
  بقت full-width متراصة تحت بعض على الموبايل. الأشكال الديكورية (الدواير الملونة) اتخفت على
  الموبايل — كانت قاعدة تحت النص وبتعمل سكرول أفقي.
- **`Header.tsx`:** الـ wordmark بيختفي تحت 400px (اللوجو لوحده كفاية) — كان بيزق زرار اللغة
  والدخول برّه الشاشة. نافيجيشن الموبايل كان `max-w-max`، وده بيخلي الصف يكبر أكبر من الشاشة
  بدل ما يعمل سكرول جواه؛ بقى `max-w-full`.
- **`PricingClient.tsx`:** اسم الباقة من `text-2xl` (64px) لـ `text-xl`. الـ `min-h-[3.5rem]`
  على الوصف كان محجوز لسطرين على الديسكتوب، وعلى الموبايل نفس الكلام بيبقى 4 سطور فكان
  بيتقص — بقى على `md:` بس.
- **`TierComparison.tsx`:** الجدول ما ينفعش يصغر تحت 42rem (4 أعمدة علامات مش هتفهم منها حاجة)،
  فسايبينه بيعمل سكرول — بس ضفنا سطر تحته بيقولك تسحبه، بدل ما تكتشف بالصدفة.
- **`Curriculum.tsx`, `course/page.tsx`, `faq/page.tsx`, `admin/page.tsx`, `admin/Shell.tsx`:**
  نفس المشكلة، `text-2xl`/`text-xl` على عناوين عادية → نزلت درجة. وجريد الأرقام في الأدمن
  (`grid-cols-2`) بقى عمود واحد تحت 400px.

---

## التحقق

```bash
npm install
npm run typecheck   # ✓ من غير أخطاء
npm run build       # ✓ 35 صفحة، من غير warnings
```

اتأكدت من الآتي على build حقيقي شغال:

- `<html lang="ar" dir="rtl">` و`<html lang="en" dir="ltr">` بيتعملوا render صح.
- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">` موجود في اللغتين.
- سلوك الـ redirect بتاع الكوكي (الجدول فوق).

---

## خطوات التشغيل عندك

```bash
npm install
cp .env.example .env.local        # املا مفاتيح Supabase من نفس الـ project
```

في Supabase SQL editor، شغّل `supabase/migration-005-auth-repair.sql`.

```bash
npm run check-auth                          # يشوف الوضع الحالي
npm run create-admin -- admin@orladent.com 'كلمة-سر-قوية'
npm run dev
```

بعدين ادخل من `/login` (عربي) أو `/en/login`، وغيّر كلمة السر بعد أول دخول.

> **باقي شغل معروف ومش متعمل** (مش أخطاء — لسه ما اتبنتش): checkout بتاع Tap للخليج، درس
> التاج المجاني (lead magnet)، وسياسة الاسترجاع لسه مش نهائية ولازم تفضل مش منشورة في أي مكان
> على الموقع.
