// Grupos de baralhos: um grupo é um baralho com `e_grupo`; baralhos e grupos ficam dentro de um grupo por `pai_id`.
const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');

// Pai que vale: só um grupo que existe (pai sumido ou que não é grupo = raiz).
function paiValido(baralhos, b) {
  const pai = b.pai_id && baralhos.find((x) => x.id === b.pai_id);
  return pai && pai.e_grupo && pai.id !== b.id ? pai.id : null;
}

// Em cada nível: grupos primeiro, depois baralhos, em ordem alfabética. Ciclo (não deveria existir) é cortado.
export function arvoreDeBaralhos(baralhos) {
  const filhosDe = (paiId, vistos) => baralhos
    .filter((b) => paiValido(baralhos, b) === paiId && !vistos.has(b.id))
    .sort((a, b) => (Number(b.e_grupo) - Number(a.e_grupo)) || porNome(a, b))
    .map((b) => {
      const v = new Set(vistos).add(b.id);
      return { baralho: b, filhos: b.e_grupo ? filhosDe(b.id, v) : [] };
    });
  const raiz = filhosDe(null, new Set());
  // Quem ficou preso num ciclo aparece na raiz.
  const achados = new Set();
  const marcar = (ns) => ns.forEach((n) => { achados.add(n.baralho.id); marcar(n.filhos); });
  marcar(raiz);
  const soltos = baralhos.filter((b) => !achados.has(b.id)).sort(porNome).map((b) => ({ baralho: b, filhos: [] }));
  return [...raiz, ...soltos];
}

// Tudo que está dentro do grupo, em qualquer nível (ids).
function dentro(baralhos, grupoId) {
  const saida = new Set();
  const fila = [grupoId];
  while (fila.length) {
    const atual = fila.shift();
    for (const b of baralhos) {
      if (paiValido(baralhos, b) === atual && !saida.has(b.id) && b.id !== grupoId) { saida.add(b.id); fila.push(b.id); }
    }
  }
  return saida;
}

// Só os baralhos (que têm flashcards) dentro do grupo, em qualquer nível.
export function baralhosDentro(baralhos, grupoId) {
  const ids = dentro(baralhos, grupoId);
  return baralhos.filter((b) => ids.has(b.id) && !b.e_grupo).map((b) => b.id);
}

// Grupos para onde o baralho/grupo `id` pode ir: nunca ele mesmo nem um que está dentro dele.
export function destinosPossiveis(baralhos, id) {
  const proibidos = dentro(baralhos, id).add(id);
  return baralhos.filter((b) => b.e_grupo && !proibidos.has(b.id)).sort(porNome);
}

export function contagemDoGrupo(baralhos, porBaralho, grupoId) {
  return baralhosDentro(baralhos, grupoId).reduce((soma, id) => {
    const c = porBaralho.get(id);
    return c ? { novos: soma.novos + c.novos, revisar: soma.revisar + c.revisar } : soma;
  }, { novos: 0, revisar: 0 });
}

// Ao excluir um grupo, os filhos diretos sobem para o grupo de cima dele (nada é apagado).
export function filhosAoExcluirGrupo(baralhos, grupoId) {
  const grupo = baralhos.find((b) => b.id === grupoId);
  const cima = grupo ? paiValido(baralhos, grupo) : null;
  return baralhos.filter((b) => paiValido(baralhos, b) === grupoId).sort(porNome).map((b) => ({ id: b.id, pai_id: cima }));
}

// Ordem de gravação na restauração do backup: o grupo antes do que está dentro dele (o banco exige o pai antes).
export function paisPrimeiro(baralhos) {
  const ids = new Set(baralhos.map((b) => b.id));
  const saida = [];
  const feitos = new Set();
  let resto = [...baralhos];
  while (resto.length) {
    const prontos = resto.filter((b) => !b.pai_id || !ids.has(b.pai_id) || feitos.has(b.pai_id));
    if (!prontos.length) { saida.push(...resto); break; } // ciclo: grava o que sobrou como veio
    prontos.forEach((b) => { saida.push(b); feitos.add(b.id); });
    resto = resto.filter((b) => !feitos.has(b.id));
  }
  return saida;
}
