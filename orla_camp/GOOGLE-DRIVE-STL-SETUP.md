# OrlaDent Camp — STL على Google Drive بدون Google Cloud Console

النظام في هذه النسخة يستخدم **Google Apps Script + Google Drive** فقط لملفات STL.

- Google Drive: يخزن ملف STL/PLY نفسه.
- Supabase Auth: يحدد الطالب المسجل دخول.
- Supabase DB: يخزن `user_id`, assignment, lesson, `drive_file_id`, status, grade, feedback.
- Vercel/Next.js: يتحقق من الطالب ويطلب Upload Session فقط.
- الملف الكبير يرفع من Browser مباشرة إلى Google Drive عبر Drive resumable upload.

لا تحتاج:

- Google Cloud Console
- OAuth Client ID
- OAuth Client Secret
- Service Account
- VPS أو Disk على Vercel

---

## 1) Database

إذا كنت شغلت migrations السابقة، شغّل مرة واحدة فقط:

`supabase/migration-011-stl-tasks-drive.sql`

في Supabase → SQL Editor.

---

## 2) أنشئ Google Apps Script

1. افتح: `https://script.google.com`
2. اضغط **New project**.
3. سمّه مثلًا: `OrlaDent Camp Drive Bridge`.
4. افتح الملف الموجود داخل المشروع:

   `google-apps-script/Code.gs`

5. انسخ محتواه بالكامل والصقه بدل محتوى `Code.gs` في Apps Script.
6. Save.

---

## 3) شغّل الإعداد مرة واحدة

من قائمة Functions أعلى Apps Script اختر:

`setupOrlaDrive`

ثم اضغط **Run**.

أول مرة Google سيطلب منك السماح للسكريبت بالوصول إلى Google Drive. وافق باستخدام حساب Google الذي تريد أن يمتلك ملفات الطلاب.

السكريبت ينشئ تلقائيًا:

```text
My Drive
└── OrlaDent Camp
    └── Student Submissions
```

بعد نجاح التشغيل افتح **Execution log**. ستجد سطرًا مثل:

```text
GOOGLE_APPS_SCRIPT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

انسخ القيمة واحتفظ بها. لا تضعها في GitHub.

---

## 4) اعمل Deploy للـ Apps Script

1. اضغط **Deploy**.
2. **New deployment**.
3. Type → **Web app**.
4. Execute as → **Me**.
5. Who has access → **Anyone**.
6. اضغط **Deploy**.
7. انسخ **Web app URL** الذي ينتهي غالبًا بـ `/exec`.

مثال:

```text
https://script.google.com/macros/s/XXXXXXXXXXXX/exec
```

> مهم: استخدم رابط `/exec` وليس رابط `/dev`.

---

## 5) Vercel Environment Variables

Vercel → Project → Settings → Environment Variables.

أضف فقط:

```env
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXXXXXX/exec
GOOGLE_APPS_SCRIPT_SECRET=القيمة_التي_ظهرت_من_setupOrlaDrive
TASK_UPLOAD_MAX_MB=512
```

بعدها اعمل **Redeploy**.

`TASK_UPLOAD_MAX_MB` اختياري. 512 MB هو الحد الافتراضي في الكود ويمكن لكل Assignment استخدام حد أصغر.

---

## 6) إنشاء Task

من المنصة:

Admin → **Student STL Tasks / مهام الطلاب STL**

أنشئ Task واربطه بالدرس المطلوب وحدد:

- الاسم عربي/إنجليزي
- Max score
- أنواع الملفات (`.stl`, `.ply`...)
- Max size
- Due date إن أردت
- Allow resubmission

لن يظهر زر رفع STL في درس لا يحتوي Assignment مفعلة.

---

## ماذا يحدث عند رفع الطالب؟

```text
Student Browser
      ↓
Next.js API
      ↓  (Supabase session يحدد user_id)
Google Apps Script
      ↓  (ينشئ Drive resumable session)
Student Browser ─────────────→ Google Drive
      ↓
Next.js يتحقق من Drive file metadata عبر Apps Script
      ↓
Supabase يسجل drive_file_id + status
```

الطالب لا يرسل `user_id` كاختيار، ولا يملك Apps Script secret.

---

## تنظيم Drive

Apps Script ينشئ المجلدات عند أول رفع:

```text
OrlaDent Camp
└── Student Submissions
    ├── Stage 1 - Foundations
    │   ├── Lesson 01 - ...
    │   └── Lesson 08 - ...
    ├── Stage 2 - Restorative
    └── Stage 3 - Advanced
```

اسم الملف يتحول تلقائيًا لاسم مناسب يشمل اسم الطالب المختصر + user id + رقم الدرس + التاريخ، لكن الربط الحقيقي يظل `drive_file_id` في Supabase.

---

## فتح ملفات الطالب من Admin

الملفات تظل **Private** في Google Drive. زر Open / Download في Admin يفتح رابط Drive.

لو عندك Reviewer يستخدم Google Account مختلف، شارك مجلد:

`OrlaDent Camp / Student Submissions`

مع حساب الـ Reviewer كـ Viewer أو Editor حسب احتياجك.

لا تجعل مجلد ملفات الطلاب `Anyone with the link` إلا لو أنت تقبل أن أي شخص يمتلك الرابط يستطيع الوصول إليه.

---

## لو غيرت كود Apps Script لاحقًا

تعديل الكود داخل Apps Script لا يغيّر النسخة المنشورة تلقائيًا في بعض حالات النشر. اعمل:

Deploy → Manage deployments → Edit → New version → Deploy.

ولا تحتاج تغيير `GOOGLE_APPS_SCRIPT_URL` طالما نفس الـ deployment URL مستمر.

## لو شكيت أن الـ Secret اتكشف

شغّل من Apps Script:

`rotateOrlaBridgeSecret`

وانسخ القيمة الجديدة إلى `GOOGLE_APPS_SCRIPT_SECRET` في Vercel ثم Redeploy.
