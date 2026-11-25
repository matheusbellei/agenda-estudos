-- Atualização de 24/11/2026 (ajustes do card, Arquivo, agenda e flashcards).
-- Rode ANTES de publicar o código novo. Pode rodar de novo sem problema.

-- Arquivo no estilo do Trello: quando o card foi arquivado. Os já arquivados ficam sem data ("Sem data").
alter table public.cards add column if not exists archived_at timestamptz;

-- Dia padrão: da meia-noite à meia-noite (vale para quem ainda não tem horários salvos; os seus continuam).
alter table public.settings alter column day_start_min set default 0;
alter table public.settings alter column day_end_min set default 1440;

-- Não feito: o porquê (opcional), ao lado do "o que fiz no lugar".
alter table public.blocks add column if not exists motivo text not null default '';

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
