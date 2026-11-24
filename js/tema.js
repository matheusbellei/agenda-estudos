// Tema claro/escuro, escolhido à mão e guardado neste aparelho. O <head> do index.html aplica antes de pintar.
const CHAVE = 'agenda-tema';
const COR_DA_BARRA = { claro: '#3B2416', escuro: '#2A1C13' };

export function temaAtual() {
  try { return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro'; } catch { return 'claro'; }
}

export function aplicarTema(tema) {
  const t = tema === 'escuro' ? 'escuro' : 'claro';
  try { localStorage.setItem(CHAVE, t); } catch { /* sem armazenamento: vale só nesta abertura */ }
  if (t === 'escuro') document.documentElement.dataset.tema = 'escuro';
  else delete document.documentElement.dataset.tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DA_BARRA[t]);
}
