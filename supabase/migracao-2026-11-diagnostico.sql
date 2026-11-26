-- Atualização de 25/11/2026: diagnóstico das notificações.
-- Rode no SQL Editor ANTES de publicar a função nova. Pode rodar de novo sem problema.
--   * lembretes_status: uma linha com a última vez que o agendador chamou a função e o último erro.
--     Só a função (chave de serviço) lê e grava; o app vê pelo botão "Verificar" das Notificações.
--   * push_subscriptions.ultimo_status: a resposta do serviço de push no último envio a cada aparelho.
create table if not exists public.lembretes_status (
  id           int primary key default 1 check (id = 1),
  ultimo_tique timestamptz,
  ultimo_erro  text,
  erro_em      timestamptz
);
alter table public.lembretes_status enable row level security;
revoke all on public.lembretes_status from anon, authenticated;
grant select, insert, update, delete on public.lembretes_status to service_role;

alter table public.push_subscriptions add column if not exists ultimo_status int;
