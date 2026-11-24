-- Agenda a função "lembretes" para rodar a cada minuto (Supabase Cron).
-- Rode no SQL Editor DEPOIS de criar a função. Antes, troque os dois textos marcados abaixo:
--   1) a URL do seu projeto (Settings → API → Project URL);
--   2) o mesmo texto que você cadastrou no segredo LEMBRETES_SEGREDO da função.
-- Pode rodar de novo (por exemplo, para trocar o segredo): ele substitui o que já existe.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda URL e segredo no Vault (cofre do Supabase), fora do código.
delete from vault.secrets where name in ('lembretes_url', 'lembretes_segredo');
select vault.create_secret('https://SEU-PROJETO.supabase.co/functions/v1/lembretes', 'lembretes_url');  -- 1) troque
select vault.create_secret('COLE_AQUI_O_MESMO_LEMBRETES_SEGREDO', 'lembretes_segredo');                 -- 2) troque

select cron.unschedule(jobid) from cron.job where jobname = 'lembretes-a-cada-minuto';
select cron.schedule(
  'lembretes-a-cada-minuto',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lembretes-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_segredo')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
