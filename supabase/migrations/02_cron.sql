-- รันหลัง deploy ฟังก์ชัน send-due แล้ว
-- 1) แก้ 3 ค่าด้านล่าง: URL โปรเจกต์, และรหัสลับ CRON_SECRET (ต้องตรงกับที่ตั้งด้วย supabase secrets set)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://wozijmernlstkzriycch.supabase.co', 'project_url');
select vault.create_secret('c2cca3de878e27b393046996db0e031e725bd5efd8e19992', 'cron_secret');

-- 2) ให้เรียก send-due ทุกนาที
select cron.schedule(
  'send-due-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
