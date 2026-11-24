-- Atualização de 24/11/2026: modelos de semana e revisão espaçada dos cards.
-- Rode DEPOIS de migracao-2026-11-foco-diario.sql e ANTES de publicar o código novo. Pode rodar de novo sem problema.

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
