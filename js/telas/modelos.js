// Modelos de semana: salvar a semana mostrada e aplicar um modelo nela (de hoje em diante), com aviso do que sai.
import { criar } from './bloco.js';
import { abrirJanela } from './janela.js';
import { hojeDoApp } from './revisoes.js';
import { itensDoModelo, planoDeAplicacao, textoDaContagem } from '../regras/modelos.js';
import { somaDias, rotuloSemana } from '../regras/datas.js';

const mesmoNome = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function abrirModelos({ estado, segunda }) {
  const rotulo = rotuloSemana([segunda, somaDias(segunda, 6)]);
  const nome = criar('input', { id: 'modelo-nome', type: 'text', maxlength: '60', placeholder: 'Semana de prova', autocomplete: 'off' });
  const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'modelo-salvar', texto: 'Salvar' });
  const erro = criar('div', { class: 'erro', id: 'modelo-erro', role: 'alert' });
  const lista = criar('div', { class: 'modelos-lista' });
  const { janela, fechar } = abrirJanela('modelos-janela', 'Modelos de semana',
    criar('label', { class: 'campo' }, criar('span', { texto: `Salvar ${rotulo} como modelo` }),
      criar('div', { class: 'linha-botoes' }, nome, salvar)),
    erro, criar('h3', { texto: 'Seus modelos' }), lista);

  function desenharLista() {
    const modelos = [...estado.dados.modelos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    lista.replaceChildren(...(modelos.length ? modelos.map((m) => {
      const n = (m.blocos || []).length;
      const aplicar = criar('button', { type: 'button', class: 'btn btn-mini modelo-aplicar', texto: 'Aplicar nesta semana' });
      const excluir = criar('button', { type: 'button', class: 'btn-icone modelo-excluir', 'aria-label': `Excluir ${m.nome}` }, criar('i', { class: 'ti ti-trash', 'aria-hidden': 'true' }));
      aplicar.addEventListener('click', () => { fechar(); abrirAviso({ estado, segunda, modelo: m }); });
      excluir.addEventListener('click', async () => {
        if (!window.confirm(`Excluir o modelo "${m.nome}"?`)) return;
        try { await estado.excluir('modelos', m.id); desenharLista(); } catch (err) { erro.textContent = err.message || 'Não foi possível excluir.'; }
      });
      return criar('div', { class: 'modelo-item', 'data-modelo': m.id },
        criar('div', { class: 'modelo-info' }, criar('b', { texto: m.nome }), criar('span', { class: 'suave', texto: `${n} ${n === 1 ? 'bloco' : 'blocos'}` })),
        aplicar, excluir);
    }) : [criar('p', { class: 'suave', texto: 'Nenhum modelo ainda. Monte uma semana e salve aqui.' })]));
  }
  desenharLista();

  let ocupado = false;
  salvar.addEventListener('click', async () => {
    if (ocupado) return;
    const texto = nome.value.trim();
    if (!texto) { erro.textContent = 'Dê um nome ao modelo.'; return; }
    const itens = itensDoModelo(estado.dados, segunda, !!estado.ajustes().modelos_com_fixas);
    if (!itens.length) { erro.textContent = 'Esta semana não tem blocos para salvar.'; return; }
    const existente = estado.dados.modelos.find((m) => mesmoNome(m.nome, texto));
    if (existente && !window.confirm('Já existe um modelo com esse nome. Substituir?')) return;
    ocupado = true; erro.textContent = '';
    try {
      if (existente) await estado.alterar('modelos', existente.id, { blocos: itens, atualizado_em: new Date().toISOString() });
      else await estado.criar('modelos', { nome: texto, blocos: itens });
      nome.value = '';
      desenharLista();
    } catch (err) {
      // Outro aparelho salvou o mesmo nome agora há pouco.
      erro.textContent = /registro igual/.test(err.message || '') ? 'Já existe um modelo com esse nome.' : err.message || 'Não foi possível salvar o modelo.';
    } finally { ocupado = false; }
  });
  return janela;
}

function abrirAviso({ estado, segunda, modelo }) {
  const hoje = hojeDoApp(estado);
  const caixa = (id, texto) => {
    const c = criar('input', { type: 'checkbox', id });
    c.checked = true;
    return [c, criar('label', { class: 'campo-check', for: id }, c, criar('span', { texto }))];
  };
  const [cumpridos, lCumpridos] = caixa('modelo-manter-cumpridos', 'Manter os blocos marcados como cumpridos');
  const [naoFeitos, lNaoFeitos] = caixa('modelo-manter-nao-feitos', 'Manter os blocos marcados como não feitos');
  const contagem = criar('p', { id: 'modelo-contagem', class: 'modelo-contagem' });
  const erro = criar('div', { class: 'erro', id: 'modelo-aviso-erro', role: 'alert' });
  const confirmar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'modelo-confirmar', texto: 'Aplicar modelo' });
  const cancelar = criar('button', { type: 'button', class: 'btn', id: 'modelo-cancelar', texto: 'Cancelar' });
  const passado = segunda < hoje ? criar('p', { class: 'suave', texto: 'Os dias que já passaram não mudam.' }) : '';
  const { fechar } = abrirJanela('modelo-aviso', `Aplicar "${modelo.nome}" em ${rotuloSemana([segunda, somaDias(segunda, 6)])}?`,
    criar('p', { texto: 'Os blocos planejados desta semana serão substituídos pelos do modelo.' }), passado,
    lCumpridos, lNaoFeitos, contagem, erro, criar('div', { class: 'linha-botoes' }, confirmar, cancelar));

  const plano = () => planoDeAplicacao({ itens: modelo.blocos || [], dados: estado.dados, segunda, hoje,
    manterCumpridos: cumpridos.checked, manterNaoFeitos: naoFeitos.checked });
  const contar = () => { contagem.textContent = textoDaContagem(plano().contagem); };
  cumpridos.addEventListener('change', contar);
  naoFeitos.addEventListener('change', contar);
  contar();
  cancelar.addEventListener('click', fechar);

  let ocupado = false;
  confirmar.addEventListener('click', async () => {
    if (ocupado) return;
    ocupado = true; confirmar.disabled = true; erro.textContent = '';
    const { remover, criar: novos } = plano();
    try {
      await estado.trocarBlocos(remover, novos);
      fechar();
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível aplicar o modelo.';
      try { await estado.carregar(); } catch { /* a mensagem já está na tela */ }
    } finally { ocupado = false; confirmar.disabled = false; }
  });
}
