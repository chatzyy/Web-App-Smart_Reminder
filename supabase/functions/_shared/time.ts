// ตัวช่วยคำนวณเวลาตามเขตเวลาของผู้ใช้ (IANA เช่น Asia/Bangkok)
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function localParts(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const p = localParts(utcMs, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
}

export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
}

export function localDateString(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

// เวลาแจ้งเตือนครั้งถัดไปหลังจาก afterMs (weekday: 1 = อาทิตย์ ... 7 = เสาร์)
export function nextFire(time: string, days: number[], tz: string, afterMs: number): Date | null {
  const [h, mi] = time.split(":").map(Number);
  const lp = localParts(afterMs, tz);
  for (let off = 0; off <= 8; off++) {
    const dt = new Date(Date.UTC(lp.y, lp.m - 1, lp.d + off));
    if (!days.includes(dt.getUTCDay() + 1)) continue;
    const utc = zonedToUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h, mi, tz);
    if (utc > afterMs) return new Date(utc);
  }
  return null;
}
