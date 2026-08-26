# OrlaDent Camp — التشغيل

## 1. الكود

```bash
npm install
cp .env.example .env.local     # املأ مفاتيح Supabase من نفس المشروع
npm run dev
```

## 2. قاعدة البيانات — بالترتيب

في Supabase → SQL Editor، شغّل كل ملف مرة واحدة بالترتيب:

| الملف | ما يفعله |
|---|---|
| `schema.sql` | الجداول الأساسية |
| `migration-002-admin.sql` | صلاحيات لوحة التحكم |
| `migration-003-bunny.sql` | حقول Bunny للفيديو |
| `migration-004-fixes.sql` | عدّادات المقاعد والخصومات (atomic) |
| `migration-005-auth-repair.sql` | إصلاح الحسابات الناقصة |
| `migration-006-leads.sql` | جدول تسجيلات الدرس المجاني |
| **`migration-007-column-security.sql`** | **ثغرتان أمنيتان — شغّله قبل استقبال أي دفع** |
| `migration-008-sales-sheet-pricing.sql` | الأسعار من ورقة المبيعات |
| **`migration-009-student-progress.sql`** | **تقدم الطالب، وقت المشاهدة، وإحصائيات Student Dashboard** |
| **`migration-010-progress-hardening.sql`** | **يقفل التعديل المباشر على Progress ويجعل الكتابة عبر RPC فقط** |
| **`migration-011-stl-tasks-drive.sql`** | **مهام STL + ربط الطالب/الدرس/الدرجة في Supabase مع تخزين الملف في Google Drive** |

لو كنت شغّلت `migration-009` و`migration-010` بالفعل، لا تعيدهم ولا تحذف أي بيانات؛ شغّل فقط `migration-011-stl-tasks-drive.sql` لإضافة نظام مهام STL.

رسالة `Success. No rows returned` صحيحة — هذه الملفات تُنشئ وتعدّل، ولا تُرجع صفوفاً.

## 3. حساب المسؤول

```bash
npm run check-auth                                   # يشخّص الوضع الحالي
npm run create-admin -- admin@orladent.com 'كلمة-مرور-قوية'
```

الأمر الثاني آمن للتكرار: إن كان الحساب موجوداً غيّر كلمة مروره وأكّد بريده، فهو أيضاً أداة استعادة.

## 4. متغيّرات البيئة على Vercel

| المتغيّر | مطلوب لـ |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` | كل شيء |
| `SUPABASE_SERVICE_ROLE_KEY` | لوحة التحكم، الفيديو، التسجيلات |
| `NEXT_PUBLIC_SITE_URL` | **الروابط ومعاينات المشاركة — بدونه تصبح كلها localhost** |
| `PAYMOB_*` | الدفع في مصر |
| `TAP_SECRET_KEY` | الدفع في الخليج والدولي |
| `BUNNY_*` | فيديو محمي (اختياري) |
| `GOOGLE_APPS_SCRIPT_URL` · `GOOGLE_APPS_SCRIPT_SECRET` | رفع مهام STL إلى Google Drive عبر Apps Script بدون OAuth Client |
| `TASK_UPLOAD_MAX_MB` | حد أمان أقصى لحجم ملفات المهام (الافتراضي 512 MB) |


## 5. Google Drive لمهام STL — Apps Script فقط

الطالب لا يسجل دخول Google ولا يرسل `user_id`. الموقع يقرأ المستخدم من Supabase Session على السيرفر. Google Apps Script يعمل بحساب Drive المخصص للمنصة وينشئ resumable upload session؛ الملف نفسه يرفع من المتصفح مباشرة إلى Google Drive.

1. افتح `script.google.com` → New project.
2. انسخ `google-apps-script/Code.gs`.
3. شغّل `setupOrlaDrive` مرة واحدة ووافق على صلاحية Drive.
4. من Execution log انسخ `GOOGLE_APPS_SCRIPT_SECRET`.
5. Deploy → New deployment → Web app → Execute as **Me** → **Anyone**.
6. انسخ رابط `/exec`.
7. أضف إلى Vercel:

```env
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
GOOGLE_APPS_SCRIPT_SECRET=...
TASK_UPLOAD_MAX_MB=512
```

8. Redeploy.

**لا تحتاج Google Cloud Console ولا Client ID ولا Client Secret ولا Refresh Token.**

الشرح المصور/التفصيلي مكتوب في `GOOGLE-DRIVE-STL-SETUP.md`.

## 6. Supabase → Authentication

- **URL Configuration → Redirect URLs:** أضف `https://<نطاقك>/**`
  (النجمتان ضروريتان: رابط الاستعادة يحمل query string، والمطابقة تامة بدونهما)
- **Emails → SMTP Settings:** فعّل مزوّداً خارجياً.
  الافتراضي محدود برسالتين في الساعة للمشروع كله — لا يكفي لتأكيد الحسابات ولا لاستعادة كلمات المرور.

## 7. الدرس المجاني

1. في Drive: شارك الملف كـ **Anyone with the link → Viewer**
2. لوحة التحكم → الوحدات → الصق الرابط، واختر ✅ **Free preview**
3. تظهر لوحة الحالة أعلى القائمة ما تقدّمه صفحة `/free-lesson` فعلياً
4. التسجيلات تظهر في تبويب **الاهتمامات**

## 8. بعد النشر

- افتح المصدر وابحث عن `<meta name="x-build">` للتأكد من النسخة المنشورة
- امسح كاش المعاينات من [Facebook Debugger](https://developers.facebook.com/tools/debug/) بضغط "Scrape Again"

---

## معروف وغير منجز

- درايف لا يحمي الفيديو — أي زائر يستطيع أخذ الرابط من أدوات المطوّر.
  للوحدات المدفوعة استخدم **Bunny** (مربوط في المشروع).
- صفحة `/whoami` أداة تشخيص. احذفها بعد اكتمال الإعداد.
- لا توجد صور لأعمال حقيقية على الموقع، ولا صورة للمدرّب — وهما أهم ما ينقص صفحة تبيع مهارة بصرية.
