// Dados em memória + ações que gravam no store e avisam os ouvintes.
export const TABELAS = ['categories', 'lists', 'cards', 'card_categories', 'items', 'attachments', 'commitments', 'blocks', 'occurrences', 'settings'];

const AJUSTES_PADRAO = { day_start_min: 360, day_end_min: 1320, week_slot_min: 120, day_slot_min: 30, last_rollover: null, auto_card: 'perguntar', auto_card_list_id: null };

export function criarEstado(store) {
  const dados = Object.fromEntries(TABELAS.map((t) => [t, []]));
  const ouvintes = [];
  const avisar = () => ouvintes.forEach((f) => f());

  // Só os ajustes não têm `id`: a chave é o dono.
  const chave = (tabela) => (tabela === 'settings' ? 'owner_id' : 'id');

  // Como no banco: excluir a tag leva as subtags e os vínculos; blocos e fixas ficam sem categoria.
  function cascataCategoria(id) {
    const ids = new Set([id, ...dados.categories.filter((c) => c.parent_id === id).map((c) => c.id)]);
    dados.categories = dados.categories.filter((c) => !ids.has(c.id));
    dados.card_categories = dados.card_categories.filter((cc) => !ids.has(cc.category_id));
    dados.blocks = dados.blocks.map((b) => (ids.has(b.category_id) ? { ...b, category_id: null } : b));
    dados.commitments = dados.commitments.map((c) => (ids.has(c.category_id) ? { ...c, category_id: null } : c));
  }

  function cascataCard(id) {
    const itens = new Set(dados.items.filter((i) => i.card_id === id).map((i) => i.id));
    dados.items = dados.items.filter((i) => i.card_id !== id);
    dados.attachments = dados.attachments.filter((a) => a.card_id !== id);
    dados.occurrences = dados.occurrences.filter((o) => o.card_id !== id);
    dados.card_categories = dados.card_categories.filter((cc) => cc.card_id !== id);
    dados.commitments = dados.commitments.map((c) => (c.card_id === id ? { ...c, card_id: null } : c));
    dados.blocks = dados.blocks.map((b) => (b.card_id === id || itens.has(b.item_id)
      ? { ...b, card_id: b.card_id === id ? null : b.card_id, item_id: itens.has(b.item_id) ? null : b.item_id }
      : b));
  }

  // Espelha o banco: anexos do item somem e blocos que apontavam para ele ficam sem item.
  function cascataItem(id) {
    dados.attachments = dados.attachments.filter((a) => a.item_id !== id);
    dados.blocks = dados.blocks.map((b) => (b.item_id === id ? { ...b, item_id: null } : b));
  }

  // Espelha o banco: apagar a regra de um compromisso apaga os blocos gravados dele.
  function cascataCompromisso(id) {
    dados.blocks = dados.blocks.filter((b) => b.commitment_id !== id);
  }

  // Gravações iniciadas e ainda em curso: uma recarga só vale se nenhuma começou nem estava em curso durante a leitura.
  let gravacoes = 0;
  let emCurso = 0;
  const aoAssentar = [];
  const esperarGravacoes = () => new Promise((r) => { if (!emCurso) r(); else aoAssentar.push(r); });

  const ler = () => Promise.all(TABELAS.map((t) => store.list(t)));
  const aplicar = (listas) => { TABELAS.forEach((t, i) => { dados[t] = listas[i]; }); avisar(); };

  const api = {
    dados,
    async carregar() { aplicar(await ler()); },
    // Recarga de fundo (ao voltar para a página). Se alguma gravação aconteceu durante a leitura, a foto
    // pode ser anterior a ela: é descartada, e a leitura é repetida uma vez depois de as gravações assentarem.
    // `podeAplicar` é consultado na hora de aplicar. Devolve true se aplicou.
    async recarregar({ podeAplicar = () => true } = {}) {
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        await esperarGravacoes();
        const antes = gravacoes;
        const listas = await ler();
        if (gravacoes === antes && !emCurso) {
          if (!podeAplicar()) return false;
          aplicar(listas);
          return true;
        }
      }
      return false;
    },
    aoMudar(cb) { ouvintes.push(cb); },
    async criar(tabela, linha) {
      const [criada] = await store.insert(tabela, linha);
      dados[tabela].push(criada);
      avisar();
      return criada;
    },
    async alterar(tabela, id, patch) {
      if (tabela === 'settings') {
        const atual = dados.settings[0];
        const nova = atual ? await store.update('settings', atual.owner_id, patch) : (await store.insert('settings', patch))[0];
        dados.settings = [nova];
        avisar();
        return nova;
      }
      const nova = await store.update(tabela, id, patch);
      dados[tabela] = dados[tabela].map((l) => (l[chave(tabela)] === id ? nova : l));
      avisar();
      return nova;
    },
    // Troca a cópia em memória por uma linha lida agora do banco, sem gravar nada.
    substituirLocal(tabela, linha) {
      dados[tabela] = dados[tabela].map((l) => (l[chave(tabela)] === linha[chave(tabela)] ? linha : l));
      avisar();
    },
    async excluir(tabela, id) {
      await store.remove(tabela, id);
      dados[tabela] = dados[tabela].filter((l) => l[chave(tabela)] !== id);
      if (tabela === 'cards') cascataCard(id);
      if (tabela === 'items') cascataItem(id);
      if (tabela === 'commitments') cascataCompromisso(id);
      if (tabela === 'categories') cascataCategoria(id);
      avisar();
    },
    // Deixa o card exatamente com as categorias de `ids`.
    async definirCategorias(cardId, ids) {
      const atuais = dados.card_categories.filter((cc) => cc.card_id === cardId).map((cc) => cc.category_id);
      const querer = [...new Set(ids)];
      const remover = atuais.filter((c) => !querer.includes(c));
      const incluir = querer.filter((c) => !atuais.includes(c));
      try {
        for (const categoryId of remover) {
          await store.removeWhere('card_categories', { card_id: cardId, category_id: categoryId });
          dados.card_categories = dados.card_categories.filter((cc) => !(cc.card_id === cardId && cc.category_id === categoryId));
        }
        if (incluir.length) {
          const criadas = await store.insert('card_categories', incluir.map((c) => ({ card_id: cardId, category_id: c })));
          dados.card_categories.push(...criadas);
        }
      } finally {
        if (remover.length || incluir.length) avisar();
      }
    },
    ajustes() { return { ...AJUSTES_PADRAO, ...(dados.settings[0] || {}) }; },
  };

  for (const nome of ['criar', 'alterar', 'excluir', 'definirCategorias']) {
    const original = api[nome];
    api[nome] = async (...args) => {
      gravacoes++;
      emCurso++;
      try { return await original(...args); } finally {
        emCurso--;
        if (!emCurso) aoAssentar.splice(0).forEach((r) => r());
      }
    };
  }
  const substituir = api.substituirLocal;
  api.substituirLocal = (...args) => { gravacoes++; return substituir(...args); };
  return api;
}
