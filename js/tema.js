// Tema escolhido neste aparelho: Automático (segue o celular/computador), Claro ou Escuro.
// O <head> do index.html aplica antes de pintar; aqui ele é trocado e acompanhado.
const CHAVE = 'agenda-tema';
const COR_DA_BARRA = { claro: '#3B2416', escuro: '#2A1C13' };
const escuroNoAparelho = () => { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } };

// Sem escolha guardada: Claro (o tema que o app sempre teve).
export function temaAtual() {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === 'escuro' || t === 'auto' ? t : 'claro';
  } catch { return 'claro'; }
}

function pintar(t) {
  const efetivo = t === 'auto' ? (escuroNoAparelho() ? 'escuro' : 'claro') : t;
  if (efetivo === 'escuro') document.documentElement.dataset.tema = 'escuro';
  else delete document.documentElement.dataset.tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DA_BARRA[efetivo]);
}

export function aplicarTema(tema) {
  const t = tema === 'escuro' || tema === 'auto' ? tema : 'claro';
  try { localStorage.setItem(CHAVE, t); } catch { /* sem armazenamento: vale só nesta abertura */ }
  pintar(t);
}

// No Automático, o app muda junto quando o aparelho troca de tema.
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (temaAtual() === 'auto') pintar('auto'); });
} catch { /* navegador sem matchMedia */ }
