// ส่งแจ้งเตือนที่ถึงเวลา เรียกจาก pg_cron ทุกนาที
import { createClient } from "npm:@supabase/supabase-js@2";
import { localDateString, nextFire } from "../_shared/time.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const OS_APP_ID = Deno.env.get("ONESIGNAL_APP_ID")!;
const OS_KEY = Deno.env.get("ONESIGNAL_API_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
const LATE_MS = 30 * 60 * 1000; // เลย 30 นาทีแล้ว ไม่ส่ง (กันเด้งช้าเกินไป)

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function push(r: any) {
  const items: string[] = Array.isArray(r.items) ? r.items : [];
  const res = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${OS_KEY}` },
    body: JSON.stringify({
      app_id: OS_APP_ID,
      target_channel: "push",
      include_aliases: { external_id: [r.user_id] },
      headings: { en: r.title || `ตรวจของก่อนไป${r.label}` },
      contents: { en: `${r.note ? r.note + "\n" : ""}อย่าลืม: ${items.join(", ")}` },
      url: `${SITE_URL}/?r=${r.id}`,
      data: { reminderId: r.id },
      ttl: 3600,
    }),
  });
  if (!res.ok) console.error("onesignal", res.status, await res.text());
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const now = Date.now();
  const { data: due, error } = await admin
    .from("reminders").select("*")
    .not("next_fire_at", "is", null)
    .lte("next_fire_at", new Date(now).toISOString())
    .limit(200);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const r of due ?? []) {
    const late = now - Date.parse(r.next_fire_at) > LATE_MS;
    const doneToday = !r.once && r.done_on === localDateString(now, r.tz);
    // จองรายการก่อน (กันส่งซ้ำถ้าฟังก์ชันรันซ้อนกัน)
    const patch = r.once
      ? { sent_at: new Date(now).toISOString(), next_fire_at: null }
      : { next_fire_at: nextFire(r.time, r.days ?? [], r.tz, now)?.toISOString() ?? null };
    const { data: claimed } = await admin.from("reminders").update(patch)
      .eq("id", r.id).eq("next_fire_at", r.next_fire_at).select("id");
    if (!claimed || claimed.length === 0) continue;
    if (late || doneToday) continue;
    try { await push(r); sent++; } catch (e) { console.error("push failed", e); }
  }
  return new Response(JSON.stringify({ due: due?.length ?? 0, sent }), { headers: { "Content-Type": "application/json" } });
});
