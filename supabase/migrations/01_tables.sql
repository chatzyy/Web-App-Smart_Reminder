-- ตารางรายการเตือน (ข้อมูลของผู้ใช้แต่ละคนแยกกันด้วย RLS)
create table if not exists public.reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  time         text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  once         boolean not null default true,
  days         smallint[] not null default '{}',   -- 1 = อาทิตย์ ... 7 = เสาร์
  title        text not null default '' check (char_length(title) <= 60),
  note         text not null default '' check (char_length(note) <= 200),
  label        text not null check (char_length(label) <= 60),
  icon         text not null default 'list' check (char_length(icon) <= 30),
  items        jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 50),
  tz           text not null default 'Asia/Bangkok' check (char_length(tz) <= 60),
  next_fire_at timestamptz,
  sent_at      timestamptz,
  done_on      date,
  created_at   timestamptz not null default now()
);

create index if not exists reminders_due_idx on public.reminders (next_fire_at) where next_fire_at is not null;
create index if not exists reminders_user_idx on public.reminders (user_id);

alter table public.reminders enable row level security;

drop policy if exists "own select" on public.reminders;
drop policy if exists "own insert" on public.reminders;
drop policy if exists "own update" on public.reminders;
drop policy if exists "own delete" on public.reminders;

create policy "own select" on public.reminders for select to authenticated using (user_id = (select auth.uid()));
create policy "own insert" on public.reminders for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own update" on public.reminders for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own delete" on public.reminders for delete to authenticated using (user_id = (select auth.uid()));

-- จำกัดไม่เกิน 50 รายการต่อผู้ใช้ กันการยิงข้อมูลรัว ๆ
create or replace function public.limit_reminders() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.reminders where user_id = new.user_id) >= 50 then
    raise exception 'reminder limit reached';
  end if;
  return new;
end $$;

drop trigger if exists reminders_limit on public.reminders;
create trigger reminders_limit before insert on public.reminders
for each row execute function public.limit_reminders();
