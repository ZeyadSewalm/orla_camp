# ابدأ من هنا

## مهم: امسح المجلد القديم

متفكّش الملفات دي فوق المجلد القديم. امسحه بالكامل وفك ده مكانه.
السبب: الملفات القديمة اللي اتشالت بتفضل مكانها وتعمل تعارض — وده سبب مشكلة `/ar`.

## الخطوات

1. انسخ ملف `.env.local` من المجلد القديم للمجلد ده (مش موجود جوه الـ zip عمداً — فيه مفاتيحك).
2. افتح المجلد في VS Code → Terminal:

```
npm install
npm run dev
```

3. اقفل كل تابات localhost المفتوحة في المتصفح، وافتح تاب جديد.

## اللينكات — من غير /ar

العربي على الجذر مباشرة. الإنجليزي بس هو اللي ليه بادئة.

| الصفحة | اللينك |
|---|---|
| الرئيسية | http://localhost:3000/ |
| تشخيص الحساب | http://localhost:3000/whoami |
| لوحة التحكم | http://localhost:3000/admin |
| الباقات | http://localhost:3000/pricing |
| تسجيل الدخول | http://localhost:3000/login |
| حساب جديد | http://localhost:3000/signup |
| إنجليزي | http://localhost:3000/en |

لو الترمينال قال `Port 3000 is in use, trying 3001` استخدم 3001 بدل 3000.

## للدخول على لوحة التحكم

1. اعمل حساب من `/signup`
2. لو التأكيد بالإيميل واقفك: Supabase → Authentication → Providers → Email → اقفل `Confirm email`
3. افتح `/whoami` — هتلاقي جدول فيه ✅/❌ وسطر SQL جاهز فيه الـ user id بتاعك
4. انسخ السطر ده وشغّله في Supabase → SQL Editor
5. اعمل خروج ودخول تاني → هيظهر زرار لوحة التحكم في الهيدر

## للتأكد إنك على النسخة الصح

```
type middleware.ts | findstr localePrefix
```

لازم يطلع `as-needed`. لو طلع `always` يبقى ده المجلد القديم.

## الأسعار

الموقع بيقرا الأسعار من قاعدة البيانات مش من الكود. لتطبيق أسعار ملف المبيعات،
شغّل ده في Supabase → SQL Editor:

```sql
update tiers set price_egp = 7500,  installment_price_egp = 2750,
                 price_usd = 249,   installment_price_usd = 89
where slug = 'foundation';

update tiers set price_egp = 15000, installment_price_egp = 5500,
                 price_usd = 499,   installment_price_usd = 179
where slug = 'freelance_ready';
```

## قبل النشر

- اعمل rotate للـ service_role key من Supabase (اتعرض في محادثة سابقة)
- حدّد سياسة الاسترداد قبل ما تضيفها في الـ FAQ
