# Decisões tomadas durante a construção

Uma linha por decisão que a spec não cobria, com o que acontece se estiver errada.

- Tarefa 1: `js/armazenamento.js` começa como um esqueleto que lança "Armazenamento ainda não implementado"; a Tarefa 3 o substitui. Se errado: o import estático em `main.js` quebraria o carregamento até a Tarefa 3.
- Tarefa 1: o harness de UI serve a raiz do repositório por HTTP local, porque módulos ES não carregam por `file://`. Se errado: os testes de interface não conseguem abrir a página.
- Tarefa 1: ao perder a sessão (`onAuthChange` com usuário nulo) a casca volta ao login e chama `aoSair`. Se errado: o usuário deslogado continuaria vendo o app até recarregar.
- Tarefa 1: a seção do app aberta logo após o login é sempre `semana`, também ao restaurar a sessão no recarregamento. Se errado: lembrar a última aba exigiria guardá-la no aparelho.
- Tarefa 3: `update`/`remove` de `settings` filtram por `owner_id` (a tabela não tem `id`); em `alterar('settings', null, patch)` o estado cria a linha se não existir. Se errado: ajustes não gravariam ou duplicariam linha.
- Tarefa 3: `onAuthChange` do store real só avisa a perda de uma sessão que existia (nunca o evento inicial nem logins). Se errado: a casca ficaria sem aviso de sessão expirada, ou voltaria ao login logo na abertura.
- Tarefa 3: se `aoEntrar` (carregar os dados) falha, a casca fica no login com a mensagem de erro; `#app` só aparece depois do carregamento. Se errado: o usuário veria o app vazio sem dados.
- Tarefa 3: ao sair, `dados` do estado não é esvaziado; o próximo `carregar()` substitui tudo, e o app fica oculto. Se errado: dados da sessão anterior ficariam na memória da página até o próximo login.
- Tarefa 5: fixa com dia e com itens oferece o próximo item em cada ocorrência (`item_id`), e a entrada continua na fila com `item_id` nulo se todos os itens estiverem feitos. Se errado: a fixa apareceria sem item ou sumiria cedo demais.
- Tarefa 5: `proximoItem` ordena os grupos pela primeira aparição no vetor `items` recebido (o estado deve entregá-los já ordenados) e os itens do grupo por `position`. Se errado: a ordem dos grupos na trilha sairia trocada.
- Tarefa 5: em `paraEncaixar`, as ocorrências levadas de semanas anteriores vêm depois das da semana atual, da mais antiga para a mais nova. Se errado: só muda a ordem na fila.
- Tarefa 5: `pendenciasDaVirada` usa a segunda-feira da semana de `ultimaVirada` mesmo que a data guardada não seja segunda. Se errado: uma semana a mais ou a menos seria cobrada.
- Tarefa 4: `ajustarAFatia` arredonda metades para cima (`Math.round`). Se errado: um horário exatamente no meio de uma fatia cairia na fatia vizinha (um passo a mais ou a menos).
- Tarefa 4: `colunas` calcula `cols` por grupo de sobreposição encadeada, não por dia inteiro. Se errado: blocos sem sobreposição ficariam estreitos à toa, ou o contrário.
- Tarefa 4: `colunas` devolve os blocos ordenados por `start_min`. Se errado: quem desenha dependendo da ordem de entrada veria os blocos fora de sequência.
- Tarefa 6: a unicidade do nome de categoria vale entre todas, ativas e arquivadas (por isso desarquivar nunca duplica). Se errado: o nome de uma categoria arquivada ficaria reservado, sem poder ser reutilizado.
- Tarefa 6: "Fim do dia" precisa ser pelo menos uma faixa da semana depois do início (mínimo de uma faixa inteira), não só maior que o início. Se errado: a grade da semana teria zero faixas.
- Tarefa 7: ao soltar um card no início de uma lista, `position` = primeira - 1024 (a média com "nada" não existe). Se errado: posições negativas, sem efeito na ordem.
- Tarefa 7: ao excluir uma lista, os cards arquivados dela ficam com `list_id` nulo (o banco não tem cascata ali); só cards não arquivados impedem a exclusão. Restaurar um card sem lista o leva para a primeira lista. Se errado: o usuário teria de arquivar de novo ou escolher a lista.
- Tarefa 7: "Arquivo" do quadro mostra só cards arquivados que não são fixos (fixas arquivadas pertencem à tela Fixas). Se errado: fixas arquivadas apareceriam também no Arquivo.
- Tarefa 7: no toque, o card só começa a ser arrastado após 300 ms parado; mexer antes disso é rolagem. O caminho sem arrastar é "Mover para…" no menu do card. Se errado: ajustar o tempo em `ligarArrasto`.
- Tarefa 7: as anotações do card e dos itens são gravadas 500 ms depois da última tecla, ao fechar o card e ao esconder a página; nada é gravado se o usuário não digitou. Se errado: perda de no máximo meio segundo de texto ao fechar o navegador à força.
- Tarefa 7: ordem dos grupos de itens = primeira aparição na lista ordenada por `position`; item novo recebe a maior `position` do card + 1024, e as setas só trocam as posições de dois vizinhos do mesmo grupo (empates são renumerados antes). Se errado: grupos poderiam trocar de lugar ao reordenar.
- Tarefa 9: `resumo.jaExistiam` conta só cards que já estavam no app; categorias, listas, itens e anexos repetidos são ignorados sem contagem. Se errado: só muda o texto do resumo.
- Tarefa 9: em card com mais de uma checklist, `position` dos itens é renumerada (1024 por item, checklists na ordem do Trello), porque o Trello repete as mesmas posições em checklists do mesmo card e os grupos se misturariam. Com uma só checklist vale o `pos` original. Se errado: a ordem dos itens ou dos grupos sairia diferente da do Trello.
- Tarefa 9: card sem lista aberta (lista fechada ou inexistente) entra sempre arquivado e sem lista, mesmo que não estivesse fechado no Trello. Se errado: o card ficaria invisível no quadro; restaurar pelo Arquivo resolve.
- Tarefa 9: card sem descrição e com comentário fica com notas começando em `---` (sem as quebras de linha iniciais); a data do comentário usa o fuso do aparelho. Se errado: só a aparência das anotações.
- Tarefa 9: se uma importação cair no meio, reimportar completa o que faltou, mas as categorias dos cards já criados naquela rodada não são religadas (vínculos só são planejados para cards novos). Se errado: o usuário religa as categorias à mão.
- Tarefa 9: a importação recarrega o estado antes de planejar, para comparar com o banco e não com a memória. Fixas sem regra de repetição entram sem dias (`fixed_days` vazio) e o usuário escolhe na tela Fixas. Se errado: a fixa não aparece no calendário até ter dias.
- Tarefa 9: o banco em memória dos testes trata chave de conflito nula como distinta (como o Postgres).
- Tarefa 8: o pacote npm `@toast-ui/editor@3.2.3` não traz `toastui-editor-all.min.js` nem `toastui-editor.min.css` (só a versão que exige o ProseMirror à parte, e o `npm install` falhou por uma dependência ausente no registro); os dois arquivos vieram do CDN oficial da NHN (`uicdn.toast.com/editor/3.2.3/`, mesmo cabeçalho de versão do pacote) e o `pt-br.js` veio do pacote npm. Se errado: trocar os arquivos de `vendor/toastui/` por outra cópia da mesma versão.
- Tarefa 8: as anotações agora são gravadas 1,5 s depois da última alteração (substitui os 500 ms da Tarefa 7), ao fechar, ao trocar de card ou de item e ao esconder a página. Se a gravação falha, o card não fecha, não arquiva e não troca, e o texto fica em `localStorage` (`rascunho:{tabela}:{id}`, com `texto`, `base` e `em`). Se errado: o usuário fica preso no card enquanto estiver sem conexão (o texto não se perde).
- Tarefa 8: como `cards` e `items` não têm data de alteração, "rascunho mais novo que o gravado" = rascunho existente com texto diferente da anotação gravada; se for igual, é apagado sem perguntar. Se errado: um rascunho antigo poderia ser oferecido depois de a anotação ter sido mudada em outro aparelho (o usuário escolhe "Descartar").
- Tarefa 8: o editor só considera alterada uma anotação depois de um gesto do usuário (tecla, colar, soltar, recortar, toque no editor) e se o Markdown gerado for diferente do que a biblioteca gerou ao carregar; sem isso, `markdown()` devolve o texto original byte a byte. Se errado: abrir e fechar um card poderia reescrever a anotação.
- Tarefa 8: quando o usuário edita uma anotação no editor visual, o Toast UI reescreve: `_**x**_` e `**_x_**` → `***x***`; `__x__` → `**x**`; marcador `-` ou `+` → `*` (listas com `+` ganham linhas em branco); `---` → `***`; separador de tabela `|---|` → `| --- |`; `<br>` vira parágrafos separados; quebra forçada (dois espaços ou `\` no fim da linha) apagaria a quebra e colaria as palavras, por isso é trocada por quebra simples antes de abrir (fora de blocos de código). Se errado: a forma do Markdown muda e, nas construções listadas, também o que aparece (sublinhado/negrito triplo viram negrito-itálico, `<br>` vira parágrafo); HTML cru seria apagado, por isso anotação com HTML abre em modo texto.
- Tarefa 8: o nome do arquivo no caminho do Storage perde acentos, espaços e símbolos (`nomeParaCaminho`); o nome original fica em `attachments.name`. Excluir um anexo apaga a linha e depois tenta apagar o arquivo, sem travar se o arquivo não sair. Se errado: arquivos órfãos ocupariam espaço no bucket.
- Tarefa 8: imagem colada numa anotação de item cria o anexo com `item_id` do item; a lista de anexos do card mostra todos os anexos do card, inclusive os de itens. Se errado: anexos de item apareceriam também no card.
- Tarefa 8: no modo simples (caixa de texto) não há envio de imagem colada; imagens anexadas aparecem como `![nome](anexo:CAMINHO)` no texto cru. Se errado: só quem usa o modo simples (testes, ou a biblioteca sem carregar) é afetado.
- Tarefa 8: Esc com o título do card ou de um item em foco confirma o título e não fecha o card; Esc com um balão do editor aberto fecha só o balão. Se errado: um Esc a mais é preciso para fechar.
- Decisão do dono do app (substitui a da Tarefa 10): na Semana cada bloco é uma peça só, da hora de início à de fim, numa camada por cima das faixas do dia (faixas de 72 px de altura, a peça proporcional à duração); blocos que se sobrepõem ficam lado a lado (`colunas`). "Livre" é desenhado só nos trechos livres de ao menos meia faixa, nunca por baixo de um bloco. Se errado: voltar a uma faixa de altura automática com o bloco repetido em cada faixa que ele toca.
- Tarefa 10: a Semana alarga a grade (mesmas faixas em todas as colunas) quando algum bloco da semana cai fora do período configurado, como o Hoje faz com `limitesDoDia`. Se errado: o bloco ficaria invisível na Semana.
- Tarefa 10: `type="time"` não aceita 24:00; no fim da folha, 23:59 vale "até a meia-noite" (1440). Se errado: um bloco que termina às 23:59 reais passa a terminar às 24:00.
- Tarefa 10: ao editar uma ocorrência de compromisso repetido a data fica bloqueada (a ocorrência é identificada por regra+data) e só se repete ao criar; um bloco único não vira repetido depois. "Só este dia" altera horário, título e categoria; dias e período só mudam em "Todos". Se errado: mover a ocorrência de dia exigiria cancelar uma e criar outra.
- Tarefa 10: arrastar ou esticar a ocorrência de um compromisso repetido no Hoje vale só para aquele dia (grava bloco individual). Se errado: o usuário usa "Todos" na folha.
- Tarefa 10: "Este e os próximos" também apaga os blocos individuais da regra a partir do dia; se o dia é o primeiro da regra, a regra inteira é apagada. Se errado: sobrariam blocos soltos depois de `valid_to`.
- Tarefa 10: tocar numa fatia do Hoje que começa dentro de um bloco cria o novo bloco a partir do fim dele. Se errado: o bloco novo sobreporia o existente.
- Tarefa 10: ao tocar no dia no topo da Semana abre o Hoje naquele dia; tocar na aba Hoje sempre volta para o dia de hoje, e a aba Semana mantém a semana vista. Se errado: só muda qual data aparece ao trocar de aba.
- Tarefa 13: o trecho mostra o Markdown sem marcas (`_` só some quando abre e fecha destaque) e a busca roda sobre esse texto simples; o filtro de categoria também deixa passar blocos cuja própria categoria é a escolhida. Se errado: a busca acharia sinais de Markdown ou esconderia blocos de card excluído.
- Tarefa 11: a seleção do item da fila é única e global (módulo `js/telas/fila.js`), com a faixa fixa "Escolha um horário · Cancelar" acima das abas; por isso `montarFila` não recebe `aoEscolher`, só `aoSoltar` (arrasto). Se errado: a faixa precisaria morar dentro de cada tela.
- Tarefa 11: tocar numa faixa da Semana com item escolhido cria 1 hora a partir do início do trecho livre da faixa, cortada no próximo bloco do dia e no fim do período; faixas com pouco espaço livre (sem "Livre") também aceitam o toque. Se errado: o horário nasceria noutro ponto da faixa.
- Tarefa 11: ao agendar pelo card, a hora sugerida é a próxima hora cheia de hoje (ou o início do dia seguinte se não couber). Se errado: o usuário ajusta na folha.
- Tarefa 11: `mudarEstado` não pergunta nada; devolve o card a oferecer e a folha do bloco faz a pergunta "Concluir este card?" dentro dela (só em transição real e se existir lista de conclusão). O item é gravado antes do bloco e volta ao que era se o bloco falhar. Se errado: um cumprido que falhou pela metade poderia deixar o item marcado sem bloco.
- Tarefa 11: "o que fiz no lugar" fica gravado em `instead_note` mesmo quando o bloco vai a cumprido ou a planejado (nunca se apaga texto digitado por mudança de estado); só aparece no bloco enquanto ele está não feito, e voltar a "Não feito" preenche o campo com o texto guardado. Se errado: o texto antigo reapareceria ao voltar a não feito.
- Tarefa 12: `verificarVirada` só atualiza `last_rollover` em silêncio quando já existe uma linha em `settings`; sem ela (conta nova, ainda sem importação nem ajustes) nada é criado, e a linha nasce ao concluir a primeira pergunta ou na importação. Se errado: a primeira virada de uma conta sem `settings` olharia só a semana anterior de novo a cada abertura (sem efeito se não há fixas).
- Tarefa 12: "Concluir" na folha da virada exige resposta em todas as linhas (senão avisa e não grava), porque `last_rollover` avançado esconderia as que ficaram sem resposta. Grava as ocorrências uma a uma, depois os blocos, e `last_rollover` por último; repetir depois de falha ajusta a linha que já existe em vez de duplicar. Se errado: um erro no meio poderia deixar respostas gravadas sem a virada avançar (repetir resolve).
- Tarefa 12: ocorrência respondida na virada ou na tela Fixas leva os blocos de estudo ainda `planned` dela (mesma data de referência) para `done` ou `missed`, pelo mesmo `mudarEstado` do calendário (o item do bloco também é marcado ao cumprir); "levada" não mexe nos blocos. Se errado: o bloco continuaria planejado no passado.
- Tarefa 12: na tela Fixas só ocorrências "a fazer" têm botões Cumprida e Não feita; agendada se resolve pelo bloco no calendário. Se errado: acrescentar os botões também à marca "agendada".
- Tarefa 12: a busca agora também olha `occurrences.instead_note` (origem "No lugar · DD/MM", abre a tela Fixas); blocos e ocorrências do mesmo card dividem o limite de 3 resultados, os mais recentes primeiro. Se errado: separar os limites por tipo (substitui a nota da Tarefa 13).
- Tarefa 8: anotação com HTML cru fora de código (tag como `<u>`, `</span>`, `<details>`, `<img …>` ou comentário `<!--`; autolinks `<https://…>`/`<a@b>` e `a < b` não contam) abre na caixa de texto com o aviso "Esta anotação tem HTML. Ela abre em modo texto para nada se perder.", porque o editor visual apaga o HTML ao gravar. Se errado: notas com HTML ficariam sem formatação visual (o texto cru continua editável e nada se perde).
- Tarefa 8: imagem nova entra com o texto alternativo sem `[` e `]`; ao gravar, qualquer URL temporária que ainda esteja no texto (em qualquer formato) volta a ser `anexo:CAMINHO`. Se errado: uma URL que expira em 1 h iria para o banco e a imagem quebraria.
- Tarefa 5: reagendar só vale se o bloco de estudo mais recente do alvo (data, início) está `missed`; ocorrência levada só some da fila com bloco `done` ou `planned` de hoje em diante; fixa não tem ocorrência antes do dia de `created_at`. Se errado: a fila esconderia ou mostraria fixas a mais.
- Tarefa 5: empate de data e início no "bloco mais recente" fica com o último do vetor, e `created_at` é comparado como texto (`slice(0,10)`), sem conversão de fuso. Se errado: uma fixa criada perto da meia-noite poderia ganhar ou perder uma ocorrência.
- Tarefa 13: a busca compara em NFC (acentos decompostos e compostos são iguais) e `*`, `~~`, `_` e crases só somem em par e sem colar em letra ou dígito (`2*3` é achado); os blocos de um card são ordenados do mais recente para o mais antigo antes do limite de 3. Se errado: buscas com acento decomposto falhariam ou trechos perderiam símbolos legítimos.
- Tarefa 13: a regra de busca devolve também `cortado_antes` e `cortado_depois` para a tela saber se pôs "…" no trecho; `trecho`, `inicio` e `fim` não mudam. Se errado: a tela teria de deduzir o corte por `inicio === 60`, impreciso na borda.
- Tarefa 14: o backup é montado no navegador e baixado; nunca é enviado a lugar nenhum, e não leva `owner_id` nem os arquivos anexados (só as linhas de `attachments`). Se errado: o arquivo traria dados de dono que a restauração ignora de qualquer jeito.
- Tarefa 14: restaurar valida o arquivo inteiro antes de gravar (`app`, `versao` numérica, `tabelas` com listas de objetos com `id`; tabela desconhecida é ignorada) e grava na ordem de `TABELAS` com `upsert` que ignora duplicatas, sempre para o usuário logado. Ajustes só voltam se não houver linha. Backup de versão maior que 1 é recusado. Se errado: um arquivo estranho poderia gravar lixo.
- Tarefa 14: se a restauração falha no meio, as tabelas já gravadas ficam e a tela diz que restaurar de novo nesta conta é seguro (só acrescenta o que falta); não há desfazer. Se errado: o usuário teria de apagar à mão o que entrou pela metade.
- Revisão final: a restauração decide antes de gravar. Se uma linha do backup com `id` que a conta não tem bateria numa regra única do banco com uma linha existente (`trello_id` do mesmo dono, a lista ativa, a lista de conclusão, `blocks (commitment_id, date)`, `occurrences (card_id, date)`), recusa tudo e não grava nada. `card_categories` não tem `id` e nunca colide. Se errado: um backup legítimo seria recusado numa conta com dados parecidos; restaurar numa conta vazia resolve.
- Revisão final: antes de gravar uma anotação (card ou item), o app relê a linha; se o banco não tem mais o texto com que o editor abriu (nem o texto novo), não grava e oferece "Ver a versão mais recente" ou "Manter a minha". O card não fecha enquanto isso não for resolvido. Outros campos de texto (títulos, "o que fiz no lugar") continuam gravando por cima. Se errado: uma edição feita em dois aparelhos ao mesmo tempo num título se perde.
- Revisão final: ao voltar para a página (`visibilitychange` ou foco da janela) os dados são relidos, a não ser que haja anotação por gravar ou folha com texto digitado; nesse caso espera a próxima volta. Se o dia mudou, a virada é verificada de novo e Semana/Hoje que mostravam "hoje" passam ao novo dia. Se errado: com texto digitado e não salvo, a aba pode mostrar dados antigos até a próxima volta.
- Revisão final: enquanto o aviso de rascunho está aberto, o que se digita é guardado em `rascunho:{tabela}:{id}:novo`; o rascunho antigo só sai com "Recuperar" ou "Descartar". "Recuperar" troca o texto do editor pelo rascunho antigo e descarta o `:novo`. Se errado: o texto digitado antes de recuperar se perde (foi o usuário que escolheu trocar).
- Revisão final: tocar fora ou Esc pergunta "Descartar o que você escreveu?" quando há texto digitado: título ou "o que fiz no lugar" alterados na folha do bloco, título na nova fixa, título no novo card e, na virada, qualquer resposta escolhida ou nota digitada. Os botões "Cancelar" e "Depois" continuam fechando na hora, por serem escolha explícita. Se errado: um toque a mais para fechar.
- Revisão final: excluir "Todos" ou "Este e os próximos" de um compromisso repetido com dias marcados como cumprido ou não feito pergunta antes, com a quantidade; confirmando, esses dias são apagados com a regra (não ficam soltos). Se errado: preservar os blocos marcados com `commitment_id = null` antes de apagar a regra.
- Revisão final: importar o Trello quando o app já tem lista ativa ou de conclusão não marca as listas importadas "Em andamento"/"Concluído"; a marca que já existe continua valendo. Se errado: o usuário troca a marca no menu da lista.

## Notificações (novembro de 2026)

- Push com o app fechado pelo próprio Supabase: Supabase Cron chama a função `lembretes` a cada minuto; nada de serviço externo.
- A criptografia do Web Push (VAPID + aes128gcm) é feita no projeto, só com Web Crypto, para rodar no Deno sem dependências; testada decifrando a mensagem.
- `supabase/functions/lembretes/index.ts` é gerado (`npm run gerar-funcao`) e usa as mesmas regras do app (`js/regras/`).
- Os botões "Cumprido" e "Adiar 10 min" funcionam sem abrir o app, por um link assinado (HMAC) que vale 24 h.
- O que cai no horário de silêncio é descartado (inclusive a revisão da semana); o silêncio vem desligado e a tela avisa isso, e avisa também quando o horário da revisão cai dentro dele. O tique aceita até 2 min de atraso e nunca repete (tabela `notificacoes_enviadas`).

## Acompanhamento (novembro de 2026)

- Estudo é decidido pela tag: tag marcada "conta como estudo" e as subtags dela. Bloco sem tag não conta; o card não empresta tag ao bloco (evita contar em dobro).
- Só blocos somam horas. Card fixo marcado sem bloco não tem horário nem tag, então não entra nas horas nem no "não feito".
- "Não feito" junta os blocos marcados como não feitos e os que já terminaram sem marcar ("sem marcar"); as listas mostram os dois separados. O % cumprido conta só blocos já terminados; o planejado inclui os futuros do período.
- A sequência é sempre "até hoje", qualquer que seja o período da tela; hoje abaixo do mínimo não quebra a sequência.
- Metas são semanais; em Mês, Ano e Intervalo aparece a média por semana. A tag mãe soma as horas das subtags.
- A meta do card conta todos os blocos dele, de qualquer tag; fixa sem data final entra só até o domingo da semana atual.
- A revisão mostra a semana que contém a véspera do dia escolhido; antes do horário, a semana anterior. "Mandar pendências para a fila" marca os sem marcar como não feitos (a fila já mostra "Reagendar").
- Gráficos em SVG feitos no próprio app (sem biblioteca), com a paleta café. A função `lembretes` lê a semana e as tags só no minuto do aviso da revisão.

## Modo foco e diário (novembro de 2026)

- O foco em andamento é uma linha da tabela `focos` (uma por pessoa), com a hora em que a fase acaba. O tempo na tela vem sempre dessa hora e do relógio, então fechar ou recarregar o app não perde nada.
- O aviso do fim de cada fase (foco, pausa e pausa longa) sai pela função `lembretes`, no mesmo tique dos lembretes: pode chegar até 1 min depois com o app fechado. Com o app na tela, só o app toca (bipe e vibração, se ligados); o service worker não mostra o push.
- O botão "Começar pausa"/"Começar foco" da notificação só vale para a fase que ela anunciou (link assinado com a hora do fim); depois disso não muda nada.
- A fase seguinte nunca começa sozinha: acabou, fica "esperando" até ele tocar. No horário de silêncio o aviso é descartado, mas a fase fica "esperando" do mesmo jeito.
- O foco nunca marca bloco: só ao tocar em Parar, com bloco ligado, pergunta se marca como cumprido e oferece o diário. "Focar" com um foco já em andamento não troca o bloco dele.
- Diário é a coluna `blocks.diario` (texto simples). "Cumprido" abre a caixa do diário e confirma em "Marcar como cumprido", como o "Não feito" faz com o "o que fiz no lugar". Aparece no card, na tela Diário (50 dias por vez) e na Busca. `focos` fica fora do backup; o diário entra.

## Modelos de semana, modo escuro e revisão espaçada (novembro de 2026)

- Modelo = uma linha da tabela `modelos` com a lista de blocos dentro (dia da semana, horário, título, card, tag, lembrete). Aplicar troca os planejados da semana, de hoje em diante; as caixas "Manter os blocos marcados como cumpridos" e "... como não feitos" vêm marcadas e o aviso conta o que sai. Compromissos fixos nunca são apagados nem duplicados; a opção "Modelos incluem os compromissos fixos" só decide se eles entram ao salvar. Blocos de card fixo e de revisão entram no modelo sem esses vínculos.
- Tema escuro: escolhido à mão em Configurações, guardado no aparelho (`localStorage`), aplicado no `<head>` antes de pintar. Todas as cores do CSS são variáveis; um teste confere contraste ≥ 4,5:1 nos dois temas e que não sobra cor fixa fora delas.
- Revisão espaçada: "Agendar revisão" no card cria uma linha por data em `revisoes` (padrão 7 e 30 dias, mudável nas Configurações). Datas fixas: atrasar uma não move as outras. A vencida entra em "Para encaixar" com o selo "Revisar"; o bloco criado é do card inteiro (sem item), não mexe na trilha nem pergunta "concluir o card". Cumprido conclui a revisão; voltar o bloco devolve para a fila. Card arquivado tira as revisões da fila; card concluído continua sendo revisado.

## Flashcards (novembro de 2026)

- Dois botões (Errei/Acertei). Novo acertado → volta em 1 dia; depois, intervalo × fator (padrão 2,5; por baralho). Errou → volta no fim da mesma sessão e o intervalo recomeça (o acerto seguinte dá 1 dia).
- Baralhos do menu e flashcards dos cards são separados: os do card só se estudam no card, com os limites e o fator de Configurações. Aviso diário, contador do menu e Dashboards somam os dois.
- Tipos: frente e verso, invertido (dois lados com agendamento próprio), lacuna `{{ }}` (todas escondidas de uma vez) e digitar (acerto só se idêntico, com acentos; só os espaços das pontas são ignorados).
- "Para hoje" = o que a sessão serviria: vencidos até o limite de revisões e novos até o limite de novos, descontando o que já foi feito hoje (lados distintos; refazer um errado não gasta limite).
- O agendamento fica em `flash_lados` (criado na primeira resposta). Os Dashboards usam `flash_dias`, um resumo por dia (revisados e acertos de primeira), em vez de guardar cada resposta.
- Formatação curta própria (negrito, itálico, listas), escapando todo o resto: o texto do usuário nunca vira HTML. Sem imagem, áudio nem importação.

## Tag do card e "Na agenda" (novembro de 2026)

- Um card tem uma tag e, se quiser, subtags dela, escolhidas em duas listas clicáveis (Tag; Subtags). Com subtags marcadas, o card guarda só as subtags; sem subtag, guarda a tag. Trocar a tag substitui tudo, sem perguntar. Os dados (`card_categories`) não mudaram.
- Card antigo com tags de famílias diferentes: os campos mostram a primeira família na ordem das tags e a linha "Também neste card: …" lista as outras, que ficam até a próxima troca de tag.
- "Agendar", "Agendar revisão" e "Tornar fixa" viraram a seção "Na agenda": Marcar sessão, Revisões espaçadas e Repetir toda semana, cada um com uma linha explicando.

## Ajustes de 24/11/2026

- Card: uma tag e no máximo uma subtag. O card guarda a subtag (se houver) ou a tag; cards antigos com mais de uma mostram a primeira e listam as outras em "Também neste card" até a próxima escolha. O bloco criado a partir do card já vem com essa tag/subtag (tag arquivada não vem).
- Flashcards: frente e verso usam o editor das Anotações só com Negrito, Itálico e Lista; a formatação própria aceita a saída dele (escapes `\*`, listas com `* `). Prévia só na lacuna. A resposta do tipo "digitar" é uma linha simples.
- Arquivo como no Trello: painel à direita com busca e grupos por quando foi arquivado (`cards.archived_at`, gravado pelo app ao arquivar e apagado ao restaurar). Os arquivados antes disso ficam em "Sem data".
- Excluir card tem a mesma pergunta e o mesmo efeito na tela do card, no menu ⋯ e no Arquivo (apaga os blocos planejados de hoje em diante).
- Agenda = Semana. O dia abre tocando no nome do dia e tem o botão "Semana" para voltar. Padrão do dia: meia-noite a meia-noite (fim 00:00 = 24:00).
- Cumprido e Não feito gravam o estado na hora e a folha fica aberta; "Por que não fez?" (`blocks.motivo`), "O que fez no lugar?" e o Diário gravam sozinhos ao sair do campo e ao fechar a folha.
- Grupos de baralhos: baralho com `e_grupo` e `pai_id` (vários níveis). Estudar o grupo junta os baralhos de dentro, cada um com os próprios limites, revisões antes dos novos. Excluir um grupo sobe o que estava dentro. Aberto/fechado fica no aparelho.

## Limites no grupo de baralhos (24/11/2026)

- Um grupo pode definir novos e revisões por dia (`baralhos.limites_do_grupo` + os `novos_dia`/`revisoes_dia` do grupo). Valem para cada baralho de dentro, em qualquer nível; com grupos dentro de grupos, manda o grupo mais de cima que tiver limites. O fator é sempre do baralho.
- No baralho sobreposto os dois campos ficam travados, com o aviso "Definido pelo grupo …"; os números próprios do baralho ficam guardados e voltam a valer se o grupo desligar os limites ou o baralho sair dele.
- Novo baralho já escolhe o grupo na criação.

## Bloco sem card (24/11/2026)

- A escolha "Bloco sem card" saiu das Configurações. O bloco novo sem card sempre mostra "Criar card para este bloco" (desmarcado), com a lista ativa sugerida; sem marcar, nada é criado no Quadro. As colunas antigas `auto_card` e `auto_card_list_id` ficam no banco, sem uso.
