-- Atualização de 27/11/2026: bloco da agenda pode ser vinculado a um baralho (ou grupo) de flashcards.
-- Rode ANTES de publicar o código novo. Pode rodar de novo sem problema.

-- Bloco vinculado a um baralho (ou grupo) de flashcards, só para organização: nada acontece ao cumprir.
alter table public.blocks add column if not exists baralho_id uuid references public.baralhos(id) on delete set null;
create index if not exists blocks_baralho_idx on public.blocks (baralho_id);

-- O baralho do bloco precisa ser do mesmo dono (como já vale para categoria, card, item e fixa).
drop policy if exists "criar o meu" on public.blocks;
drop policy if exists "editar o meu" on public.blocks;
create policy "criar o meu" on public.blocks for insert to authenticated with check (
  owner_id = (select auth.uid())
  and (category_id is null or exists (select 1 from public.categories x where x.id = category_id and x.owner_id = (select auth.uid())))
  and (card_id is null or exists (select 1 from public.cards x where x.id = card_id and x.owner_id = (select auth.uid())))
  and (item_id is null or exists (select 1 from public.items x where x.id = item_id and x.owner_id = (select auth.uid())))
  and (commitment_id is null or exists (select 1 from public.commitments x where x.id = commitment_id and x.owner_id = (select auth.uid())))
  and (baralho_id is null or exists (select 1 from public.baralhos x where x.id = baralho_id and x.owner_id = (select auth.uid()))));
create policy "editar o meu" on public.blocks for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
  owner_id = (select auth.uid())
  and (category_id is null or exists (select 1 from public.categories x where x.id = category_id and x.owner_id = (select auth.uid())))
  and (card_id is null or exists (select 1 from public.cards x where x.id = card_id and x.owner_id = (select auth.uid())))
  and (item_id is null or exists (select 1 from public.items x where x.id = item_id and x.owner_id = (select auth.uid())))
  and (commitment_id is null or exists (select 1 from public.commitments x where x.id = commitment_id and x.owner_id = (select auth.uid())))
  and (baralho_id is null or exists (select 1 from public.baralhos x where x.id = baralho_id and x.owner_id = (select auth.uid()))));

-- Compromisso que se repete também leva o baralho (os dias gerados herdam).
alter table public.commitments add column if not exists baralho_id uuid references public.baralhos(id) on delete set null;
drop policy if exists "criar o meu" on public.commitments;
drop policy if exists "editar o meu" on public.commitments;
create policy "criar o meu" on public.commitments for insert to authenticated with check (
  owner_id = (select auth.uid())
  and (category_id is null or exists (select 1 from public.categories x where x.id = category_id and x.owner_id = (select auth.uid())))
  and (card_id is null or exists (select 1 from public.cards x where x.id = card_id and x.owner_id = (select auth.uid())))
  and (baralho_id is null or exists (select 1 from public.baralhos x where x.id = baralho_id and x.owner_id = (select auth.uid()))));
create policy "editar o meu" on public.commitments for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
  owner_id = (select auth.uid())
  and (category_id is null or exists (select 1 from public.categories x where x.id = category_id and x.owner_id = (select auth.uid())))
  and (card_id is null or exists (select 1 from public.cards x where x.id = card_id and x.owner_id = (select auth.uid())))
  and (baralho_id is null or exists (select 1 from public.baralhos x where x.id = baralho_id and x.owner_id = (select auth.uid()))));
