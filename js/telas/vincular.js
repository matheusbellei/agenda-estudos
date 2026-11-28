// Janela para escolher por níveis: toque numa coluna (ou grupo) para abrir e escolha o card (ou baralho) dentro dela.
// `raiz`: [{ id, nome, filhos?, escolhivel?, grupo? }]. Sem `filhos` = folha, que se escolhe ao tocar.
// Um grupo (`escolhivel` com `filhos`) abre ao tocar e tem o botão "Escolher este grupo" lá dentro.
function criar(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === 'class') el.className = v;
    else if (k === 'texto') el.textContent = v;
    else el.setAttribute(k, v);
  }
  el.append(...filhos);
  return el;
}

export function abrirSeletor({ titulo, raiz, vazio = 'Nada para escolher.', aoEscolher }) {
  const camada = criar('div', { class: 'menu-camada seletor-camada', id: 'seletor' });
  const fundo = criar('div', { class: 'menu-fundo' });
  const folha = criar('div', { class: 'menu-folha seletor-folha', role: 'dialog', 'aria-label': titulo });
  camada.append(fundo, folha);
  const caminho = []; // nós abertos, do mais externo ao mais interno

  const fechar = () => { camada.remove(); document.removeEventListener('keydown', teclas, true); };
  const escolher = (no) => { fechar(); aoEscolher(no.id); };
  function teclas(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } }
  document.addEventListener('keydown', teclas, true);
  fundo.addEventListener('click', fechar);

  function desenhar() {
    const atual = caminho[caminho.length - 1] || null;
    const itens = atual ? atual.filhos : raiz;
    const cabeca = criar('div', { class: 'seletor-cabeca' });
    if (atual) {
      const voltar = criar('button', { type: 'button', class: 'btn', 'data-seletor-voltar': '', texto: '‹ Voltar' });
      voltar.addEventListener('click', () => { caminho.pop(); desenhar(); });
      cabeca.append(voltar);
    }
    cabeca.append(criar('h3', { texto: atual ? atual.nome : titulo }));
    const lista = criar('div', { class: 'seletor-lista' });
    if (atual?.escolhivel) {
      const este = criar('button', { type: 'button', class: 'btn btn-principal', 'data-seletor-este': atual.id, texto: `Escolher este grupo` });
      este.addEventListener('click', () => escolher(atual));
      lista.append(este);
    }
    if (!itens.length) lista.append(criar('p', { class: 'suave', texto: vazio }));
    for (const no of itens) {
      const abre = Array.isArray(no.filhos);
      const b = criar('button', { type: 'button', class: `btn menu-item seletor-item${abre ? ' seletor-abre' : ''}`, 'data-seletor': no.id });
      b.append(criar('span', { class: 'seletor-nome', texto: no.nome }));
      if (abre) b.append(criar('span', { class: 'seletor-seta', 'aria-hidden': 'true', texto: `${no.filhos.length} ›` }));
      b.addEventListener('click', () => { if (abre) { caminho.push(no); desenhar(); } else escolher(no); });
      lista.append(b);
    }
    const cancelar = criar('button', { type: 'button', class: 'btn', id: 'seletor-cancelar', texto: 'Cancelar' });
    cancelar.addEventListener('click', fechar);
    folha.replaceChildren(cabeca, lista, cancelar);
  }
  desenhar();
  document.body.append(camada);
}
