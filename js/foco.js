// Linha do foco em andamento (tabela `focos`, uma por pessoa). Fica fora do estado.js e do backup:
// é passageira, e a função "lembretes" também a lê e altera.
export async function lerFoco(store) {
  return (await store.list('focos'))[0] || null;
}

// Cria a linha ou altera a que existe. `condicao` (ex.: { termina_em }) só altera se a linha ainda for aquela;
// devolve null quando nada foi alterado (a linha mudou ou foi apagada, por outro aparelho ou pela notificação).
export async function gravarFoco(store, existente, linha, condicao = {}) {
  const dados = { ...linha, atualizado_em: new Date().toISOString() };
  delete dados.owner_id;
  if (existente) {
    const [alterada] = await store.updateWhere('focos', { owner_id: existente.owner_id, ...condicao }, dados);
    return alterada || null;
  }
  const [criada] = await store.insert('focos', dados);
  return criada;
}

export async function apagarFoco(store, existente) {
  if (existente) await store.remove('focos', existente.owner_id);
}
