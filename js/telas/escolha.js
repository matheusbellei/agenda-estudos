// Lista suspensa própria (no lugar de <select>): mostra cor e ícone e pode marcar várias opções.
// Botão com o resumo; tocou, abre a lista; única fecha ao escolher, múltipla continua aberta.
// Teclado: setas andam, Enter/Espaço escolhe, Esc fecha e devolve o foco ao botão. Tocar fora fecha.
import { criar } from './quadro.js';

let aberta = null; // só uma lista aberta por vez no documento

document.addEventListener('click', (e) => {
  // composedPath: a opção tocada pode ter sido redesenhada (e saído do DOM) antes de o clique chegar aqui.
  if (aberta && !e.composedPath().includes(aberta.el)) aberta.fechar();
});

export function fecharEscolhaAberta() {
  aberta?.fechar();
}

export function criarEscolha({ id, rotulo, multipla = false, chave = 'valor', opcoes, resumo, aoEscolher }) {
  const botao = criar('button', { type: 'button', class: 'escolha-botao', id, 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  const lista = criar('ul', { class: 'escolha-lista', id: `${id}-lista`, role: 'listbox', 'aria-label': rotulo, hidden: '' });
  if (multipla) lista.setAttribute('aria-multiselectable', 'true');
  const el = criar('div', { class: 'escolha' },
    criar('span', { class: 'escolha-rotulo', id: `${id}-rotulo`, texto: rotulo }), botao, lista);
  botao.setAttribute('aria-labelledby', `${id}-rotulo ${id}`);

  const opcoesEls = () => [...lista.querySelectorAll('[role="option"]')];

  function desenharResumo() {
    const r = resumo();
    botao.replaceChildren(typeof r === 'string' ? criar('span', { class: 'escolha-vazio', texto: r }) : r,
      criar('i', { class: 'ti ti-chevron-down escolha-seta', 'aria-hidden': 'true' }));
  }

  const marcar = (li, sim) => { li.setAttribute('aria-selected', String(sim)); li.classList.toggle('selecionada', sim); };

  // Com as mesmas opções, só atualiza as marcas (a opção sob o dedo não é trocada no meio do toque);
  // se mudaram, redesenha e devolve o foco à opção que o tinha.
  function desenharOpcoes(forcar = false) {
    const novas = opcoes();
    const atuais = opcoesEls();
    if (!forcar && atuais.length === novas.length && atuais.every((li, i) => li.dataset[chave] === novas[i].id)) {
      atuais.forEach((li, i) => marcar(li, Boolean(novas[i].selecionada)));
      return;
    }
    const focada = lista.contains(document.activeElement) ? document.activeElement.dataset[chave] : null;
    lista.replaceChildren(...novas.map((o) => {
      const li = criar('li', { class: 'escolha-opcao', role: 'option', tabindex: '-1' },
        o.conteudo, criar('i', { class: 'ti ti-check escolha-marca', 'aria-hidden': 'true' }));
      li.dataset[chave] = o.id;
      marcar(li, Boolean(o.selecionada));
      return li;
    }));
    if (focada !== null) opcoesEls().find((o) => o.dataset[chave] === focada)?.focus({ preventScroll: true });
  }

  const api = {
    el,
    atualizar() { desenharResumo(); if (!lista.hidden) desenharOpcoes(); },
    fechar(voltarFoco = false) {
      if (lista.hidden) return;
      lista.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      if (aberta === api) aberta = null;
      if (voltarFoco) botao.focus();
    },
  };

  function abrir() {
    if (aberta && aberta !== api) aberta.fechar();
    desenharOpcoes(true);
    lista.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    aberta = api;
    const inicial = opcoesEls().find((o) => o.classList.contains('selecionada')) || opcoesEls()[0];
    inicial?.focus({ preventScroll: true });
    lista.scrollIntoView({ block: 'nearest' });
  }

  function escolher(li) {
    const valor = li.dataset[chave];
    if (!multipla) api.fechar(true);
    aoEscolher(valor);
  }

  botao.addEventListener('click', () => (lista.hidden ? abrir() : api.fechar()));
  lista.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) escolher(li);
  });
  // Foco saiu da escolha (Tab, por exemplo): fecha.
  el.addEventListener('focusout', (e) => {
    if (!lista.hidden && e.relatedTarget && !el.contains(e.relatedTarget)) api.fechar();
  });
  el.addEventListener('keydown', (e) => {
    if (lista.hidden) return;
    const os = opcoesEls();
    const i = os.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.fechar(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); os[Math.min(os.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); os[Math.max(0, i - 1)]?.focus(); }
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); escolher(os[i]); }
  });

  desenharResumo();
  return api;
}
