-- Atualização de 24/11/2026: modo foco (Pomodoro) e diário de estudo.
-- Rode DEPOIS de migracao-2026-11-acompanhamento.sql e ANTES de publicar o código novo. Pode rodar de novo sem problema.

-- Diário: o que estudou no bloco (texto simples, opcional).
alter table public.blocks add column if not exists diario text not null default '';

-- Tempos do modo foco (minutos) e som/vibração com o app aberto.
alter table public.settings add column if not exists foco_min int not null default 25;
alter table public.settings add column if not exists pausa_min int not null default 5;
alter table public.settings add column if not exists pausa_longa_min int not null default 15;
alter table public.settings add column if not exists ciclos_longa int not null default 4;
alter table public.settings add column if not exists foco_som boolean not null default true;
alter table public.settings drop constraint if exists settings_foco_check;
alter table public.settings add constraint settings_foco_check check (
  foco_min between 5 and 120 and pausa_min between 1 and 60 and pausa_longa_min between 1 and 60 and ciclos_longa between 2 and 8);

-- Foco em andamento: uma linha por pessoa. "termina_em" é quando a fase acaba (a função avisa nessa hora);
-- pausado guarda os segundos que faltam; esperando = a fase acabou e a próxima não começou.
create table if not exists public.focos (
  owner_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  fase          text not null check (fase in ('foco','pausa','pausa_longa')),
  ciclo         int not null default 1 check (ciclo >= 1),
  estado        text not null check (estado in ('rodando','pausado','esperando')),
  termina_em    timestamptz,
  restante_s    int check (restante_s is null or restante_s >= 0),
  bloco_ref     text,
  bloco_data    date,
  titulo        text not null default '',
  atualizado_em timestamptz not null default now()
);
alter table public.focos enable row level security;
revoke all on public.focos from anon, authenticated;
grant select, insert, update, delete on public.focos to authenticated;
drop policy if exists "ver o meu" on public.focos;
drop policy if exists "criar o meu" on public.focos;
drop policy if exists "alterar o meu" on public.focos;
drop policy if exists "apagar o meu" on public.focos;
create policy "ver o meu" on public.focos for select to authenticated using (owner_id = (select auth.uid()));
create policy "criar o meu" on public.focos for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "alterar o meu" on public.focos for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "apagar o meu" on public.focos for delete to authenticated using (owner_id = (select auth.uid()));
