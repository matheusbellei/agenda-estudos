from harness import UITest

LISTAS = [{'id': 'L1', 'name': 'Em andamento', 'position': 1, 'is_active': True}]
CARDS = [{'id': 'K', 'title': 'Curso de Espanhol', 'list_id': 'L1', 'position': 1}]


class RevisoesBase(UITest):
    def entrar(self, **seeds):
        self.login()
        self.seed('lists', LISTAS); self.seed('cards', CARDS)
        for t, linhas in seeds.items(): self.seed(t, linhas)
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')

    def abrir_card(self):
        p = self.page
        self.ir('quadro'); p.click('.cartao-card[data-card="K"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')

    def revisoes(self):
        return sorted(self.db()['revisoes'], key=lambda r: r['data'])


class TestAgendarRevisao(RevisoesBase):
    def test_padrao_cria_as_duas_revisoes(self):
        self.entrar(); self.abrir_card(); p = self.page
        self.assertTrue(p.is_hidden('#card-revisoes-texto'))
        p.click('#card-revisao'); p.wait_for_selector('#revisao-janela:not([hidden])')
        texto = p.inner_text('#revisao-janela')
        self.assertIn('Daqui a 7 e 30 dias (23/11 e 16/12)', texto)
        self.assertIn('Escolher outras datas', texto)
        self.assertNotIn('Padrão', texto)
        p.click('#revisao-agendar')
        p.wait_for_function("window.__memdb.revisoes.length === 2")
        self.assertEqual([(r['card_id'], r['data'], r['status']) for r in self.revisoes()], [('K', '2026-11-23', 'pendente'), ('K', '2026-12-16', 'pendente')])
        self.assertEqual(p.inner_text('#card-revisoes-texto'), 'Revisões: 23/11 · 16/12')

    def test_personalizar_edita_tira_acrescenta_e_valida(self):
        self.entrar(); self.abrir_card(); p = self.page
        p.click('#card-revisao'); p.check('#revisao-personalizar')
        datas = p.locator('#revisao-datas input[type=date]')
        self.assertEqual([datas.nth(i).input_value() for i in range(datas.count())], ['2026-11-23', '2026-12-16'])
        datas.nth(0).fill('2026-11-20')
        p.click('#revisao-datas .revisao-tirar >> nth=1')
        p.click('#revisao-mais'); p.locator('#revisao-datas input[type=date]').nth(1).fill('2026-11-10')
        p.click('#revisao-agendar')
        self.assertEqual(p.inner_text('#revisao-erro'), 'As datas precisam ser de hoje em diante.')
        p.locator('#revisao-datas input[type=date]').nth(1).fill('2026-12-01')
        p.click('#revisao-agendar')
        p.wait_for_function("window.__memdb.revisoes.length === 2")
        self.assertEqual([r['data'] for r in self.revisoes()], ['2026-11-20', '2026-12-01'])

    def test_agendar_de_novo_substitui_as_que_faltam_e_cancelar(self):
        self.entrar(revisoes=[{'id': 'r1', 'card_id': 'K', 'data': '2026-11-10', 'status': 'feita'},
                              {'id': 'r2', 'card_id': 'K', 'data': '2026-11-20', 'status': 'pendente'}])
        self.abrir_card(); p = self.page
        self.assertEqual(p.inner_text('#card-revisoes-texto'), 'Revisões: 10/11 ✓ · 20/11')
        p.click('#card-revisao'); p.click('#revisao-agendar')
        p.wait_for_function("window.__memdb.revisoes.find(r => r.id === 'r2').status === 'cancelada'")
        self.assertEqual(sorted(r['data'] for r in self.db()['revisoes'] if r['status'] == 'pendente'), ['2026-11-23', '2026-12-16'])
        self.assertEqual(next(r for r in self.db()['revisoes'] if r['id'] == 'r1')['status'], 'feita')
        p.click('#card-revisoes-cancelar')
        p.wait_for_function("!window.__memdb.revisoes.some(r => r.status === 'pendente')")
        self.assertEqual(p.inner_text('#card-revisoes-texto'), 'Revisões: 10/11 ✓')
        self.assertTrue(p.is_hidden('#card-revisoes-cancelar'))


class TestRevisaoNaFila(RevisoesBase):
    def test_vencida_entra_na_fila_e_cumprir_conclui(self):
        self.entrar(revisoes=[{'id': 'r1', 'card_id': 'K', 'data': '2026-11-14', 'status': 'pendente'},
                              {'id': 'r2', 'card_id': 'K', 'data': '2026-12-01', 'status': 'pendente'}]); p = self.page
        item = p.locator('#fila-semana .fila-item[data-revisao="r1"]')
        self.assertIn('Revisar', item.inner_text())
        self.assertEqual(p.locator('#fila-semana .fila-item[data-revisao="r2"]').count(), 0)
        item.click()
        p.click('.dia[data-data="2026-11-18"] .faixa[data-inicio="1080"]')
        p.wait_for_function("window.__memdb.blocks.some(b => b.revisao_id === 'r1')")
        b = next(x for x in self.db()['blocks'] if x.get('revisao_id') == 'r1')
        self.assertEqual((b['card_id'], b['item_id'], b['title'], b['kind']), ('K', None, 'Revisão · Curso de Espanhol', 'study'))
        self.assertEqual(p.locator('#fila-semana .fila-item[data-revisao="r1"]').count(), 0)
        p.click(f'.bloco[data-bloco="{b["id"]}"] .bloco-cabeca'); p.wait_for_selector('#folha-bloco', state='visible')
        p.click('#bloco-cumprido')
        p.wait_for_function("window.__memdb.revisoes.find(r => r.id === 'r1').status === 'feita'")
        self.fechar_folha()
        p.click(f'.bloco[data-bloco="{b["id"]}"] .bloco-cabeca'); p.wait_for_selector('#folha-bloco', state='visible')
        p.click('#bloco-planejado')
        p.wait_for_function("window.__memdb.revisoes.find(r => r.id === 'r1').status === 'pendente'")


class TestAjustesRevisoes(RevisoesBase):
    def test_grava_os_dias_e_recusa_fora_de_ordem(self):
        self.entrar(); self.ir('ajustes'); p = self.page
        self.assertEqual(p.input_value('#aj-revisoes-dias'), '7, 30')
        p.fill('#aj-revisoes-dias', '30, 7'); p.click('#aj-revisoes-salvar')
        self.assertIn('do menor para o maior', p.inner_text('#aj-revisoes-erro'))
        p.fill('#aj-revisoes-dias', '3, 10, 30'); p.click('#aj-revisoes-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1 && JSON.stringify(window.__memdb.settings[0].revisoes_dias) === '[3,10,30]'")


class TestRevisaoCanceladaEBloco(RevisoesBase):
    BLOCO = {'id': 'bR', 'date': '2026-11-19', 'start_min': 600, 'end_min': 660, 'kind': 'study', 'title': 'Revisão · Curso de Espanhol',
             'card_id': 'K', 'revisao_id': 'r1', 'status': 'planned', 'cancelled': False}

    def test_cancelar_as_que_faltam_tira_as_sessoes_marcadas(self):
        self.entrar(revisoes=[{'id': 'r1', 'card_id': 'K', 'data': '2026-11-14', 'status': 'pendente'}], blocks=[self.BLOCO])
        self.abrir_card(); p = self.page
        p.click('#card-revisoes-cancelar')
        p.wait_for_function("window.__memdb.revisoes[0].status === 'cancelada'")
        p.wait_for_function("!window.__memdb.blocks.some(b => b.id === 'bR')")

    def test_bloco_de_revisao_cancelada_nao_ressuscita_a_revisao(self):
        self.entrar(revisoes=[{'id': 'r1', 'card_id': 'K', 'data': '2026-11-14', 'status': 'cancelada'}], blocks=[self.BLOCO]); p = self.page
        p.click('.bloco[data-bloco="bR"] .bloco-cabeca'); p.wait_for_selector('#folha-bloco', state='visible')
        self.assertTrue(p.is_hidden('#bloco-card-busca'))
        p.click('#bloco-cumprido')
        p.wait_for_function("window.__memdb.blocks.find(b => b.id === 'bR').status === 'done'")
        self.assertEqual(self.db()['revisoes'][0]['status'], 'cancelada')
