-- Agenda e Controle de Estudos — esquema do banco (Supabase / Postgres)
-- Rode este arquivo inteiro uma vez no SQL Editor de um projeto novo do Supabase.
-- Datas em 'YYYY-MM-DD'; horários em minutos desde a meia-noite (0 a 1440).
-- Dias da semana: 1 = segunda ... 7 = domingo.

-- ============ Tabelas ============

create table public.categories (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users(id),
  name      text not null,
  color     text not null default '#6F4E37',
  archived  boolean not null default false,
  trello_id text,
  -- Tabela comum (não índice parcial): o upsert do supabase-js precisa de onConflict sem predicado.
  -- NULLs contam como distintos, então linhas sem trello_id continuam livres.
  unique (owner_id, trello_id)
);

create table public.lists (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users(id),
  name      text not null,
  position  double precision not null,
  is_done   boolean not null default false,
  is_active boolean not null default false,
  trello_id text,
  unique (owner_id, trello_id)
);
-- No máximo uma lista de conclusão e uma lista ativa por dono.
create unique index lists_uma_concluida on public.lists (owner_id) where is_done;
create unique index lists_uma_ativa on public.lists (owner_id) where is_active;

create table public.cards (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id),
  title        text not null,
  list_id      uuid references public.lists(id),
  position     double precision not null default 0,
  notes        text not null default '',
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  is_fixed     boolean not null default false,
  fixed_days   int[] not null default '{}',
  trello_id    text,
  unique (owner_id, trello_id)
);
create index cards_list_idx on public.cards (list_id);

create table public.card_categories (
  owner_id    uuid not null default auth.uid() references auth.users(id),
  card_id     uuid not null references public.cards(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (card_id, category_id)
);
create index card_categories_category_idx on public.card_categories (category_id);

create table public.items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id),
  card_id    uuid not null references public.cards(id) on delete cascade,
  group_name text not null default '',
  title      text not null,
  position   double precision not null default 0,
  done       boolean not null default false,
  done_at    timestamptz,
  notes      text not null default '',
  trello_id  text,
  unique (owner_id, trello_id)
);
create index items_card_idx on public.items (card_id);

create table public.attachments (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users(id),
  card_id   uuid not null references public.cards(id) on delete cascade,
  item_id   uuid references public.items(id) on delete cascade,
  kind      text not null check (kind in ('file','link','pending')),
  name      text not null,
  path      text,
  url       text,
  trello_id text,
  unique (owner_id, trello_id)
);
create index attachments_card_idx on public.attachments (card_id);
create index attachments_item_idx on public.attachments (item_id);

create table public.commitments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id),
  title       text not null,
  category_id uuid references public.categories(id) on delete set null,
  days        int[] not null,
  start_min   int not null,
  end_min     int not null,
  valid_from  date not null,
  valid_to    date,
  check (start_min >= 0 and end_min <= 1440 and start_min < end_min),
  check (days <@ array[1,2,3,4,5,6,7])
);

create table public.blocks (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id),
  date          date not null,
  start_min     int not null,
  end_min       int not null,
  kind          text not null check (kind in ('commitment','study')),
  title         text not null default '',
  category_id   uuid references public.categories(id) on delete set null,
  card_id       uuid references public.cards(id) on delete set null,
  item_id       uuid references public.items(id) on delete set null,
  commitment_id uuid references public.commitments(id) on delete cascade,
  fixed_date    date,
  status        text not null default 'planned' check (status in ('planned','done','missed')),
  instead_note  text not null default '',
  cancelled     boolean not null default false,
  unique (commitment_id, date),
  check (start_min >= 0 and end_min <= 1440 and start_min < end_min)
);
create index blocks_date_idx on public.blocks (owner_id, date);
create index blocks_card_idx on public.blocks (card_id);
create index blocks_item_idx on public.blocks (item_id);

create table public.occurrences (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id),
  card_id      uuid not null references public.cards(id) on delete cascade,
  date         date not null,
  status       text not null check (status in ('done','missed','carried')),
  instead_note text not null default '',
  unique (card_id, date)
);

create table public.settings (
  owner_id        uuid primary key default auth.uid() references auth.users(id),
  day_start_min   int not null default 360,
  day_end_min     int not null default 1320,
  week_slot_min   int not null default 120,
  day_slot_min    int not null default 30,
  last_rollover   date
);

-- ============ Acesso ============
-- Só o papel authenticated enxerga as tabelas, e só com select/insert/update/delete; anon não tem acesso a nada.
-- O Supabase dá todos os privilégios por padrão: primeiro tira tudo, depois concede só o necessário.

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.categories, public.lists, public.cards, public.card_categories, public.items,
  public.attachments, public.commitments, public.blocks, public.occurrences, public.settings
  to authenticated;

alter table public.categories      enable row level security;
alter table public.lists           enable row level security;
alter table public.cards           enable row level security;
alter table public.card_categories enable row level security;
alter table public.items           enable row level security;
alter table public.attachments     enable row level security;
alter table public.commitments     enable row level security;
alter table public.blocks          enable row level security;
alter table public.occurrences     enable row level security;
alter table public.settings        enable row level security;

-- Todas as tabelas: select/insert/update/delete só com owner_id = auth.uid().
-- Insert e update ainda exigem que toda referência a outra tabela aponte para linha do mesmo dono.
do $$
declare
  t text;
  extra text;
  dono constant text := '(select auth.uid())';
begin
  foreach t in array array['categories','lists','cards','card_categories','items','attachments',
                           'commitments','blocks','occurrences','settings'] loop
    extra := case t
      when 'cards' then
        ' and (list_id is null or exists (select 1 from public.lists x where x.id = list_id and x.owner_id = ' || dono || '))'
      when 'card_categories' then
        ' and exists (select 1 from public.cards x where x.id = card_id and x.owner_id = ' || dono || ')'
        || ' and exists (select 1 from public.categories x where x.id = category_id and x.owner_id = ' || dono || ')'
      when 'items' then
        ' and exists (select 1 from public.cards x where x.id = card_id and x.owner_id = ' || dono || ')'
      when 'attachments' then
        ' and exists (select 1 from public.cards x where x.id = card_id and x.owner_id = ' || dono || ')'
        || ' and (item_id is null or exists (select 1 from public.items x where x.id = item_id and x.owner_id = ' || dono || '))'
      when 'commitments' then
        ' and (category_id is null or exists (select 1 from public.categories x where x.id = category_id and x.owner_id = ' || dono || '))'
      when 'blocks' then
        ' and (category_id is null or exists (select 1 from public.categories x where x.id = category_id and x.owner_id = ' || dono || '))'
        || ' and (card_id is null or exists (select 1 from public.cards x where x.id = card_id and x.owner_id = ' || dono || '))'
        || ' and (item_id is null or exists (select 1 from public.items x where x.id = item_id and x.owner_id = ' || dono || '))'
        || ' and (commitment_id is null or exists (select 1 from public.commitments x where x.id = commitment_id and x.owner_id = ' || dono || '))'
      when 'occurrences' then
        ' and exists (select 1 from public.cards x where x.id = card_id and x.owner_id = ' || dono || ')'
      else '' end;
    execute format('create policy "ver o meu" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy "criar o meu" on public.%I for insert to authenticated with check (owner_id = (select auth.uid())%s)', t, extra);
    execute format('create policy "editar o meu" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid())%s)', t, extra);
    execute format('create policy "excluir o meu" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ============ Armazenamento de anexos ============
-- Bucket privado "anexos"; caminho {owner_id}/{card_id}/{uuid}-{nome}. Só roda onde o Storage existe
-- (no Postgres local de teste não há esquema storage).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('anexos', 'anexos', false)
    on conflict (id) do update set public = false;

    create policy "anexos: ler os meus" on storage.objects for select to authenticated
      using (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy "anexos: gravar os meus" on storage.objects for insert to authenticated
      with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy "anexos: editar os meus" on storage.objects for update to authenticated
      using (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy "anexos: excluir os meus" on storage.objects for delete to authenticated
      using (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
