// ลบบัญชีนิรนามของผู้ใช้ที่ล็อกอินอยู่ (ใช้สิทธิ์ admin ฝั่งเซิร์ฟเวอร์เท่านั้น)
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OS_APP_ID = Deno.env.get("ONESIGNAL_APP_ID")!;
const OS_KEY = Deno.env.get("ONESIGNAL_API_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 1) ตรวจตัวตนจาก JWT ใน header เท่านั้น (ไม่รับ user id จาก body)
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: "unauthorized" }, 401);
  if (!data.user.is_anonymous) return json({ error: "only anonymous users" }, 403);
  const uid = data.user.id;

  // 2) ลบผู้ใช้ใน OneSignal (ยกเลิกการรับ push) 404 = ไม่มีอยู่แล้ว ถือว่าผ่าน
  const os = await fetch(`https://api.onesignal.com/apps/${OS_APP_ID}/users/by/external_id/${encodeURIComponent(uid)}`, {
    method: "DELETE", headers: { Authorization: `Key ${OS_KEY}` },
  });
  if (!os.ok && os.status !== 404) return json({ error: "onesignal delete failed" }, 502);

  // 3) ลบข้อมูลทั้งหมดของผู้ใช้
  const del = await admin.from("reminders").delete().eq("user_id", uid);
  if (del.error) return json({ error: "data delete failed" }, 500);

  // 4) ลบบัญชี
  const res = await admin.auth.admin.deleteUser(uid);
  if (res.error) return json({ error: "account delete failed" }, 500);

  return json({ ok: true });
});
