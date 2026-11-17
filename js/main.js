import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { criarStoreReal } from './armazenamento.js';
import { criarEstado } from './estado.js';
import { iniciarCasca } from './telas/casca.js';
import { iniciarAjustes } from './telas/ajustes.js';
import { iniciarQuadro } from './telas/quadro.js';
import { iniciarCard, abrirCard } from './telas/card.js';
import { iniciarBloco } from './telas/bloco.js';
import { iniciarSemana } from './telas/semana.js';
import { iniciarHoje, mostrarDia } from './telas/hoje.js';
import { iniciarBusca } from './telas/busca.js';
import { iniciarFixas, verificarVirada } from './telas/fixas.js';
import { isoDe } from './regras/datas.js';
import { haTextoNaoSalvo } from './telas/folhas.js';

(async function iniciar() {
  if (!window.__TEST_STORE__ && SUPABASE_URL === 'COLOQUE_A_URL_AQUI') {
    document.querySelector('#tela-login').hidden = false;
    document.querySelector('#login-erro').textContent = 'Falta configurar o Supabase em js/config.js';
    // Sem Supabase não há o que enviar: o formulário não pode fazer envio nativo (recarregaria a página).
    document.querySelector('#login-form').addEventListener('submit', (e) => e.preventDefault());
    document.querySelector('#login-entrar').disabled = true;
    return;
  }
  const store = window.__TEST_STORE__ || criarStoreReal(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const estado = criarEstado(store);
  iniciarAjustes({ estado, store });
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

  await iniciarCasca({
    store,
    aoEntrar: async () => {
      await estado.carregar();
      ultimoDia = isoDe(new Date());
      await verificarVirada({ estado, hoje: ultimoDia });
      dentro = true;
    },
    aoSair: () => { dentro = false; },
  });
})();
