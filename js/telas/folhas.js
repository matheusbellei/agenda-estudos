// Texto digitado e ainda não salvo nas folhas e formulários abertos.
// A recarga dos dados (ao voltar para a página) espera enquanto houver algum, e fechar pelo fundo ou pelo Esc pergunta antes.

const guardas = [];

// `temTexto` devolve true enquanto a folha (ou o formulário) tiver texto digitado e não salvo.
export function registrarTextoNaoSalvo(temTexto) { guardas.push(temTexto); }
export const haTextoNaoSalvo = () => guardas.some((f) => f());

// Pergunta dentro da própria folha: "Descartar" chama `aoDescartar`; "Continuar escrevendo" só tira a pergunta.
export function pedirDescarte(lugar, aoDescartar) {
  if (lugar.querySelector(':scope > .confirmar-descarte')) return;
  const caixa = document.createElement('div');
  caixa.className = 'confirmar-descarte';
  caixa.setAttribute('role', 'alertdialog');
  caixa.setAttribute('aria-label', 'Descartar o que você escreveu?');
  const pergunta = document.createElement('p');
  pergunta.textContent = 'Descartar o que você escreveu?';
  const botao = (texto, classe, marca, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.textContent = texto;
    b.setAttribute(marca, '');
    b.addEventListener('click', fn);
    return b;
  };
  const continuar = botao('Continuar escrevendo', 'btn', 'data-continuar', () => caixa.remove());
  const descartar = botao('Descartar', 'btn perigo', 'data-descartar', () => { caixa.remove(); aoDescartar(); });
  const linha = document.createElement('div');
  linha.className = 'linha-botoes';
  linha.append(continuar, descartar);
  caixa.append(pergunta, linha);
  lugar.append(caixa);
  caixa.scrollIntoView({ block: 'nearest' });
  continuar.focus({ preventScroll: true });
}
