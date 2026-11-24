import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
// Lido assim para um config.js antigo, sem VAPID_PUBLIC_KEY, não quebrar o app.
import * as config from './config.js';
import { criarStoreReal } from './armazenamento.js';
import { criarEstado } from './estado.js';
import { iniciarCasca, irPara } from './telas/casca.js';
import { iniciarAjustes } from './telas/ajustes.js';
import { iniciarTags } from './telas/tags.js';
import { iniciarDashboards } from './telas/dashboards.js';
import { iniciarRevisao } from './telas/revisao.js';
import { iniciarFoco } from './telas/foco.js';
import { iniciarDiario } from './telas/diario.js';
import { iniciarQuadro } from './telas/quadro.js';
import { iniciarCard, abrirCard } from './telas/card.js';
import { iniciarBloco, abrirBloco } from './telas/bloco.js';
import { blocosDoPeriodo } from './regras/calendario.js';
import { refDoBloco } from './regras/lembretes.js';
import { sincronizar as sincronizarAparelho } from './notificacoes.js';
import { iniciarSemana } from './telas/semana.js';
import { iniciarHoje, mostrarDia } from './telas/hoje.js';
import { iniciarBusca } from './telas/busca.js';
import { iniciarFixas, verificarVirada } from './telas/fixas.js';
import { isoDe } from './regras/datas.js';
import { haTextoNaoSalvo } from './telas/folhas.js';
import { prepararLogin } from './telas/login.js';

// App instalável: o service worker só entra no site publicado (nos testes o banco é simulado).
if ('serviceWorker' in navigator && !window.__TEST_STORE__) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

(async function iniciar() {
  prepararLogin();
  if (!window.__TEST_STORE__ && SUPABASE_URL === 'COLOQUE_A_URL_AQUI') {
    document.querySelector('#tela-login').hidden = false;
    document.querySelector('#login-erro').textContent = 'Falta configurar o Supabase em js/config.js';
    // Sem Supabase não há o que enviar: o formulário não pode fazer envio nativo (recarregaria a página).
    document.querySelector('#login-form').addEventListener('submit', (e) => e.preventDefault());
    document.querySelector('#login-entrar').disabled = true;
    return;
  }
  const store = window.__TEST_STORE__ || criarStoreReal(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { vapid: config.VAPID_PUBLIC_KEY || '' });
  const estado = criarEstado(store);
  iniciarAjustes({ estado, store });
  iniciarTags({ estado });
  iniciarDashboards({ estado });
  iniciarRevisao({ estado });
  const vigiaFoco = iniciarFoco({ estado, store });
  iniciarDiario({ estado });
  iniciarQuadro({ estado, abrirCard });
  iniciarCard({ estado, store });
  iniciarBloco({ estado, abrirCard });
  iniciarSemana({ estado, abrirCard });
  iniciarHoje({ estado, abrirCard });
  iniciarFixas({ estado, abrirCard });
  iniciarBusca({ estado, abrirCard, mostrarDia });
  let dentro = false;
  let ultimoDia = null;
  let voltando = null;
  // Ao voltar para a página: relê os dados (outro aparelho pode ter gravado) e, se o dia mudou, refaz a virada.
  // Com texto digitado e não salvo em alguma folha, espera a próxima volta para não atrapalhar quem escreve.
  async function aoVoltar() {
    if (!dentro || document.visibilityState === 'hidden' || haTextoNaoSalvo()) return;
    const hoje = isoDe(new Date());
    try {
      // A foto só é aplicada se nenhuma gravação aconteceu durante a leitura e ainda não há texto por salvar.
      if (!(await estado.recarregar({ podeAplicar: () => dentro && !haTextoNaoSalvo() }))) return;
      if (hoje !== ultimoDia) {
        const antes = ultimoDia;
        ultimoDia = hoje;
        document.dispatchEvent(new CustomEvent('dia-mudou', { detail: { antes, agora: hoje } }));
        await verificarVirada({ estado, hoje });
      }
    } catch (err) {
      console.warn('Não foi possível atualizar os dados:', err);
    }
  }
  const voltar = () => { if (!voltando) voltando = aoVoltar().finally(() => { voltando = null; }); };
  document.addEventListener('visibilitychange', voltar);
  window.addEventListener('focus', voltar);

  // Toque na notificação: ./?bloco=<ref>&data=<AAAA-MM-DD> abre o dia no Hoje e o bloco por cima.
  function abrirDoLink(endereco) {
    const u = new URL(endereco, location.href);
    // Aviso da revisão da semana: abre a tela da revisão.
    // Avisos da revisão da semana e do fim de fase do foco: abrem a tela.
    const tela = u.searchParams.get('tela');
    if (tela === 'revisao' || tela === 'foco') { history.replaceState(null, '', location.pathname); irPara(tela); return; }
    const data = u.searchParams.get('data');
    const ref = u.searchParams.get('bloco');
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
    history.replaceState(null, '', location.pathname);
    mostrarDia(data);
    const bloco = ref && blocosDoPeriodo(estado.dados.commitments, estado.dados.blocks, data, data).find((b) => refDoBloco(b) === ref);
    if (bloco) abrirBloco(bloco);
  }
  navigator.serviceWorker?.addEventListener?.('message', (e) => { if (dentro && e.data?.tipo === 'abrir') abrirDoLink(e.data.url); });

  await iniciarCasca({
    store,
    aoEntrar: async () => {
      await estado.carregar();
      ultimoDia = isoDe(new Date());
      await verificarVirada({ estado, hoje: ultimoDia });
      dentro = true;
      // Depois de a casca mostrar a tela inicial (Semana), para o dia do link não ser sobrescrito.
      setTimeout(() => abrirDoLink(location.href), 0);
      vigiaFoco.entrar().catch(() => {});
      sincronizarAparelho(store).catch(() => {});
    },
    aoSair: () => { dentro = false; vigiaFoco.sair(); },
  });
})();
