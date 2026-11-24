-- Atualização de 24/11/2026: acompanhamento (tags de estudo, metas, sequência e revisão da semana).
-- Rode uma vez no SQL Editor do Supabase ANTES de publicar o código novo. Pode rodar de novo sem problema.

-- Tag que conta como estudo (a subtag segue a mãe) e meta semanal em minutos (null = sem meta).
alter table public.categories add column if not exists conta_estudo boolean not null default false;
alter table public.categories add column if not exists meta_semanal_min int;
alter table public.categories drop constraint if exists categories_meta_check;
alter table public.categories add constraint categories_meta_check check (meta_semanal_min is null or meta_semanal_min > 0);

-- Meta total de horas do card, em minutos (null = sem meta).
alter table public.cards add column if not exists meta_min int;
alter table public.cards drop constraint if exists cards_meta_check;
alter table public.cards add constraint cards_meta_check check (meta_min is null or meta_min > 0);

-- Sequência: mínimo de estudo cumprido por dia. Revisão da semana: aviso no dia (1 = seg … 7 = dom) e horário.
alter table public.settings add column if not exists sequencia_min int not null default 30;
alter table public.settings add column if not exists revisao boolean not null default true;
alter table public.settings add column if not exists revisao_dia int not null default 7;
alter table public.settings add column if not exists revisao_min int not null default 1200;
alter table public.settings drop constraint if exists settings_acompanhamento_check;
alter table public.settings add constraint settings_acompanhamento_check check (
  sequencia_min between 5 and 600 and revisao_dia between 1 and 7 and revisao_min between 0 and 1439);
