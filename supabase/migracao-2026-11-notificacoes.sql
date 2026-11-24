-- Atualização de 23/11/2026: notificações com o app fechado (lembretes, resumo, pendências, silêncio).
-- Rode uma vez no SQL Editor do Supabase ANTES de publicar o código novo. Pode rodar de novo sem problema.

-- Preferências (uma linha por pessoa em settings). Minutos contados a partir de 00:00.
alter table public.settings add column if not exists notif_antes_min int not null default 10;
alter table public.settings add column if not exists notif_resumo boolean not null default true;
alter table public.settings add column if not exists notif_resumo_min int not null default 420;
alter table public.settings add column if not exists notif_pendencias boolean not null default true;
alter table public.settings add column if not exists notif_pendencias_min int not null default 1290;
alter table public.settings add column if not exists notif_silencio boolean not null default false;
alter table public.settings add column if not exists notif_silencio_de int not null default 1320;
alter table public.settings add column if not exists notif_silencio_ate int not null default 420;
alter table public.settings add column if not exists fuso text not null default 'America/Sao_Paulo';
alter table public.settings drop constraint if exists settings_notif_check;
alter table public.settings add constraint settings_notif_check check (
  notif_antes_min in (-1,0,5,10,15,30,60)
  and notif_resumo_min between 0 and 1439 and notif_pendencias_min between 0 and 1439
  and notif_silencio_de between 0 and 1439 and notif_silencio_ate between 0 and 1439);

-- Lembrete por bloco e por fixa: null = padrão; -1 = nenhum; 0 = na hora; N = minutos antes.
alter table public.blocks add column if not exists lembrete_min int;
alter table public.blocks drop constraint if exists blocks_lembrete_check;
alter table public.blocks add constraint blocks_lembrete_check check (lembrete_min is null or lembrete_min in (-1,0,5,10,15,30,60));
alter table public.commitments add column if not exists lembrete_min int;
alter table public.commitments drop constraint if exists commitments_lembrete_check;
alter table public.commitments add constraint commitments_lembrete_check check (lembrete_min is null or lembrete_min in (-1,0,5,10,15,30,60));

-- Aparelhos que recebem notificação (uma inscrição de push por navegador).
create table if not exists public.push_subscriptions (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  aparelho  text not null default '',
  criado_em timestamptz not null default now(),
  ultimo_ok timestamptz
);
create index if not exists push_subscriptions_owner_idx on public.push_subscriptions (owner_id);

-- "Adiar 10 min": quando mandar o lembrete de novo.
create table if not exists public.adiamentos (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ref      text not null,
  data     date not null,
  quando   timestamptz not null
);
create index if not exists adiamentos_quando_idx on public.adiamentos (quando);

-- O que já foi enviado (impede repetir). Só a função, com a chave de serviço, mexe aqui.
create table if not exists public.notificacoes_enviadas (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  chave      text not null,
  enviada_em timestamptz not null default now(),
  primary key (owner_id, chave)
);

alter table public.push_subscriptions enable row level security;
alter table public.adiamentos enable row level security;
alter table public.notificacoes_enviadas enable row level security;
revoke all on public.push_subscriptions, public.adiamentos, public.notificacoes_enviadas from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, insert, delete on public.adiamentos to authenticated;

drop policy if exists "ver o meu" on public.push_subscriptions;
drop policy if exists "criar o meu" on public.push_subscriptions;
drop policy if exists "apagar o meu" on public.push_subscriptions;
create policy "ver o meu" on public.push_subscriptions for select to authenticated using (owner_id = (select auth.uid()));
create policy "criar o meu" on public.push_subscriptions for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "apagar o meu" on public.push_subscriptions for delete to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "ver o meu" on public.adiamentos;
drop policy if exists "criar o meu" on public.adiamentos;
drop policy if exists "apagar o meu" on public.adiamentos;
create policy "ver o meu" on public.adiamentos for select to authenticated using (owner_id = (select auth.uid()));
create policy "criar o meu" on public.adiamentos for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "apagar o meu" on public.adiamentos for delete to authenticated using (owner_id = (select auth.uid()));
