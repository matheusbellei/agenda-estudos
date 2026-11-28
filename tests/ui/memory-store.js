// Banco em memória só para testes de interface: mesma interface do store real (js/armazenamento.js).
(function () {
  const TABELAS = ['categories', 'lists', 'cards', 'card_categories', 'items', 'attachments', 'commitments', 'blocks', 'occurrences', 'settings', 'push_subscriptions', 'adiamentos', 'modelos', 'baralhos', 'flashcards', 'flash_lados', 'flash_dias'];
  const USERS = [{ id: 'u1', email: 'dono@exemplo.com', password: 'senha123' }];
  const SO_DONO = 'Você só pode alterar os seus próprios dados.';
  // Padrões do banco (supabase/schema.sql) que o app costuma deixar de fora ao criar.
  const PADROES = {
    categories: () => ({ color: '#6F4E37', archived: false, trello_id: null }),
    lists: () => ({ is_done: false, is_active: false, trello_id: null }),
    cards: () => ({ list_id: null, position: 0, notes: '', archived: false, archived_at: null, created_at: new Date().toISOString(), completed_at: null, is_fixed: false, fixed_days: [], trello_id: null }),
    items: () => ({ group_name: '', position: 0, done: false, done_at: null, notes: '', trello_id: null }),
    attachments: () => ({ item_id: null, path: null, url: null, trello_id: null }),
    commitments: () => ({ category_id: null, valid_to: null }),
    blocks: () => ({ title: '', category_id: null, card_id: null, item_id: null, commitment_id: null, fixed_date: null, status: 'planned', instead_note: '', cancelled: false, baralho_id: null, motivo: '' }),
    occurrences: () => ({ instead_note: '' }),
    baralhos: () => ({ fator: 2.5, novos_dia: 20, revisoes_dia: 200, e_grupo: false, pai_id: null, limites_do_grupo: false, criado_em: new Date().toISOString() }),
    flashcards: () => ({ baralho_id: null, card_id: null, verso: '', criado_em: new Date().toISOString() }),
    flash_lados: () => ({ intervalo: 0, vence: null, errado_em: null, introduzido_em: null, revisado_em: null }),
    flash_dias: () => ({ revisados: 0, acertos: 0 }),
    modelos: () => ({ blocos: [], criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }),
    settings: () => ({ day_start_min: 0, day_end_min: 1440, week_slot_min: 120, day_slot_min: 30, last_rollover: null }),
  };
  const SINCRONOS = ['currentUser', 'onAuthChange'];
  const chaveDe = (t) => (t === 'settings' ? 'owner_id' : 'id');

  const db = JSON.parse(sessionStorage.getItem('memdb') || 'null') || {};
  TABELAS.forEach((t) => { db[t] = db[t] || []; });
  const arquivos = JSON.parse(sessionStorage.getItem('memfiles') || '{}');
  const save = () => { sessionStorage.setItem('memdb', JSON.stringify(db)); sessionStorage.setItem('memfiles', JSON.stringify(arquivos)); };
  let n = Number(sessionStorage.getItem('memseq') || 0);
  const uid = () => { n++; sessionStorage.setItem('memseq', n); return 'id' + String(n).padStart(6, '0'); };
  let user = JSON.parse(sessionStorage.getItem('memuser') || 'null');
  const ouvintes = [];
  const avisa = () => ouvintes.forEach((f) => f(user));
  const clonar = (x) => JSON.parse(JSON.stringify(x));
  const exigeUsuario = () => { if (!user) throw new Error('Sua sessão expirou. Entre de novo.'); return user.id; };
  const tabela = (t) => { if (!db[t]) throw new Error('Tabela desconhecida: ' + t); return db[t]; };

  window.__memdb = db;
  // Semeia linhas do usuário de teste (sem exigir login).
  window.__memSeed = (t, rows) => {
    rows.forEach((r) => db[t].push({ ...PADROES[t]?.(), ...(t === 'settings' ? {} : { id: uid() }), owner_id: 'u1', ...r }));
    save();
  };
  // Hook de falha: a próxima chamada do método indicado rejeita uma vez.
  // Formas aceitas: 'update' (próxima chamada do método), 'update:blocks' (só naquela tabela) ou uma lista delas,
  // consumida na ordem: cada item falha a próxima chamada que combinar e só então o seguinte passa a valer.
  window.__memFalhar = null;
  function deveFalhar(nome, args) {
    const f = window.__memFalhar;
    const esperado = Array.isArray(f) ? f[0] : f;
    if (!esperado) return false;
    const [metodo, tab] = esperado.split(':');
    if (metodo !== nome || (tab && tab !== args[0])) return false;
    window.__memFalhar = Array.isArray(f) && f.length > 1 ? f.slice(1) : null;
    return true;
  }

  // Regras de unicidade e checagens de supabase/schema.sql: o app tem de lidar com elas aqui também.
  const COM_TRELLO = ['categories', 'lists', 'cards', 'items', 'attachments'];
  const duplicada = (nome) => new Error(`duplicate key value violates unique constraint "${nome}"`);
  const violaCheck = (t) => new Error(`new row for relation "${t}" violates check constraint "${t}_check"`);
  const horarioValido = (l) => Number.isInteger(l.start_min) && Number.isInteger(l.end_min) && l.start_min >= 0 && l.start_min < l.end_min && l.end_min <= 1440;
  // `linha` é como a linha ficaria; `outras` são as demais linhas da tabela (sem ela mesma, num update).
  function checarLinha(t, linha, outras) {
    if (t === 'blocks' && !horarioValido(linha)) throw violaCheck(t);
    if (t === 'commitments' && (!horarioValido(linha) || !(linha.days || []).every((d) => Number.isInteger(d) && d >= 1 && d <= 7))) throw violaCheck(t);
    const igual = (cols) => outras.some((x) => cols.every((c) => x[c] === linha[c]));
    if (t === 'settings') { if (igual(['owner_id'])) throw duplicada(`${t}_pkey`); return; }
    if (t === 'card_categories') { if (igual(['card_id', 'category_id'])) throw duplicada('card_categories_pkey'); return; }
    if (igual(['id'])) throw duplicada(`${t}_pkey`);
    if (COM_TRELLO.includes(t) && linha.trello_id != null && igual(['owner_id', 'trello_id'])) throw duplicada(`${t}_owner_id_trello_id_key`);
    if (t === 'lists' && linha.is_active && outras.some((x) => x.owner_id === linha.owner_id && x.is_active)) throw duplicada('lists_uma_ativa');
    if (t === 'lists' && linha.is_done && outras.some((x) => x.owner_id === linha.owner_id && x.is_done)) throw duplicada('lists_uma_concluida');
    if (t === 'blocks' && linha.commitment_id != null && igual(['commitment_id', 'date'])) throw duplicada('blocks_commitment_id_date_key');
    if (t === 'occurrences' && igual(['card_id', 'date'])) throw duplicada('occurrences_card_id_date_key');
    if (t === 'baralhos' && outras.some((l) => l.owner_id === linha.owner_id
      && String(l.nome).trim().toLowerCase() === String(linha.nome).trim().toLowerCase())) throw duplicada('baralhos_nome_unico');
    if (t === 'flash_lados' && igual(['flashcard_id', 'lado'])) throw duplicada('flash_lados_flashcard_id_lado_key');
    if (t === 'flash_dias' && igual(['owner_id', 'data'])) throw duplicada('flash_dias_owner_id_data_key');
    if (t === 'modelos' && outras.some((l) => l.owner_id === linha.owner_id
      && String(l.nome).trim().toLowerCase() === String(linha.nome).trim().toLowerCase())) throw duplicada('modelos_nome_unico');
  }
  // Como uma instrução do Postgres: ou entram todas as linhas, ou nenhuma.
  function checarNovas(t, novas) {
    const vistas = [...tabela(t)];
    for (const l of novas) { checarLinha(t, l, vistas); vistas.push(l); }
  }

  function cascataFlash(filtro) {
    const ids = new Set(db.flashcards.filter(filtro).map((f) => f.id));
    db.flashcards = db.flashcards.filter((f) => !ids.has(f.id));
    db.flash_lados = db.flash_lados.filter((l) => !ids.has(l.flashcard_id));
  }
  function cascataCard(id) {
    const itens = new Set(db.items.filter((i) => i.card_id === id).map((i) => i.id));
    db.items = db.items.filter((i) => i.card_id !== id);
    db.attachments = db.attachments.filter((a) => a.card_id !== id);
    db.occurrences = db.occurrences.filter((o) => o.card_id !== id);
    db.card_categories = db.card_categories.filter((cc) => cc.card_id !== id);
    cascataFlash((f) => f.card_id === id);
    db.commitments.forEach((c) => { if (c.card_id === id) c.card_id = null; });
    db.blocks.forEach((b) => {
      if (b.card_id === id) b.card_id = null;
      if (itens.has(b.item_id)) b.item_id = null;
    });
  }

  const metodos = {
    async signIn(email, password) {
      const u = USERS.find((x) => x.email === email && x.password === password);
      if (!u) throw new Error('E-mail ou senha incorretos.');
      user = { id: u.id, email: u.email };
      sessionStorage.setItem('memuser', JSON.stringify(user));
      return user;
    },
    async signOut() { user = null; sessionStorage.removeItem('memuser'); avisa(); },
    async restoreSession() { return user; },
    async tokenDeAcesso() { return user ? 'jwt-teste' : null; },
    urlDaFuncao(nome) { return 'https://funcao.teste/functions/v1/' + nome; },
    vapidPublica() { return window.__memSemVapid ? '' : 'BCJ6SqrQrqwQoUJJQxyIycaF8jk9RJp-X_95XEkzXTk1EC5wyX95n8QfsNW00xrjQjppLvXuUI04SY4dikjlO2Y'; },
    currentUser() { return user; },
    onAuthChange(f) { ouvintes.push(f); },

    async list(t) {
      const dono = exigeUsuario();
      const chaves = t === 'card_categories' ? ['card_id', 'category_id'] : [chaveDe(t)];
      return clonar(tabela(t).filter((l) => l.owner_id === dono)
        .sort((a, b) => chaves.map((k) => String(a[k]).localeCompare(String(b[k]))).find((c) => c) || 0));
    },
    async get(t, id) {
      const dono = exigeUsuario();
      const linha = tabela(t).find((l) => l[chaveDe(t)] === id && l.owner_id === dono);
      return linha ? clonar(linha) : null;
    },
    async insert(t, linhas) {
      const dono = exigeUsuario();
      const novas = (Array.isArray(linhas) ? linhas : [linhas]).map((l) => ({
        ...PADROES[t]?.(), ...(t === 'settings' || t === 'card_categories' ? {} : { id: uid() }), ...clonar(l), owner_id: dono,
      }));
      checarNovas(t, novas);
      tabela(t).push(...novas);
      save();
      return clonar(novas);
    },
    async upsert(t, linhas, conflito) {
      const dono = exigeUsuario();
      const cols = conflito.split(',').map((c) => c.trim());
      const novas = [];
      for (const l of linhas) {
        const cand = { ...clonar(l), owner_id: dono };
        // Como no Postgres, NULL nunca é igual a NULL: sem valor na chave, a linha não é duplicada.
        const repetida = cols.every((c) => cand[c] != null) && tabela(t).some((x) => cols.every((c) => x[c] === cand[c]));
        // ignoreDuplicates só vale para a chave do onConflict (também entre as linhas deste mesmo envio).
        if (repetida || (cols.every((c) => cand[c] != null) && novas.some((x) => cols.every((c) => x[c] === cand[c])))) continue;
        novas.push({ ...PADROES[t]?.(), ...(t === 'settings' || t === 'card_categories' ? {} : { id: uid() }), ...cand });
      }
      checarNovas(t, novas);
      tabela(t).push(...novas);
      save();
      return clonar(novas);
    },
    async update(t, id, patch) {
      const dono = exigeUsuario();
      const linha = tabela(t).find((l) => l[chaveDe(t)] === id && l.owner_id === dono);
      if (!linha) throw new Error(SO_DONO);
      checarLinha(t, { ...linha, ...clonar(patch), owner_id: dono }, tabela(t).filter((x) => x !== linha));
      Object.assign(linha, clonar(patch), { owner_id: dono });
      save();
      return clonar(linha);
    },
    async rpc(nome, args) {
      const dono = exigeUsuario();
      if (nome !== 'flash_somar_dia') throw new Error('Função desconhecida: ' + nome);
      let dia = db.flash_dias.find((d) => d.owner_id === dono && d.data === args.p_data);
      if (!dia) { dia = { id: uid(), owner_id: dono, data: args.p_data, revisados: 0, acertos: 0 }; db.flash_dias.push(dia); }
      dia.revisados += 1; dia.acertos += args.p_acerto ? 1 : 0;
      save();
      return clonar(dia);
    },
    async removeIds(t, ids) {
      const dono = exigeUsuario();
      db[t] = tabela(t).filter((l) => !(ids.includes(l.id) && l.owner_id === dono));
      save();
    },
    async updateWhere(t, filtro, patch) {
      const dono = exigeUsuario();
      const linhas = tabela(t).filter((l) => l.owner_id === dono && Object.entries(filtro).every(([k, v]) => l[k] === v));
      linhas.forEach((l) => Object.assign(l, clonar(patch), { owner_id: dono }));
      save();
      return clonar(linhas);
    },
    async remove(t, id) {
      const dono = exigeUsuario();
      const antes = tabela(t).length;
      db[t] = tabela(t).filter((l) => !(l[chaveDe(t)] === id && l.owner_id === dono));
      if (t === 'cards' && db[t].length < antes) cascataCard(id);
      if (t === 'baralhos' && db[t].length < antes) cascataFlash((f) => f.baralho_id === id);
      if (t === 'flashcards' && db[t].length < antes) db.flash_lados = db.flash_lados.filter((l) => l.flashcard_id !== id);
      if (t === 'categories' && db[t].length < antes) {
        // como no banco: subtags vão junto; vínculos somem; blocos e fixas ficam sem categoria
        const ids = new Set([id, ...db.categories.filter((c) => c.parent_id === id).map((c) => c.id)]);
        db.categories = db.categories.filter((c) => !ids.has(c.id));
        db.card_categories = db.card_categories.filter((cc) => !ids.has(cc.category_id));
        [...db.blocks, ...db.commitments].forEach((b) => { if (ids.has(b.category_id)) b.category_id = null; });
      }
      if (t === 'commitments' && db[t].length < antes) db.blocks = db.blocks.filter((b) => b.commitment_id !== id);
      if (t === 'items' && db[t].length < antes) {
        db.attachments = db.attachments.filter((a) => a.item_id !== id);
        db.blocks.forEach((b) => { if (b.item_id === id) b.item_id = null; });
      }
      save();
    },
    async removeWhere(t, filtro) {
      const dono = exigeUsuario();
      db[t] = tabela(t).filter((l) => !(l.owner_id === dono && Object.keys(filtro).every((k) => l[k] === filtro[k])));
      save();
    },

    async uploadFile(caminho, arquivo) { exigeUsuario(); arquivos[caminho] = (arquivo && arquivo.name) || 'arquivo'; save(); },
    async signedUrl(caminho) { exigeUsuario(); return 'memoria://' + caminho; },
    async removeFile(caminho) { exigeUsuario(); delete arquivos[caminho]; save(); },
  };

  window.__memArquivos = arquivos;
  window.__TEST_STORE__ = {};
  Object.keys(metodos).forEach((nome) => {
    if (SINCRONOS.includes(nome)) { window.__TEST_STORE__[nome] = metodos[nome]; return; }
    window.__TEST_STORE__[nome] = async (...args) => {
      if (deveFalhar(nome, args)) throw new Error('Sem conexão. Tente de novo.');
      // Falha em todas as chamadas do método (simula ficar sem conexão até a página sair).
      if (window.__memFalharSempre === nome) throw new Error('Sem conexão. Tente de novo.');
      // Rede lenta: `window.__memAtraso = { list: 800, update: 400 }`. A leitura tira a foto na hora e responde
      // depois; a gravação espera e só então grava (`__memGravando` conta as que estão a caminho).
      const atraso = window.__memAtraso && window.__memAtraso[nome];
      if (!atraso) return metodos[nome](...args);
      const esperar = () => new Promise((r) => setTimeout(r, atraso));
      if (nome === 'list' || nome === 'get') { const r = await metodos[nome](...args); await esperar(); return r; }
      window.__memGravando = (window.__memGravando || 0) + 1;
      try { await esperar(); return await metodos[nome](...args); } finally { window.__memGravando -= 1; }
    };
  });
})();
