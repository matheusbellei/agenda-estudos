// Datas são texto YYYY-MM-DD no fuso do aparelho. Aqui nunca se usa toISOString (converte para UTC).

const doisDigitos = (n) => String(n).padStart(2, '0');

export function isoDe(date) {
  return `${date.getFullYear()}-${doisDigitos(date.getMonth() + 1)}-${doisDigitos(date.getDate())}`;
}

function dataDe(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 12); // meio-dia evita problemas de horário de verão
}

export function somaDias(iso, n) {
  const d = dataDe(iso);
  d.setDate(d.getDate() + n);
  return isoDe(d);
}

export function diaDaSemana(iso) {
  const dia = dataDe(iso).getDay(); // 0 = domingo
  return dia === 0 ? 7 : dia;
}

export function inicioDaSemana(iso) {
  return somaDias(iso, 1 - diaDaSemana(iso));
}

export function diasDaSemana(iso) {
  const segunda = inicioDaSemana(iso);
  return Array.from({ length: 7 }, (_, i) => somaDias(segunda, i));
}

export function horaTexto(min) {
  return `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;
}

export function minutosDe(texto) {
  const [h, m] = texto.split(':').map(Number);
  return h * 60 + m;
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_LONGOS = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
export const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const partes = (iso) => iso.split('-').map(Number);

// "16 a 22 de novembro" ou "30 de novembro a 6 de dezembro".
export function rotuloSemana(dias) {
  const [, m1, d1] = partes(dias[0]);
  const [, m2, d2] = partes(dias[dias.length - 1]);
  return m1 === m2 ? `${d1} a ${d2} de ${MESES[m1 - 1]}` : `${d1} de ${MESES[m1 - 1]} a ${d2} de ${MESES[m2 - 1]}`;
}

// "segunda-feira, 16 de novembro"
export function rotuloDia(iso) {
  const [, m, d] = partes(iso);
  return `${DIAS_LONGOS[diaDaSemana(iso) - 1]}, ${d} de ${MESES[m - 1]}`;
}
