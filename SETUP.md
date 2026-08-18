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

## 5. Supabase → Authentication

- **URL Configuration → Redirect URLs:** أضف `https://<نطاقك>/**`
  (النجمتان ضروريتان: رابط الاستعادة يحمل query string، والمطابقة تامة بدونهما)
- **Emails → SMTP Settings:** فعّل مزوّداً خارجياً.
  الافتراضي محدود برسالتين في الساعة للمشروع كله — لا يكفي لتأكيد الحسابات ولا لاستعادة كلمات المرور.

## 6. الدرس المجاني

1. في Drive: شارك الملف كـ **Anyone with the link → Viewer**
2. لوحة التحكم → الوحدات → الصق الرابط، واختر ✅ **Free preview**
3. تظهر لوحة الحالة أعلى القائمة ما تقدّمه صفحة `/free-lesson` فعلياً
4. التسجيلات تظهر في تبويب **الاهتمامات**

## 7. بعد النشر

- افتح المصدر وابحث عن `<meta name="x-build">` للتأكد من النسخة المنشورة
- امسح كاش المعاينات من [Facebook Debugger](https://developers.facebook.com/tools/debug/) بضغط "Scrape Again"

---

## معروف وغير منجز

- درايف لا يحمي الفيديو — أي زائر يستطيع أخذ الرابط من أدوات المطوّر.
  للوحدات المدفوعة استخدم **Bunny** (مربوط في المشروع).
- صفحة `/whoami` أداة تشخيص. احذفها بعد اكتمال الإعداد.
- لا توجد صور لأعمال حقيقية على الموقع، ولا صورة للمدرّب — وهما أهم ما ينقص صفحة تبيع مهارة بصرية.
