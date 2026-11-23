from harness import UITest

CRIADA = '2026-08-01T12:00:00Z'  # cedo o bastante para as regras não pularem ocorrências passadas
SEG, TER = '2026-11-16', '2026-11-17'
SEG_ANT, TER_ANT = '2026-11-09', '2026-11-10'


def fixa(id, titulo, dias, **kw):
    return dict(id=id, title=titulo, is_fixed=True, fixed_days=dias, created_at=CRIADA, **kw)


class FixasBase(UITest):
    def entrar(self, rollover='2026-11-09', **seeds):
        """Semeia antes do login: a verificação da virada roda assim que o estado carrega."""
        self.open()
        p = self.page
        if rollover:
            self.seed('settings', [dict(last_rollover=rollover)])
        for tabela, linhas in seeds.items():
            self.seed(tabela, linhas)
        p.fill('#login-email', 'dono@exemplo.com'); p.fill('#login-senha', 'senha123'); p.click('#login-entrar')
        p.wait_for_selector('#tela-semana', state='visible')

    def trocar_hoje(self, iso):
        """Vale a partir do próximo carregamento da página (script de inicialização acrescentado)."""
        self.page.add_init_script(f"""(() => {{ const T = new Date('{iso}T12:00:00-03:00').getTime();
          const D = Date; class FakeDate extends D {{ constructor(...a) {{ super(...(a.length ? a : [T])); }} static now() {{ return T; }} }};
          globalThis.Date = FakeDate; }})();""")

    def recarregar(self):
        self.page.reload()
        self.page.wait_for_selector('#tela-semana', state='visible')

    def folha_aberta(self):
        self.page.wait_for_selector('#folha-virada:not([hidden])')

    def folha_fechada(self):
        self.page.wait_for_function("document.querySelector('#folha-virada').hidden")

    def responder(self, card, data, resp):
        self.page.click(f'#folha-virada .virada-linha[data-card="{card}"][data-data="{data}"] [data-resp="{resp}"]')

    def ir_fixas(self):
        self.ir('fixas')
        self.page.wait_for_selector('#tela-fixas', state='visible')

    def ocorrencias(self):
        return sorted((o['card_id'], o['date'], o['status']) for o in self.db()['occurrences'])

    def rollover(self):
        return self.db()['settings'][0]['last_rollover']


class TestVirada(FixasBase):
    def test_pergunta_lista_a_ocorrencia_que_ficou_para_tras(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta()
        p = self.page
        self.assertEqual(p.locator('#folha-virada .virada-linha').count(), 1)
        self.assertEqual(p.inner_text('#folha-virada .virada-linha .virada-quem'), 'Revisão semanal · 09/11')
        self.assertIn('Ficou para trás', p.inner_text('#folha-virada h3'))
        self.assertEqual(p.inner_text('#folha-virada .virada-linha [data-resp="done"]'), 'Cumpri')
        self.assertEqual(p.inner_text('#folha-virada .virada-linha [data-resp="missed"]'), 'Não fiz')
        self.assertEqual(p.inner_text('#folha-virada .virada-linha [data-resp="carried"]'), 'Levar para esta semana')
        self.assertEqual(self.db()['occurrences'], [])

    def test_nao_fiz_concluir_grava_e_nao_pergunta_de_novo(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        self.responder('cL', SEG_ANT, 'missed')
        p.fill('#folha-virada .virada-linha .virada-nota', 'Li outro capítulo')
        p.click('#virada-concluir')
        self.folha_fechada()
        self.assertEqual(self.ocorrencias(), [('cL', SEG_ANT, 'missed')])
        self.assertEqual(self.db()['occurrences'][0]['instead_note'], 'Li outro capítulo')
        self.assertEqual(self.rollover(), SEG)
        self.recarregar()
        self.folha_fechada()

    def test_levar_para_esta_semana_cria_duas_entradas_na_fila(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        self.responder('cL', SEG_ANT, 'carried')
        p.click('#virada-concluir')
        self.folha_fechada()
        self.assertEqual(self.ocorrencias(), [('cL', SEG_ANT, 'carried')])
        datas = p.eval_on_selector_all('#fila-semana .fila-item[data-card="cL"]', 'els => els.map(e => e.dataset.fixaData)')
        self.assertEqual(sorted(datas), [SEG_ANT, SEG])

    def test_depois_nao_grava_e_a_pendencia_fica_na_tela_fixas(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        p.click('#virada-depois')
        self.folha_fechada()
        self.assertEqual(self.db()['occurrences'], [])
        self.assertEqual(self.rollover(), SEG_ANT)
        self.ir_fixas()
        self.assertEqual(p.locator('#fixas-atrasadas .atrasada').count(), 1)
        self.assertIn('Ficou para trás', p.inner_text('#fixas-atrasadas'))
        self.assertEqual(p.inner_text('#fixas-atrasadas .atrasada .virada-quem'), 'Revisão semanal · 09/11')
        self.recarregar()
        self.folha_aberta()

    def test_responder_na_tela_fixas_grava_na_hora_e_a_pergunta_some(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        p.click('#virada-depois')
        self.ir_fixas()
        p.click('#fixas-atrasadas .atrasada [data-resp="done"]')
        p.wait_for_function("window.__memdb.occurrences.length === 1")
        self.assertEqual(self.ocorrencias(), [('cL', SEG_ANT, 'done')])
        self.assertEqual(p.locator('#fixas-atrasadas .atrasada').count(), 0)
        self.recarregar()
        self.folha_fechada()

    def test_nao_feita_na_tela_fixas_pede_o_que_fez_no_lugar(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        p.click('#virada-depois')
        self.ir_fixas()
        p.click('#fixas-atrasadas .atrasada [data-resp="missed"]')
        p.fill('#fixas-atrasadas .atrasada .virada-nota', 'Revisei notas')
        p.click('#fixas-atrasadas .atrasada [data-confirmar]')
        p.wait_for_function("window.__memdb.occurrences.length === 1")
        o = self.db()['occurrences'][0]
        self.assertEqual((o['status'], o['instead_note']), ('missed', 'Revisei notas'))

    def test_quatro_semanas_perguntam_e_as_mais_velhas_fecham_sozinhas(self):
        self.entrar(rollover='2026-09-01', cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        quem = p.eval_on_selector_all('#folha-virada .virada-linha .virada-quem', 'els => els.map(e => e.textContent)')
        self.assertEqual(quem, ['Revisão semanal · 19/10', 'Revisão semanal · 26/10', 'Revisão semanal · 02/11', 'Revisão semanal · 09/11'])
        self.responder('cL', '2026-10-19', 'done'); self.responder('cL', '2026-10-26', 'missed')
        self.responder('cL', '2026-11-02', 'carried'); self.responder('cL', SEG_ANT, 'missed')
        p.click('#virada-concluir')
        self.folha_fechada()
        linhas = self.ocorrencias()
        self.assertEqual(len(linhas), 11)
        sozinhas = [d for _, d, s in linhas if d < '2026-10-19']
        self.assertEqual(sozinhas, ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'])
        self.assertTrue(all(s == 'missed' for _, d, s in linhas if d < '2026-10-19'))
        respondidas = {d: s for _, d, s in linhas if d >= '2026-10-19'}
        self.assertEqual(respondidas, {'2026-10-19': 'done', '2026-10-26': 'missed', '2026-11-02': 'carried', SEG_ANT: 'missed'})
        self.assertEqual(self.rollover(), SEG)

    def test_atalhos_marcam_todas(self):
        self.entrar(rollover='2026-10-26', cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        p.click('#virada-todas-nao-feitas')
        self.assertEqual(p.locator('#folha-virada [data-resp="missed"][aria-pressed="true"]').count(), 3)
        p.click('#virada-levar-todas')
        self.assertEqual(p.locator('#folha-virada [data-resp="carried"][aria-pressed="true"]').count(), 3)
        self.assertEqual(p.locator('#folha-virada [data-resp="missed"][aria-pressed="true"]').count(), 0)
        p.click('#virada-concluir')
        self.folha_fechada()
        self.assertEqual([s for _, _, s in self.ocorrencias()], ['carried'] * 3)

    def test_concluir_sem_responder_tudo_avisa_e_nao_grava(self):
        self.entrar(rollover='2026-11-02', cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        self.responder('cL', '2026-11-02', 'done')
        p.click('#virada-concluir')
        self.assertNotEqual(p.inner_text('#virada-erro'), '')
        self.assertEqual(self.db()['occurrences'], [])
        self.assertFalse(p.evaluate("document.querySelector('#folha-virada').hidden"))

    def test_sem_pendencias_atualiza_a_virada_em_silencio(self):
        self.entrar()
        self.folha_fechada()
        self.assertEqual(self.rollover(), SEG)

    def test_sem_ajustes_e_sem_fixas_nada_e_criado(self):
        self.entrar(rollover=None)
        self.folha_fechada()
        self.assertEqual(self.db()['settings'], [])

    def test_sem_ajustes_e_com_fixa_semanal_sem_pendencia_cria_a_virada_em_silencio(self):
        self.entrar(rollover=None, cards=[fixa('cL', 'Revisão semanal', [1])],
                    occurrences=[dict(card_id='cL', date=SEG_ANT, status='done')])
        self.folha_fechada()
        self.page.wait_for_function("window.__memdb.settings.length === 1")
        self.assertEqual(self.rollover(), SEG)

    def test_fixa_arquivada_ou_sem_dia_nao_cria_os_ajustes(self):
        self.entrar(rollover=None, cards=[fixa('cA', 'Antiga', [1], archived=True), fixa('cE', 'Anotações livres', [])])
        self.folha_fechada()
        self.assertEqual(self.db()['settings'], [])

    def test_sem_ajustes_a_lacuna_de_duas_semanas_e_perguntada(self):
        self.entrar(rollover=None, cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        self.responder('cL', SEG_ANT, 'done')
        p.click('#virada-concluir')
        self.folha_fechada()
        self.assertEqual(self.rollover(), SEG)
        self.trocar_hoje('2026-11-30')
        self.recarregar()
        self.folha_aberta()
        quem = p.eval_on_selector_all('#folha-virada .virada-quem', 'els => els.map(e => e.textContent)')
        self.assertEqual(quem, ['Revisão semanal · 16/11', 'Revisão semanal · 23/11'])
        self.assertIn('últimas semanas', p.inner_text('#folha-virada'))

    def test_so_fechar_sozinho_grava_em_silencio_sem_abrir_a_folha(self):
        feitas = [dict(card_id='cL', date=d, status='done') for d in ('2026-10-19', '2026-10-26', '2026-11-02', SEG_ANT)]
        self.entrar(rollover='2026-09-01', cards=[fixa('cL', 'Revisão semanal', [1])], occurrences=feitas)
        self.folha_fechada()
        self.page.wait_for_function("window.__memdb.settings[0].last_rollover === '2026-11-16'")
        missed = sorted(d for _, d, s in self.ocorrencias() if s == 'missed')
        self.assertEqual(missed, ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'])
        self.assertEqual(len(self.db()['occurrences']), 11)

    def test_uma_semana_diz_semana_passada(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta()
        self.assertIn('semana passada', self.page.inner_text('#folha-virada'))

    def test_levada_com_mais_de_quatro_semanas_fecha_como_nao_feita_no_login(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])],
                    occurrences=[dict(card_id='cL', date='2026-10-12', status='carried'), dict(card_id='cL', date='2026-11-02', status='carried')])
        self.folha_fechada(); p = self.page
        p.wait_for_function("window.__memdb.occurrences.some(o => o.date === '2026-10-12' && o.status === 'missed')")
        self.assertEqual(self.ocorrencias(), [('cL', '2026-10-12', 'missed'), ('cL', '2026-11-02', 'carried')])
        datas = p.eval_on_selector_all('#fila-semana .fila-item[data-card="cL"]', 'els => els.map(e => e.dataset.fixaData)')
        self.assertEqual(sorted(datas), ['2026-11-02', SEG])

    def test_semana_ja_virada_nao_pergunta(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_fechada()

    def test_respondida_como_nao_feita_ou_cumprida_atualiza_os_blocos_planejados(self):
        bloco = lambda id, data: dict(id=id, kind='study', title='Revisão semanal', card_id='cL', date=data, fixed_date=data, start_min=600, end_min=660)
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1, 2])], blocks=[bloco('b1', SEG_ANT), bloco('b2', TER_ANT)])
        self.folha_aberta(); p = self.page
        self.assertEqual(p.locator('#folha-virada .virada-linha').count(), 2)
        self.responder('cL', SEG_ANT, 'missed'); self.responder('cL', TER_ANT, 'done')
        p.fill('#folha-virada .virada-linha[data-data="2026-11-09"] .virada-nota', 'Fiz outra coisa')
        p.click('#virada-concluir')
        self.folha_fechada()
        blocos = {b['id']: b for b in self.db()['blocks']}
        self.assertEqual((blocos['b1']['status'], blocos['b1']['instead_note']), ('missed', 'Fiz outra coisa'))
        self.assertEqual(blocos['b2']['status'], 'done')

    def test_falha_ao_gravar_mantem_a_folha_as_respostas_e_a_nova_tentativa_nao_duplica(self):
        self.entrar(rollover='2026-11-02', cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        self.responder('cL', '2026-11-02', 'done'); self.responder('cL', SEG_ANT, 'missed')
        p.evaluate("window.__memFalhar = 'update'")  # cai na última escrita: last_rollover
        p.click('#virada-concluir')
        p.wait_for_function("document.querySelector('#virada-erro').textContent !== ''")
        self.assertFalse(p.evaluate("document.querySelector('#folha-virada').hidden"))
        self.assertEqual(self.rollover(), '2026-11-02')
        self.assertEqual(len(self.db()['occurrences']), 2)
        self.assertEqual(p.get_attribute('#folha-virada .virada-linha[data-data="2026-11-02"] [data-resp="done"]', 'aria-pressed'), 'true')
        self.assertEqual(p.get_attribute(f'#folha-virada .virada-linha[data-data="{SEG_ANT}"] [data-resp="missed"]', 'aria-pressed'), 'true')
        p.click('#virada-concluir')
        self.folha_fechada()
        self.assertEqual(self.ocorrencias(), [('cL', '2026-11-02', 'done'), ('cL', SEG_ANT, 'missed')])
        self.assertEqual(self.rollover(), SEG)

    def test_falha_ao_gravar_uma_ocorrencia_nao_perde_nada(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])])
        self.folha_aberta(); p = self.page
        self.responder('cL', SEG_ANT, 'carried')
        p.evaluate("window.__memFalhar = 'insert'")
        p.click('#virada-concluir')
        p.wait_for_function("document.querySelector('#virada-erro').textContent !== ''")
        self.assertEqual(self.db()['occurrences'], [])
        self.assertEqual(self.rollover(), SEG_ANT)
        p.click('#virada-concluir')
        self.folha_fechada()
        self.assertEqual(self.ocorrencias(), [('cL', SEG_ANT, 'carried')])

    def test_titulos_digitados_viram_texto(self):
        self.entrar(cards=[fixa('cL', '<b>Revisão semanal</b>', [1])])
        self.folha_aberta()
        self.assertEqual(self.page.inner_text('#folha-virada .virada-quem'), '<b>Revisão semanal</b> · 09/11')
        self.assertEqual(self.page.locator('#folha-virada b').count(), 0)


class TestTelaFixas(FixasBase):
    def test_linha_da_fixa_mostra_categoria_dias_situacao_e_historico(self):
        self.entrar(rollover=SEG,
                    categories=[dict(id='k1', name='Matemática', color='#C68B59')],
                    cards=[fixa('cL', 'Revisão semanal', [1]), fixa('cD', 'Exercícios de álgebra', [1, 2, 3, 4, 5, 6, 7]), fixa('cE', 'Anotações livres', [])],
                    card_categories=[dict(card_id='cL', category_id='k1')],
                    occurrences=[dict(card_id='cL', date=SEG_ANT, status='done'), dict(card_id='cL', date='2026-11-02', status='missed')])
        self.ir_fixas(); p = self.page
        self.assertEqual(p.locator('#tela-fixas .fixa').count(), 3)
        l = p.locator('.fixa[data-card="cL"]')
        self.assertIn('Revisão semanal', l.inner_text()); self.assertIn('Matemática', l.inner_text())
        self.assertEqual(l.locator('.fixa-dias').inner_text(), 'seg')
        self.assertEqual(p.inner_text('.fixa[data-card="cD"] .fixa-dias'), 'todo dia')
        self.assertEqual(p.inner_text('.fixa[data-card="cE"] .fixa-dias'), 'sem dia')
        self.assertEqual(l.locator('.oc').count(), 1)
        self.assertEqual(l.locator('.oc').get_attribute('data-estado'), 'a_fazer')
        self.assertEqual(p.locator('.fixa[data-card="cD"] .oc').count(), 7)
        hist = l.locator('.hist-marca')
        self.assertEqual(hist.count(), 4)
        self.assertEqual(hist.evaluate_all('els => els.map(e => e.dataset.estado)'), ['a_fazer', 'a_fazer', 'nao_feita', 'cumprida'])

    def test_marca_da_semana_distingue_agendada(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])],
                    blocks=[dict(kind='study', title='Revisão semanal', card_id='cL', date=SEG, fixed_date=SEG, start_min=600, end_min=660)])
        self.ir_fixas()
        self.assertEqual(self.page.locator('.fixa[data-card="cL"] .oc').get_attribute('data-estado'), 'agendada')
        self.assertEqual(self.page.locator('.fixa[data-card="cL"] .oc [data-acao="cumprida"]').count(), 0)

    def test_cumprida_muda_a_marca_e_tira_da_fila(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])])
        self.ir_fixas(); p = self.page
        oc = p.locator('.fixa[data-card="cL"] .oc')
        oc.locator('[data-acao="cumprida"]').click()
        p.wait_for_function("window.__memdb.occurrences.length === 1")
        self.assertEqual(self.ocorrencias(), [('cL', SEG, 'done')])
        self.assertEqual(oc.get_attribute('data-estado'), 'cumprida')
        self.ir('semana')
        self.assertEqual(p.locator('#fila-semana .fila-item[data-card="cL"]').count(), 0)

    def test_nao_feita_pede_o_que_fiz_no_lugar(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])])
        self.ir_fixas(); p = self.page
        oc = p.locator('.fixa[data-card="cL"] .oc')
        oc.locator('[data-acao="nao-feita"]').click()
        oc.locator('.virada-nota').fill('Estudei o <i>texto</i> de outro jeito')
        oc.locator('[data-confirmar]').click()
        p.wait_for_function("window.__memdb.occurrences.length === 1")
        o = self.db()['occurrences'][0]
        self.assertEqual((o['status'], o['instead_note']), ('missed', 'Estudei o <i>texto</i> de outro jeito'))
        self.assertEqual(oc.get_attribute('data-estado'), 'nao_feita')
        self.assertEqual(p.locator('.fixa[data-card="cL"] i').count(), 0)

    def test_falha_ao_gravar_mostra_o_erro_e_mantem_a_ocorrencia_a_fazer(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])])
        self.ir_fixas(); p = self.page
        p.evaluate("window.__memFalhar = 'insert'")
        p.click('.fixa[data-card="cL"] .oc [data-acao="cumprida"]')
        p.wait_for_function("document.querySelector('#fixas-erro').textContent !== ''")
        self.assertEqual(p.get_attribute('.fixa[data-card="cL"] .oc', 'data-estado'), 'a_fazer')
        self.assertEqual(self.db()['occurrences'], [])

    def test_levadas_pendentes_aparecem_em_ficou_para_tras_e_atualizam_a_mesma_linha(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])],
                    occurrences=[dict(card_id='cL', date='2026-11-02', status='carried'), dict(card_id='cL', date=SEG_ANT, status='carried')],
                    blocks=[dict(kind='study', title='Revisão semanal', card_id='cL', date=SEG_ANT, fixed_date=SEG_ANT, start_min=600, end_min=660, status='done')])
        self.ir_fixas(); p = self.page
        self.assertEqual(p.locator('#fixas-atrasadas .atrasada').count(), 1)
        linha = p.locator('#fixas-atrasadas .atrasada[data-data="2026-11-02"]')
        self.assertEqual(linha.locator('[data-resp]').evaluate_all('els => els.map(e => e.dataset.resp)'), ['done', 'missed'])
        linha.locator('[data-resp="missed"]').click()
        linha.locator('.virada-nota').fill('Fiz outra atividade')
        linha.locator('[data-confirmar]').click()
        p.wait_for_function("window.__memdb.occurrences.some(o => o.date === '2026-11-02' && o.status === 'missed')")
        o = [o for o in self.db()['occurrences'] if o['date'] == '2026-11-02']
        self.assertEqual((len(o), o[0]['instead_note']), (1, 'Fiz outra atividade'))
        self.assertEqual(p.locator('#fixas-atrasadas .atrasada').count(), 0)
        self.assertEqual(len(self.db()['occurrences']), 2)

    def test_levada_cumprida_pela_tela_sai_da_fila(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])],
                    occurrences=[dict(card_id='cL', date='2026-11-02', status='carried')])
        self.ir_fixas(); p = self.page
        p.click('#fixas-atrasadas .atrasada [data-resp="done"]')
        p.wait_for_function("window.__memdb.occurrences[0].status === 'done'")
        self.ir('semana')
        datas = p.eval_on_selector_all('#fila-semana .fila-item[data-card="cL"]', 'els => els.map(e => e.dataset.fixaData)')
        self.assertEqual(datas, [SEG])

    def test_falha_ao_ajustar_o_bloco_oferece_tentar_de_novo(self):
        self.entrar(cards=[fixa('cL', 'Revisão semanal', [1])],
                    blocks=[dict(id='b1', kind='study', title='Revisão semanal', card_id='cL', date=SEG_ANT, fixed_date=SEG_ANT, start_min=600, end_min=660)])
        self.folha_aberta(); p = self.page
        p.click('#virada-depois')
        self.ir_fixas()
        p.evaluate("window.__memFalhar = 'update:blocks'")
        p.click('#fixas-atrasadas .atrasada [data-resp="done"]')
        p.wait_for_selector('.falha-bloco')
        self.assertEqual(self.ocorrencias(), [('cL', SEG_ANT, 'done')])
        self.assertEqual(self.db()['blocks'][0]['status'], 'planned')
        self.assertIn('Revisão semanal · 09/11', p.inner_text('.falha-bloco'))
        p.click('.falha-bloco [data-acao="tentar-de-novo"]')
        p.wait_for_function("window.__memdb.blocks[0].status === 'done'")
        self.assertEqual(p.locator('.falha-bloco').count(), 0)
        self.assertEqual(len(self.db()['occurrences']), 1)

    def test_tocar_na_fixa_abre_o_card(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])])
        self.ir_fixas()
        self.page.click('.fixa[data-card="cL"] .fixa-abrir')
        self.page.wait_for_selector('#folha-card:not([hidden])')
        self.assertEqual(self.page.input_value('#card-titulo'), 'Revisão semanal')

    def test_nova_fixa_com_terca_e_quinta(self):
        self.entrar(rollover=SEG, categories=[dict(id='k1', name='Matemática', color='#C68B59')])
        self.ir_fixas(); p = self.page
        p.click('#fixas-nova')
        p.wait_for_selector('#folha-fixa:not([hidden])')
        p.fill('#fixa-titulo', 'Preparar o seminário')
        p.click('#folha-fixa [data-cat="k1"]')
        p.click('#folha-fixa [data-dia="2"]'); p.click('#folha-fixa [data-dia="4"]')
        p.click('#fixa-salvar')
        p.wait_for_function("document.querySelector('#folha-fixa').hidden")
        c = [c for c in self.db()['cards'] if c['title'] == 'Preparar o seminário'][0]
        self.assertEqual((c['is_fixed'], c['fixed_days'], c['list_id']), (True, [2, 4], None))
        self.assertEqual([(cc['card_id'], cc['category_id']) for cc in self.db()['card_categories']], [(c['id'], 'k1')])
        oc = p.locator(f'.fixa[data-card="{c["id"]}"] .oc[data-estado="a_fazer"]')
        self.assertEqual(oc.count(), 2)

    def test_nova_fixa_exige_titulo(self):
        self.entrar(rollover=SEG)
        self.ir_fixas(); p = self.page
        p.click('#fixas-nova'); p.click('#fixa-salvar')
        self.assertNotEqual(p.inner_text('#fixa-erro'), '')
        self.assertEqual(self.db()['cards'], [])
        p.click('#fixa-cancelar')
        self.assertTrue(p.evaluate("document.querySelector('#folha-fixa').hidden"))

    def test_nova_fixa_nao_duplica_o_card_se_so_as_categorias_falham(self):
        self.entrar(rollover=SEG, categories=[dict(id='k1', name='Matemática', color='#C68B59')])
        self.ir_fixas(); p = self.page
        p.click('#fixas-nova')
        p.fill('#fixa-titulo', 'Flashcards'); p.click('#folha-fixa [data-cat="k1"]'); p.click('#folha-fixa [data-dia="3"]')
        p.evaluate("""() => { const f = window.__TEST_STORE__.insert; let n = 0;
          window.__TEST_STORE__.insert = async (t, l) => { if (t === 'card_categories' && n++ === 0) throw new Error('Sem conexão. Tente de novo.'); return f(t, l); }; }""")
        p.click('#fixa-salvar')
        p.wait_for_function("document.querySelector('#fixa-erro').textContent !== ''")
        p.click('#fixa-salvar')
        p.wait_for_function("document.querySelector('#folha-fixa').hidden")
        self.assertEqual(len([c for c in self.db()['cards'] if c['title'] == 'Flashcards']), 1)
        self.assertEqual(len(self.db()['card_categories']), 1)

    def test_fixa_sem_dia_mostra_o_progresso_e_esta_na_fila_com_o_segundo_item(self):
        self.entrar(rollover=SEG, cards=[fixa('cE', 'Resumo do capítulo', [])],
                    items=[dict(id='i1', card_id='cE', title='Cap 1', position=1, done=True),
                           dict(id='i2', card_id='cE', title='Cap 2', position=2),
                           dict(id='i3', card_id='cE', title='Cap 3', position=3)])
        self.ir_fixas(); p = self.page
        self.assertIn('1 de 3', p.inner_text('.fixa[data-card="cE"] .fixa-progresso'))
        self.assertEqual(p.locator('.fixa[data-card="cE"] .oc').count(), 0)
        self.ir('semana')
        self.assertEqual(p.get_attribute('#fila-semana .fila-item[data-card="cE"]', 'data-item'), 'i2')

    def test_fixa_arquivada_so_aparece_em_arquivadas_e_pode_ser_restaurada(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1]), fixa('cA', 'Exercícios diários', [1, 2, 3, 4, 5, 6, 7], archived=True)])
        self.ir_fixas(); p = self.page
        self.assertEqual(p.locator('#tela-fixas .fixa[data-card="cA"]').count(), 0)
        self.assertEqual(p.locator('#fixas-lista .fixa').count(), 1)
        self.assertFalse(p.locator('#fixas-arquivadas-lista').is_visible())
        p.click('#fixas-arquivadas-alternar')
        self.assertEqual(p.locator('#fixas-arquivadas-lista .arquivada[data-card="cA"]').count(), 1)
        self.assertEqual(p.locator('#fila-semana').count(), 1)
        p.click('#fixas-arquivadas-lista [data-card="cA"] [data-acao="restaurar"]')
        p.wait_for_function("window.__memdb.cards.find(c => c.id === 'cA').archived === false")
        self.assertEqual(p.locator('#fixas-lista .fixa[data-card="cA"]').count(), 1)

    def test_titulo_digitado_vira_texto(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', '<img src=x onerror=alert(1)>', [1])])
        self.ir_fixas()
        self.assertEqual(self.page.inner_text('.fixa[data-card="cL"] .fixa-titulo'), '<img src=x onerror=alert(1)>')
        self.assertEqual(self.page.locator('.fixa img').count(), 0)


class TestBuscaDeOcorrencias(FixasBase):
    def test_no_lugar_de_fixa_aparece_na_busca_e_abre_a_tela_fixas(self):
        self.entrar(rollover=SEG, cards=[fixa('cL', 'Revisão semanal', [1])],
                    occurrences=[dict(card_id='cL', date=SEG_ANT, status='missed', instead_note='Passeio no parque')])
        p = self.page
        self.ir('busca')
        p.fill('#busca-termo', 'parque'); p.press('#busca-termo', 'Enter')
        r = p.locator('#busca-resultados .resultado[data-campo="no_lugar"]')
        r.wait_for()
        self.assertIn('No lugar · 09/11', r.inner_text())
        self.assertIn('Revisão semanal', r.inner_text())
        r.click()
        p.wait_for_selector('#tela-fixas', state='visible')
