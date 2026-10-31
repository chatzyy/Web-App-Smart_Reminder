# Smart Reminder (เว็บแอป + แจ้งเตือนจากเซิร์ฟเวอร์)

สแกน QR → ใช้งานได้ทันที ไม่ต้องสมัครสมาชิก ผู้ใช้แต่ละคนได้บัญชีนิรนามของตัวเอง
เซิร์ฟเวอร์ (Supabase) เช็คทุกนาที ถึงเวลาแล้วสั่ง OneSignal ส่ง Web Push แม้ผู้ใช้ปิดเว็บไปแล้ว

## โครงสร้างโฟลเดอร์
```
index.html               หน้าเว็บทั้งหมด
config.js                ใส่ค่า Supabase / OneSignal (ค่าสาธารณะ)
manifest.json, icons/    ทำให้เพิ่มลงหน้าจอหลักได้ (PWA)
OneSignalSDKWorker.js    service worker ของ OneSignal (ต้องอยู่ที่ราก ห้ามย้าย)
supabase/
  config.toml
  migrations/01_tables.sql   ตาราง + RLS
  migrations/02_cron.sql     ตั้งเวลาเรียก send-due ทุกนาที
  functions/send-due/        ส่งแจ้งเตือนที่ถึงเวลา
  functions/delete-account/  ลบบัญชีและข้อมูลทั้งหมด
```

## ลำดับการติดตั้ง (ทำตามทีละข้อ)

### 1) เอาเว็บขึ้นออนไลน์ก่อน (เพื่อให้ได้ URL)
อัปโหลดทั้งโฟลเดอร์นี้ไปที่โฮสต์เว็บแบบ static ที่มี HTTPS เช่น Netlify (ลากโฟลเดอร์ไปวางที่ app.netlify.com/drop) หรือ Cloudflare Pages
จดค่า URL เช่น `https://smart-reminder.netlify.app` (ไม่มี `/` ท้าย)
ไฟล์ `OneSignalSDKWorker.js` ต้องเปิดได้ที่ `https://URL/OneSignalSDKWorker.js`

### 2) สร้างโปรเจกต์ Supabase
1. สมัคร supabase.com แล้วสร้างโปรเจกต์
2. Authentication → Sign In / Providers → เปิด **Allow anonymous sign-ins**
3. SQL Editor → วางเนื้อหาไฟล์ `supabase/migrations/01_tables.sql` แล้วกด Run
4. Project Settings → API: จด **Project URL** กับ **anon / publishable key** (ห้ามใช้ service_role ในหน้าเว็บ)
5. แนะนำ: Authentication → Attack Protection เปิด CAPTCHA หรือ rate limit กันคนสร้างบัญชีนิรนามรัว ๆ

### 3) สร้างแอปใน OneSignal
1. สมัคร onesignal.com → New App → เลือก **Web** → **Typical Site**
2. Site URL = URL จากข้อ 1 ให้ตรงเป๊ะ
3. เปิดใช้ iOS web push ตามที่หน้าตั้งค่าบอก (ใช้ VAPID ไม่ต้องอัปโหลดใบรับรอง)
4. จด **App ID** และ **REST API Key** (Settings → Keys & IDs) REST API Key เป็นความลับ ห้ามใส่ใน config.js

### 4) ใส่ค่าใน `config.js` แล้วอัปโหลดเว็บใหม่
```js
SUPABASE_URL: "https://xxxx.supabase.co",
SUPABASE_KEY: "anon/publishable key",
ONESIGNAL_APP_ID: "App ID"
```

### 5) Deploy ฟังก์ชันฝั่งเซิร์ฟเวอร์ (ใน Terminal ที่โฟลเดอร์นี้)
```
npx supabase login
npx supabase link --project-ref xxxx          # xxxx = ส่วนหน้า .supabase.co
npx supabase secrets set ONESIGNAL_APP_ID=... ONESIGNAL_API_KEY=... CRON_SECRET=ตั้งรหัสยาว ๆ สุ่มเอง SITE_URL=https://URL-จากข้อ-1
npx supabase functions deploy send-due
npx supabase functions deploy delete-account
```

### 6) ตั้งเวลาเรียก send-due ทุกนาที
แก้ `supabase/migrations/02_cron.sql` ใส่ Project URL และ CRON_SECRET (ต้องตรงกับข้อ 5) แล้ววางใน SQL Editor กด Run

### 7) ทำ QR Code
เอา URL จากข้อ 1 ไปสร้าง QR (เว็บสร้าง QR ฟรีทั่วไปใช้ได้)

## ทดสอบ
1. เปิดเว็บบน Android/Chrome → ผ่านหน้าแนะนำ → กดอนุญาตแจ้งเตือน
2. Reminder → ตั้งเวลาอีก 10 นาที → ปิดแท็บ → รอ ต้องมีแจ้งเตือนเด้ง (ตัวตั้งเวลาเช็คทุกนาที อาจช้าได้ไม่เกินราว 1 นาที)
3. iPhone: เปิดด้วย Safari → เพิ่มไปยังหน้าจอโฮม → เปิดจากไอคอน → อนุญาตแจ้งเตือน (ต้อง iOS 16.4 ขึ้นไป)
4. ตั้งค่า → ลบแอปและข้อมูลทั้งหมด → ยืนยัน → เปิดใหม่ ต้องได้ผู้ใช้ใหม่และข้อมูลว่าง

## ดูว่าพังตรงไหน
- Supabase → Edge Functions → send-due → Logs
- SQL: `select * from cron.job_run_details order by start_time desc limit 10;`
- OneSignal → Audience → Subscriptions ต้องเห็นเครื่องที่สมัคร และ External ID = User ID ของ Supabase

## ข้อจำกัดที่ควรรู้
- ข้อมูลผูกกับเบราว์เซอร์/ไอคอนนั้น ล้างข้อมูลเว็บหรือถอนแอป = ได้ผู้ใช้ใหม่ ข้อมูลเดิมกู้ไม่ได้
- iPhone: ข้อมูลที่สร้างใน Safari จะไม่ตามไปที่ไอคอนหน้าจอหลัก เพราะแยกที่เก็บกัน หน้าแรกจึงให้ติดตั้งก่อน
- เวลาส่งจริงอาจคลาดเคลื่อนได้ตามระบบของ Apple/Google
- สถิติ "สิ่งที่มักลืม", ธีม, โปรไฟล์ เก็บในเครื่อง ไม่ขึ้นเซิร์ฟเวอร์
- เมื่อมีผู้ใช้จริง ควรมีหน้านโยบายความเป็นส่วนตัว (ไม่ใช่คำแนะนำทางกฎหมาย)
