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
  -- Subtag: aponta para a tag mãe (dois níveis só; a regra fica no app). Excluir a mãe leva as subtags.
  parent_id uuid references public.categories(id) on delete cascade,
  icon      text not null default 'tag',
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
  archived_at  timestamptz,  -- quando foi arquivado (grupos do Arquivo)
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  is_fixed     boolean not null default false,
  fixed_days   int[] not null default '{}',
  trello_id    text,
  unique (owner_id, trello_id)
);
create index cards_list_idx on public.cards (list_id);
create index categories_parent_idx on public.categories (parent_id);

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
  card_id     uuid references public.cards(id) on delete set null,
  check (start_min >= 0 and end_min <= 1440 and start_min < end_min),
  check (days <@ array[1,2,3,4,5,6,7])
);
create index commitments_card_idx on public.commitments (card_id);

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
  day_start_min   int not null default 0,
  day_end_min     int not null default 1440,
  week_slot_min   int not null default 120,
  day_slot_min    int not null default 30,
  last_rollover   date,
  -- Bloco sem card: perguntar ao salvar, criar sempre ou nunca criar; e a lista que recebe o card criado.
  auto_card       text not null default 'perguntar' constraint settings_auto_card_check check (auto_card in ('perguntar','sempre','nunca')),
  auto_card_list_id uuid references public.lists(id) on delete set null
);

-- A regra de acesso de categories não pode consultar categories (o Postgres acusa recursão):
-- esta função confere, por fora das regras, se a tag mãe é de quem está logado.
-- "volatile" para enxergar a mãe gravada no mesmo insert (a restauração do backup grava em lote).
create or replace function public.e_minha_categoria(cat uuid) returns boolean
  language sql volatile security definer set search_path = ''
  as $$ select exists (select 1 from public.categories c where c.id = cat and c.owner_id = (select auth.uid())) $$;
revoke all on function public.e_minha_categoria(uuid) from public, anon;
grant execute on function public.e_minha_categoria(uuid) to authenticated;

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
      when 'categories' then
        ' and (parent_id is null or public.e_minha_categoria(parent_id))'
      when 'settings' then
        ' and (auto_card_list_id is null or exists (select 1 from public.lists x where x.id = auto_card_list_id and x.owner_id = ' || dono || '))'
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
        || ' and (card_id is null or exists (select 1 from public.cards x where x.id = card_id and x.owner_id = ' || dono || '))'
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

-- ============ Notificações (o mesmo da migracao-2026-11-notificacoes.sql) ============
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

-- ============ Acompanhamento (24/11/2026) ============
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

-- ============ Modo foco e diário (24/11/2026) ============
-- Diário: o que estudou no bloco (texto simples, opcional).
alter table public.blocks add column if not exists diario text not null default '';
alter table public.blocks add column if not exists motivo text not null default '';  -- não feito: o porquê

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

-- ============ Modelos de semana e revisão espaçada (24/11/2026) ============
-- Modelos de semana: cada um guarda a lista de blocos (dia 1..7, horário, título, card, tag...) dentro da própria linha.
create table if not exists public.modelos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome          text not null check (length(trim(nome)) between 1 and 60),
  blocos        jsonb not null default '[]'::jsonb check (jsonb_typeof(blocos) = 'array'),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists modelos_nome_unico on public.modelos (owner_id, lower(trim(nome)));

-- Revisão espaçada: uma linha por data marcada para rever um card. Datas fixas: atrasar uma não move as outras.
create table if not exists public.revisoes (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id   uuid not null references public.cards(id) on delete cascade,
  data      date not null,
  status    text not null default 'pendente' check (status in ('pendente','feita','cancelada')),
  feita_em  timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists revisoes_dono_data on public.revisoes (owner_id, data);
create index if not exists revisoes_card on public.revisoes (card_id);

-- Bloco que é a sessão de uma revisão (apagar a revisão solta o bloco).
alter table public.blocks add column if not exists revisao_id uuid references public.revisoes(id) on delete set null;

-- Dias padrão das revisões (contados do dia em que agenda) e se os modelos levam os compromissos fixos.
alter table public.settings add column if not exists revisoes_dias int[] not null default '{7,30}';
alter table public.settings add column if not exists modelos_com_fixas boolean not null default false;
create or replace function public.revisoes_dias_validos(d int[]) returns boolean language sql immutable set search_path = '' as $$
  select cardinality(d) between 1 and 6
     and not exists (select 1 from unnest(d) with ordinality as x(v, i)
                     where v < 1 or v > 365 or (i > 1 and v <= d[i - 1]))
$$;
alter table public.settings drop constraint if exists settings_revisoes_check;
alter table public.settings add constraint settings_revisoes_check check (public.revisoes_dias_validos(revisoes_dias));

do $$
declare t text;
begin
  foreach t in array array['modelos', 'revisoes'] loop
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

-- A revisão só pode apontar para um card do próprio dono.
drop policy if exists "card da revisão é meu" on public.revisoes;
drop policy if exists "card da revisão continua meu" on public.revisoes;
create policy "card da revisão é meu" on public.revisoes as restrictive for insert to authenticated
  with check (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = (select auth.uid())));
create policy "card da revisão continua meu" on public.revisoes as restrictive for update to authenticated
  with check (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = (select auth.uid())));

-- ============ Flashcards (24/11/2026) ============
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

-- Grupos de baralhos: um grupo é um baralho marcado como grupo (só tem nome; não recebe flashcards).
-- Baralhos e grupos podem ficar dentro de um grupo (pai_id), em quantos níveis quiser.
alter table public.baralhos add column if not exists e_grupo boolean not null default false;
alter table public.baralhos add column if not exists pai_id uuid references public.baralhos(id) on delete set null;
alter table public.baralhos drop constraint if exists baralhos_pai_check;
alter table public.baralhos add constraint baralhos_pai_check check (pai_id is null or pai_id <> id);
create index if not exists baralhos_pai_idx on public.baralhos (pai_id);

-- A regra de acesso de baralhos não pode consultar baralhos (recursão): esta função confere por fora
-- se o grupo de cima é um grupo de quem está logado.
create or replace function public.e_meu_grupo_de_baralhos(grupo uuid) returns boolean
  language sql volatile security definer set search_path = ''
  as $$ select exists (select 1 from public.baralhos b where b.id = grupo and b.e_grupo and b.owner_id = (select auth.uid())) $$;
revoke all on function public.e_meu_grupo_de_baralhos(uuid) from public, anon;
grant execute on function public.e_meu_grupo_de_baralhos(uuid) to authenticated;
drop policy if exists "grupo de cima é meu" on public.baralhos;
create policy "grupo de cima é meu" on public.baralhos as restrictive for all to authenticated
  using (true)
  with check (pai_id is null or public.e_meu_grupo_de_baralhos(pai_id));
