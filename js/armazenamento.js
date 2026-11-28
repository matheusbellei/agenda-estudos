// Única porta para o Supabase: nenhum outro arquivo usa `window.supabase` nem fala com o banco.
const PAGINA = 1000;
const VALIDADE_URL_S = 3600;
const BUCKET = 'anexos';

// Colunas que identificam a linha quando a tabela não tem `id`.
const CHAVE = { settings: 'owner_id' };
const ORDEM_LISTA = { settings: ['owner_id'], card_categories: ['card_id', 'category_id'] };

function traduzErro(erro) {
  const msg = String((erro && erro.message) || erro || '');
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado no Supabase.';
  if (/duplicate key|unique constraint/i.test(msg)) return 'Já existe um registro igual. Atualize a página e tente de novo.';
  if (/row-level security|permission denied/i.test(msg)) return 'Você só pode alterar os seus próprios dados.';
  if (/JWT|session|expired/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  if (/Failed to fetch|NetworkError|network|fetch failed/i.test(msg)) return 'Sem conexão. Tente de novo.';
  return 'Algo deu errado: ' + msg;
}

// `url`: endereço do projeto (para chamar a função "lembretes"); `vapid`: chave pública das notificações.
export function createStore(client, { url = '', vapid = '' } = {}) {
  let usuario = null;
  const erroTraduzido = (e) => Object.assign(new Error(traduzErro(e)), { traduzido: true });
  const checar = ({ data, error }) => { if (error) throw erroTraduzido(error); return data; };
  // Falha de rede costuma ser exceção, não `{ error }`.
  const tentar = async (fn) => {
    try { return await fn(); } catch (e) { throw e && e.traduzido ? e : erroTraduzido(e); }
  };
  const balde = () => client.storage.from(BUCKET);

  return {
    signIn: (email, senha) => tentar(async () => {
      const data = checar(await client.auth.signInWithPassword({ email, password: senha }));
      usuario = data.user;
      return usuario;
    }),
    async signOut() { await client.auth.signOut(); usuario = null; },
    restoreSession: () => tentar(async () => {
      const { data } = await client.auth.getSession();
      usuario = (data && data.session && data.session.user) || null;
      return usuario;
    }),
    // Notificações: sessão atual (para a função conferir quem pede), endereço da função e chave pública.
    async tokenDeAcesso() {
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || null;
    },
    urlDaFuncao(nome) { return `${url}/functions/v1/${nome}`; },
    vapidPublica() { return vapid; },
    currentUser() { return usuario; },
    // Só avisa a perda de uma sessão que existia: o evento inicial sem sessão não conta.
    onAuthChange(cb) {
      client.auth.onAuthStateChange((_evento, sessao) => {
        const antes = usuario;
        usuario = (sessao && sessao.user) || null;
        if (antes && !usuario) cb(null);
      });
    },

    // O Supabase devolve no máximo 1000 linhas por vez; aqui buscamos página por página.
    list: (tabela) => tentar(async () => {
      const todas = [];
      for (let de = 0; ; de += PAGINA) {
        let q = client.from(tabela).select('*');
        for (const col of ORDEM_LISTA[tabela] || ['id']) q = q.order(col);
        const pagina = checar(await q.range(de, de + PAGINA - 1)) || [];
        todas.push(...pagina);
        if (pagina.length < PAGINA) return todas;
      }
    }),
    // Uma linha como está agora no banco (para não sobrescrever o que outro aparelho gravou).
    get: (tabela, id) => tentar(async () => {
      const data = checar(await client.from(tabela).select('*').eq(CHAVE[tabela] || 'id', id));
      return (data && data[0]) || null;
    }),
    insert: (tabela, linhas) => tentar(async () =>
      checar(await client.from(tabela).insert(Array.isArray(linhas) ? linhas : [linhas]).select()) || []),
    // `ignoreDuplicates`: reimportar não sobrescreve o que o usuário já editou.
    upsert: (tabela, linhas, conflito) => tentar(async () =>
      checar(await client.from(tabela).upsert(linhas, { onConflict: conflito, ignoreDuplicates: true }).select()) || []),
    update: (tabela, id, patch) => tentar(async () => {
      const data = checar(await client.from(tabela).update(patch).eq(CHAVE[tabela] || 'id', id).select());
      // Com RLS, editar algo que não é seu não dá erro: simplesmente não altera nada.
      if (!data || data.length === 0) throw erroTraduzido('row-level security');
      return data[0];
    }),
    // Altera só se todas as colunas do filtro casarem; devolve as linhas alteradas ([] quando nenhuma).
    updateWhere: (tabela, filtro, patch) => tentar(async () => {
      let q = client.from(tabela).update(patch);
      for (const col of Object.keys(filtro)) q = q.eq(col, filtro[col]);
      return checar(await q.select()) || [];
    }),
    remove: (tabela, id) => tentar(async () => { checar(await client.from(tabela).delete().eq(CHAVE[tabela] || 'id', id)); }),
    // Função do banco (ex.: soma atômica do resumo diário dos flashcards).
    rpc: (nome, args) => tentar(async () => checar(await client.rpc(nome, args))),
    removeIds: (tabela, ids) => tentar(async () => { if (ids.length) checar(await client.from(tabela).delete().in('id', ids)); }),
    removeWhere: (tabela, filtro) => tentar(async () => {
      let q = client.from(tabela).delete();
      for (const col of Object.keys(filtro)) q = q.eq(col, filtro[col]);
      checar(await q);
    }),

    uploadFile: (caminho, arquivo) => tentar(async () => { checar(await balde().upload(caminho, arquivo)); }),
    signedUrl: (caminho) => tentar(async () => checar(await balde().createSignedUrl(caminho, VALIDADE_URL_S)).signedUrl),
    removeFile: (caminho) => tentar(async () => { checar(await balde().remove([caminho])); }),
  };
}

// `extras.vapid`: chave pública das notificações (js/config.js), entregue ao aparelho ao ativar.
export function criarStoreReal(url, chave, extras = {}) {
  return createStore(window.supabase.createClient(url, chave), { url, vapid: extras.vapid || '' });
}
