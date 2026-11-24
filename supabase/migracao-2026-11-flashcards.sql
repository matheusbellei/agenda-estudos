-- Atualização de 24/11/2026: flashcards (baralhos do menu e flashcards dos cards, com repetição espaçada).
-- Rode DEPOIS das migrações das rodadas 2 a 4 e ANTES de publicar o código novo. Pode rodar de novo sem problema.

-- Baralhos do menu: fator multiplica o intervalo a cada acerto; limites de novos e de revisões por dia.
create table if not exists public.baralhos (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome         text not null check (length(trim(nome)) between 1 and 60),
  fator        numeric(3,1) not null default 2.5 check (fator between 1.3 and 5),
  novos_dia    int not null default 20 check (novos_dia between 0 and 999),
  revisoes_dia int not null default 200 check (revisoes_dia between 0 and 9999),
  criado_em    timestamptz not null default now()
);
create unique index if not exists baralhos_nome_unico on public.baralhos (owner_id, lower(trim(nome)));

-- Flashcard: de um baralho OU de um card (nunca os dois). Tipos: básico, invertido (frente e verso), lacuna, digitar.
create table if not exists public.flashcards (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  baralho_id uuid references public.baralhos(id) on delete cascade,
  card_id    uuid references public.cards(id) on delete cascade,
  tipo       text not null check (tipo in ('basico','invertido','lacuna','digitar')),
  frente     text not null check (length(trim(frente)) > 0),
  verso      text not null default '',
  criado_em  timestamptz not null default now(),
  constraint flashcards_um_dono check ((baralho_id is null) <> (card_id is null))
);
create index if not exists flashcards_baralho on public.flashcards (baralho_id);
create index if not exists flashcards_card on public.flashcards (card_id);

-- Agendamento de cada lado estudável (a frente; e o verso, no invertido).
create table if not exists public.flash_lados (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  flashcard_id   uuid not null references public.flashcards(id) on delete cascade,
  lado           text not null check (lado in ('frente','verso')),
  intervalo      int not null default 0 check (intervalo >= 0),
  vence          date,
  errado_em      date,
  introduzido_em date,
  revisado_em    date,
  unique (flashcard_id, lado)
);

-- Resumo por dia para os Dashboards: lados respondidos pela 1ª vez no dia e quantos desses certos de primeira.
create table if not exists public.flash_dias (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data      date not null,
  revisados int not null default 0 check (revisados >= 0),
  acertos   int not null default 0 check (acertos between 0 and revisados),
  unique (owner_id, data)
);

-- Padrões dos flashcards dos cards e o aviso diário.
alter table public.settings add column if not exists flash_card_novos_dia int not null default 20;
alter table public.settings add column if not exists flash_card_revisoes_dia int not null default 200;
alter table public.settings add column if not exists flash_card_fator numeric(3,1) not null default 2.5;
alter table public.settings add column if not exists flash_aviso boolean not null default true;
alter table public.settings add column if not exists flash_aviso_min int not null default 1140;
alter table public.settings drop constraint if exists settings_flash_check;
alter table public.settings add constraint settings_flash_check check (
  flash_card_novos_dia between 0 and 999 and flash_card_revisoes_dia between 0 and 9999
  and flash_card_fator between 1.3 and 5 and flash_aviso_min between 0 and 1439);

do $$
declare t text;
begin
  foreach t in array array['baralhos', 'flashcards', 'flash_lados', 'flash_dias'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "ver o meu" on public.%I', t);
    execute format('drop policy if exists "criar o meu" on public.%I', t);
    execute format('drop policy if exists "alterar o meu" on public.%I', t);
    execute format('drop policy if exists "apagar o meu" on public.%I', t);
    execute format('create policy "ver o meu" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy "criar o meu" on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "alterar o meu" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "apagar o meu" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- O flashcard só aponta para baralho/card do próprio dono; o lado, para flashcard do próprio dono.
drop policy if exists "flashcard aponta para o que é meu" on public.flashcards;
create policy "flashcard aponta para o que é meu" on public.flashcards as restrictive for all to authenticated
  using (true)
  with check ((baralho_id is null or exists (select 1 from public.baralhos b where b.id = baralho_id and b.owner_id = (select auth.uid())))
          and (card_id is null or exists (select 1 from public.cards c where c.id = card_id and c.owner_id = (select auth.uid()))));
drop policy if exists "lado é de flashcard meu" on public.flash_lados;
create policy "lado é de flashcard meu" on public.flash_lados as restrictive for all to authenticated
  using (true)
  with check (exists (select 1 from public.flashcards f where f.id = flashcard_id and f.owner_id = (select auth.uid())));

-- Soma uma resposta no resumo do dia de forma atômica (dois aparelhos ao mesmo tempo não perdem contagem).
create or replace function public.flash_somar_dia(p_data date, p_acerto int)
returns public.flash_dias language sql security invoker set search_path = '' as $$
  insert into public.flash_dias (data, revisados, acertos) values (p_data, 1, least(greatest(p_acerto, 0), 1))
  on conflict (owner_id, data) do update
    set revisados = public.flash_dias.revisados + 1, acertos = public.flash_dias.acertos + excluded.acertos
  returning *;
$$;
revoke all on function public.flash_somar_dia(date, int) from public, anon;
grant execute on function public.flash_somar_dia(date, int) to authenticated;
