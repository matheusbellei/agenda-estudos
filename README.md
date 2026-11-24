# Agenda e Controle de Estudos

App para organizar estudos: um quadro de cards (substitui o Trello), um calendário por semana e por dia, uma fila do que falta encaixar e a busca em tudo o que foi escrito. Funciona no celular e no computador, com os dados guardados no Supabase.

- Quadro com colunas, cards, itens em listas de tarefas, categorias com cor e anotações com formatação
- Anexos: links e arquivos (PDFs, imagens) ligados a cards e itens
- Calendário da semana e do dia, com compromissos que se repetem e blocos de estudo
- Fila "Para encaixar": escolha um item e toque no horário em que quer estudar
- Marcar cada bloco como cumprido ou não feito, com a anotação "o que fiz no lugar"
- Fixas: estudos que se repetem toda semana, com uma pergunta sobre o que ficou pendente a cada virada de semana
- Busca em cards, itens, anotações e blocos
- Importação do quadro do Trello e backup em JSON

## Como colocar no ar

### 1. Banco (Supabase) — uma vez só

Crie um projeto **novo** no Supabase, só para este app. Não use o projeto do app de finanças.

1. No painel do projeto novo, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Esperado: "Success. No rows returned". O arquivo cria 10 tabelas e o armazenamento privado `anexos`.
3. Confira as tabelas: no **Table Editor**, as 10 tabelas devem aparecer com **RLS enabled** (a proteção que só deixa cada pessoa ver os próprios dados). Pelo SQL Editor: `select tablename, rowsecurity from pg_tables where schemaname='public';` deve mostrar 10 linhas, todas `true`.
4. Confira o armazenamento: em **Storage**, o bucket `anexos` deve existir e estar marcado como **Private**.
5. Em **Authentication → Users**, crie a sua conta (e-mail e senha), marcando **Auto Confirm User**.
6. Em **Authentication → Sign In / Providers**, deixe **Allow new users to sign up** desligado.

### 2. Chaves do app

1. No Supabase, abra **Project Settings → API** (ou **API Keys**).
2. Copie a **URL do projeto** e a **publishable key**.
3. Abra o arquivo `js/config.js` e troque os dois textos de exemplo pelos valores copiados:

```js
export const SUPABASE_URL = 'https://exemplo.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_exemplo';
```

A publishable key é pública por natureza. Nunca coloque a *secret key* nem a senha do banco em nenhum arquivo.

### 3. GitHub Pages

1. Crie um repositório **público** no GitHub (ex.: `agenda-estudos`).
2. Publique o código no branch `main`, de um destes jeitos:
   - **Com git** (recomendado): na pasta do projeto, `git push` para o branch `main` do repositório. O git respeita o `.gitignore` e não envia pastas internas nem caches de teste.
   - **Pelo site do GitHub** (**Add file → Upload files**): envie **somente** `index.html`, `manifest.webmanifest`, `sw.js`, as pastas `css/`, `js/`, `vendor/`, `icones/` e `supabase/`, o `README.md` e o `docs/DECISOES.md`. Não arraste a pasta inteira: o upload pelo site ignora o `.gitignore` e levaria pastas ocultas (como `.superpowers/` e `.git/`) e caches dos testes (`__pycache__`). Sem `css/`, `js/` e `vendor/` a tela fica em branco.
3. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e salve. O GitHub Pages publica o que está em `main`.
4. Em 1 a 2 minutos o app fica em `https://SEU-USUARIO.github.io/agenda-estudos/`.
5. No Supabase, em **Authentication → URL Configuration**, coloque esse endereço em **Site URL**.

O código fica público, mas os dados não: sem entrar com a sua conta ninguém lê nada.

Para trocar as chaves de `js/config.js` depois que o código já está no GitHub: abra o arquivo no site do GitHub, toque no lápis (**Edit**), troque os dois textos e clique em **Commit changes**.

### 4. Trazer o Trello

1. No Trello, exporte o quadro em JSON (menu do quadro → Imprimir, exportar e compartilhar → Exportar como JSON).
2. No app, abra **Ajustes → Importar do Trello**, escolha o arquivo e toque em **Importar**. Importar o mesmo arquivo de novo não duplica nada.
   - Se você vai **restaurar um backup** numa conta nova, restaure **antes** e não importe o Trello (o backup já traz o que veio dele). Veja "Backup".
3. O Trello não entrega os arquivos que foram enviados a ele. O resumo da importação lista os pendentes (card e nome do arquivo): abra cada card e anexe o arquivo de novo, à mão.

### 5. Teste rápido

1. Abra o link no celular, entre com a sua conta e crie um card de teste.
2. Abra no computador e recarregue: o card deve aparecer.
3. No Supabase, **Table Editor → cards** deve mostrar a linha.
4. No card de teste, toque em **Anexar arquivo**, escolha uma imagem ou PDF pequeno e depois toque no nome do anexo: o arquivo deve abrir. Isso confere o armazenamento privado `anexos`. Em **Storage → anexos** o arquivo aparece dentro de uma pasta com o código da sua conta.

## Atualizações do banco

Quem instalou antes de novembro de 2026 roda, uma vez e **antes de publicar o código novo no GitHub**, `supabase/migracao-2026-11-subtags.sql` no **SQL Editor** do Supabase (cole o arquivo inteiro e clique em **Run**). Se o código novo for ao ar antes, criar tags, compromissos fixos e salvar "Bloco sem card" dá erro até a migração rodar. Ela acrescenta as subtags e os ícones das tags, o card nos compromissos fixos e a criação automática de card. Pode rodar de novo sem problema, e nada do que já existe é apagado. Quem instalou depois já tem tudo pelo `schema.sql`.

### Rodadas 2, 3 e 4: acompanhamento, modo foco, diário, modelos, modo escuro e revisões (24/11/2026)

Faça nesta ordem (se pular a ordem, telas novas dão erro até as migrações rodarem):

1. No **SQL Editor** do Supabase, rode `supabase/migracao-2026-11-acompanhamento.sql` (cole tudo e clique em **Run**).
2. Ainda no SQL Editor, rode `supabase/migracao-2026-11-foco-diario.sql`.
3. Ainda no SQL Editor, rode `supabase/migracao-2026-11-modelos-revisoes.sql`. As três podem rodar de novo sem problema.
4. Publique o código novo no GitHub (`git add .`, `git commit -m "rodadas 2, 3 e 4"`, `git push`).
5. Atualize a função dos avisos: em **Edge Functions › lembretes**, abra o código, apague tudo, cole o conteúdo novo de `supabase/functions/lembretes/index.ts` e clique em **Deploy**. O agendamento e os segredos continuam os mesmos. Sem isso, o aviso da revisão da semana e o aviso do fim de cada fase do foco não chegam.
6. No app, em **Tags**, edite as tags que contam como estudo e marque **Conta como estudo** (e, se quiser, a meta por semana). Em **Configurações › Geral** ficam o tema (claro/escuro), os tempos do modo foco, os dias da revisão espaçada e a opção dos modelos de semana.

O app instalado no celular pode demorar uma abertura para pegar a versão nova; se algo parecer antigo, feche e abra de novo.

## Notificações (lembretes com o app fechado)

O Supabase roda, a cada minuto, a função `lembretes`, que confere a agenda e manda os avisos para os aparelhos onde você ativou. Faça isto uma vez, nesta ordem:

1. **Banco.** No **SQL Editor**, rode o arquivo `supabase/migracao-2026-11-notificacoes.sql` inteiro (antes de publicar o código novo).
2. **Chaves.** No terminal do VS Code, dentro da pasta do projeto: `node scripts/gerar-chaves-vapid.mjs`. Ele mostra uma chave pública e uma privada. (Também serve `npx web-push generate-vapid-keys`.) Se aparecer "node não é reconhecido", instale o Node.js LTS em nodejs.org e abra o terminal de novo.
3. **Segredos da função.** No Supabase: **Edge Functions → Secrets**. Crie quatro:
   - `VAPID_PUBLIC_KEY`: a chave pública;
   - `VAPID_PRIVATE_KEY`: a chave privada (ela fica só aqui, em nenhum arquivo);
   - `VAPID_SUBJECT`: `mailto:` seguido do seu e-mail (ex.: `mailto:voce@email.com`);
   - `LEMBRETES_SEGREDO`: um texto aleatório e longo, que você inventa (ex.: 40 letras e números). Guarde para o passo 5.
4. **A função.** Em **Edge Functions → Deploy a new function → Via Editor**, dê o nome `lembretes`, apague o exemplo, cole o conteúdo inteiro de `supabase/functions/lembretes/index.ts` e clique em **Deploy**. Depois, nos detalhes da função, **desligue a verificação de JWT** ("Verify JWT"/"Enforce JWT verification"): o agendador se identifica pelo `LEMBRETES_SEGREDO`, e os botões da notificação, por um link assinado.
5. **Agendamento.** Abra `supabase/agendar-lembretes.sql`, troque os dois textos marcados (a URL do seu projeto e o mesmo `LEMBRETES_SEGREDO`) e rode no **SQL Editor**. Pode rodar de novo quando quiser trocar o segredo.
6. **App.** Cole a chave **pública** em `js/config.js`, na linha `VAPID_PUBLIC_KEY = '...'`, e publique. No celular, abra o app instalado, vá em **Configurações → Notificações**, toque em **Ativar neste aparelho** e em **Enviar teste**. Repita no computador, se quiser receber lá também.

Se o teste não chegar: confira em **Edge Functions → lembretes → Logs** se houve erro; confira os quatro segredos; e, no celular, se as notificações do app não estão bloqueadas nas configurações do Android. A função não guarda nada além do que está nestas tabelas: `push_subscriptions` (aparelhos), `notificacoes_enviadas` (para não repetir) e `adiamentos`.

Para mudar a função depois: edite `supabase/functions/lembretes/*.js` (ou as regras em `js/regras/`), rode `npm run gerar-funcao` e cole o novo `index.ts` no editor da função.

## Backup

Em **Ajustes → Backup**, **Exportar backup** baixa um arquivo `agenda-estudos-AAAA-MM-DD.json`. Ele é gerado no seu aparelho e não é enviado a lugar nenhum.

- O arquivo contém **tudo o que foi digitado no app**, inclusive as anotações. Guarde-o em local privado e não o compartilhe.
- Os arquivos anexados (PDFs, imagens) não entram no backup, só a lista deles.
- **Importar backup** só acrescenta o que está faltando: nada é apagado nem alterado.
- Restaure **numa conta vazia** ou **na mesma conta de onde o backup saiu**. Se a conta já tiver outros dados que batam com os do backup (por exemplo, depois de importar o Trello de novo, ou com outra lista marcada como "em andamento"), o app recusa a restauração inteira e não grava nada, porque as duas cópias se misturariam. Por isso, ao reinstalar o app, restaure o backup **antes** e **não** importe o Trello.
- Na mesma conta, restaurar duas vezes o mesmo arquivo não duplica nada.
- Os anexos restaurados apontam para arquivos guardados no Supabase. Num projeto novo do Supabase esses arquivos não existem: a lista volta, mas cada arquivo precisa ser anexado de novo.

## Aviso sobre o plano gratuito do Supabase

No plano gratuito, o Supabase pausa projetos que ficam parados por um tempo. Se o app não carregar os dados depois de um período sem uso, abra o painel do Supabase: o projeto aparece como pausado e dá para reativá-lo com um botão (**Restore project**). Os dados não são perdidos. Os prazos e limites mudam com o tempo; consulte os valores atuais no site do Supabase. Fazer um backup de vez em quando é uma boa proteção.

## Para desenvolvedores

- `npm test` roda:
  - testes das regras e da camada de armazenamento (Node);
  - testes do banco com RLS num Postgres local (`tests/db`, precisa de `psql`; `tests/db/start-pg.sh` sobe o servidor);
  - testes de interface no Chrome headless (`tests/ui`, Python + Playwright), com um banco em memória no lugar do Supabase.
- Não há etapa de compilação: tudo o que o navegador carrega está no repositório ou vem de CDN.
- Mapa de arquivos:
  - `index.html` e `css/estilos.css`: casca e aparência;
  - `manifest.webmanifest`, `sw.js` e `icones/`: app instalável (no celular, menu do Chrome → **Adicionar à tela inicial** / **Instalar app**; no computador, ícone de instalar na barra de endereço). O `sw.js` busca sempre a versão mais nova quando há internet;
  - `js/main.js`: liga tudo (login, estado, navegação);
  - `js/armazenamento.js`: a única porta para o Supabase;
  - `js/estado.js`: dados em memória e ações que gravam;
  - `js/editor.js`: editor das anotações (Toast UI, em `vendor/toastui/`);
  - `js/regras/`: regras puras (datas, calendário, fila, Trello, busca, anexos), testadas em Node;
  - `js/telas/`: uma tela por arquivo (quadro, card, semana, hoje, fixas, busca, ajustes);
  - `supabase/schema.sql`: tabelas, regras de acesso e bucket;
  - `docs/DECISOES.md`: decisões tomadas na construção que a especificação não cobria.
