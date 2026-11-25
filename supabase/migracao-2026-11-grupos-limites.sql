-- Atualização de 24/11/2026: limites de novos e revisões por dia definidos no grupo de baralhos.
-- Rode DEPOIS de migracao-2026-11-ajustes.sql e ANTES de publicar o código novo. Pode rodar de novo sem problema.
-- Num grupo com limites_do_grupo, os seus novos_dia e revisoes_dia valem para todos os baralhos de dentro
-- (o grupo mais de cima com limites manda).
alter table public.baralhos add column if not exists limites_do_grupo boolean not null default false;
