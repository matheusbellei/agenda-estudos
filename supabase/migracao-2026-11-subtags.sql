-- Atualização de novembro de 2026: subtags e ícones nas tags, card nas fixas e criação automática de card.
-- Rode uma vez no SQL Editor do Supabase (projeto da Agenda de Estudos). Pode rodar de novo sem problema:
-- nada é apagado e o que já existe continua igual.

alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete cascade;
alter table public.categories add column if not exists icon text not null default 'tag';
create index if not exists categories_parent_idx on public.categories (parent_id);

alter table public.commitments add column if not exists card_id uuid references public.cards(id) on delete set null;
create index if not exists commitments_card_idx on public.commitments (card_id);

alter table public.settings add column if not exists auto_card text not null default 'perguntar';
alter table public.settings drop constraint if exists settings_auto_card_check;
alter table public.settings add constraint settings_auto_card_check check (auto_card in ('perguntar','sempre','nunca'));
alter table public.settings add column if not exists auto_card_list_id uuid references public.lists(id) on delete set null;

-- A regra de acesso de categories não pode consultar categories (o Postgres acusa recursão):
-- esta função confere, por fora das regras, se a tag mãe é de quem está logado.
-- "volatile" para enxergar a mãe gravada no mesmo insert (a restauração do backup grava em lote).
create or replace function public.e_minha_categoria(cat uuid) returns boolean
  language sql volatile security definer set search_path = ''
  as $$ select exists (select 1 from public.categories c where c.id = cat and c.owner_id = (select auth.uid())) $$;
revoke all on function public.e_minha_categoria(uuid) from public, anon;
grant execute on function public.e_minha_categoria(uuid) to authenticated;

-- Políticas de gravação: a tag mãe, o card da fixa e a lista escolhida precisam ser do mesmo dono.
drop policy if exists "criar o meu" on public.categories;
drop policy if exists "editar o meu" on public.categories;
create policy "criar o meu" on public.categories for insert to authenticated
  with check (owner_id = (select auth.uid())
    and (parent_id is null or public.e_minha_categoria(parent_id)));
create policy "editar o meu" on public.categories for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and (parent_id is null or public.e_minha_categoria(parent_id)));

drop policy if exists "criar o meu" on public.commitments;
drop policy if exists "editar o meu" on public.commitments;
create policy "criar o meu" on public.commitments for insert to authenticated
  with check (owner_id = (select auth.uid())
    and (category_id is null or exists (select 1 from public.categories x where x.id = category_id and x.owner_id = (select auth.uid())))
    and (card_id is null or exists (select 1 from public.cards x where x.id = card_id and x.owner_id = (select auth.uid()))));
create policy "editar o meu" on public.commitments for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and (category_id is null or exists (select 1 from public.categories x where x.id = category_id and x.owner_id = (select auth.uid())))
    and (card_id is null or exists (select 1 from public.cards x where x.id = card_id and x.owner_id = (select auth.uid()))));

drop policy if exists "criar o meu" on public.settings;
drop policy if exists "editar o meu" on public.settings;
create policy "criar o meu" on public.settings for insert to authenticated
  with check (owner_id = (select auth.uid())
    and (auto_card_list_id is null or exists (select 1 from public.lists x where x.id = auto_card_list_id and x.owner_id = (select auth.uid()))));
create policy "editar o meu" on public.settings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and (auto_card_list_id is null or exists (select 1 from public.lists x where x.id = auto_card_list_id and x.owner_id = (select auth.uid()))));
