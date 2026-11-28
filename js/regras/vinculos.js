// Árvores para escolher o que um bloco da agenda vincula: cards (por coluna do Quadro) e baralhos (por grupo).
// Só organização: vincular não muda nada no card nem no baralho.
import { arvoreDeBaralhos } from './baralhos.js';

const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');

// Colunas do Quadro (na ordem do Quadro), cada uma com os cards não arquivados em ordem alfabética.
// Coluna sem card não aparece.
export function colunasComCards({ lists, cards }) {
  return [...lists].sort((a, b) => a.position - b.position)
    .map((l) => ({
      id: l.id, nome: l.name,
      filhos: cards.filter((c) => c.list_id === l.id && !c.archived)
        .map((c) => ({ id: c.id, nome: c.title })).sort(porNome),
    }))
    .filter((l) => l.filhos.length);
}

// Grupos e baralhos como árvore. Grupo pode ser escolhido (escolhivel) e também aberto; grupo vazio também aparece.
export function arvoreParaEscolher(baralhos) {
  const monta = (n) => (n.baralho.e_grupo
    ? { id: n.baralho.id, nome: n.baralho.nome, escolhivel: true, grupo: true, filhos: n.filhos.map(monta) }
    : { id: n.baralho.id, nome: n.baralho.nome, escolhivel: true });
  return arvoreDeBaralhos(baralhos).map(monta);
}
