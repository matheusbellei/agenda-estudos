from harness import UITest

QUA = '2026-11-18'
_n = [0]
def B(date, ini, status='planned', titulo='Estudo', **kw):
    _n[0] += 1
    return dict({'id': f'm{_n[0]}', 'date': date, 'start_min': ini, 'end_min': ini + 60, 'kind': 'commitment', 'title': titulo,
                 'status': status, 'cancelled': False}, **kw)


class ModelosBase(UITest):
    TODAY = QUA  # quarta

    def entrar(self, **seeds):
        self.login()
        for t, linhas in seeds.items(): self.seed(t, linhas)
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.ir('semana')

    def abrir(self):
        p = self.page
        p.click('#semana-modelos'); p.wait_for_selector('#modelos-janela')

    def blocos(self, de, ate):
        return sorted((b['date'], b['start_min'], b['title'], b['status']) for b in self.db()['blocks'] if de <= b['date'] <= ate and not b.get('cancelled'))


class TestSalvarModelo(ModelosBase):
    def test_salva_a_semana_como_modelo(self):
        self.entrar(blocks=[B('2026-11-16', 480, titulo='Gramática'), B('2026-11-18', 600, 'done', titulo='Leitura')]); p = self.page
        self.abrir()
        p.fill('#modelo-nome', 'Semana de prova'); p.click('#modelo-salvar')
        p.wait_for_function("window.__memdb.modelos.length === 1")
        m = self.db()['modelos'][0]
        self.assertEqual(m['nome'], 'Semana de prova')
        self.assertEqual([(i['dia'], i['start_min'], i['title']) for i in m['blocos']], [(1, 480, 'Gramática'), (3, 600, 'Leitura')])
        self.assertIn('Semana de prova', p.inner_text('#modelos-janela .modelo-item'))
        self.assertIn('2 blocos', p.inner_text('#modelos-janela .modelo-item'))

    def test_nome_vazio_repetido_e_semana_vazia(self):
        self.entrar(blocks=[B('2026-11-16', 480)], modelos=[{'id': 'M1', 'nome': 'Rotina', 'blocos': []}]); p = self.page
        self.abrir()
        p.click('#modelo-salvar')
        self.assertEqual(p.inner_text('#modelo-erro'), 'Dê um nome ao modelo.')
        p.evaluate("() => { window.__confirmOriginal = window.confirm; window.confirm = () => false; }")  # o harness aceita tudo
        p.fill('#modelo-nome', ' rotina '); p.click('#modelo-salvar')
        self.assertEqual(self.db()['modelos'][0]['blocos'], [])
        p.evaluate("() => { window.confirm = window.__confirmOriginal; }")
        p.click('#modelo-salvar')
        p.wait_for_function("window.__memdb.modelos[0].blocos.length === 1")
        self.assertEqual(len(self.db()['modelos']), 1)
        p.keyboard.press('Escape')
        p.click('#sem-prox'); self.abrir()
        p.fill('#modelo-nome', 'Vazia'); p.click('#modelo-salvar')
        self.assertEqual(p.inner_text('#modelo-erro'), 'Esta semana não tem blocos para salvar.')

    def test_excluir_modelo(self):
        self.entrar(modelos=[{'id': 'M1', 'nome': 'Rotina', 'blocos': []}]); p = self.page
        self.abrir()
        p.click('.modelo-item[data-modelo="M1"] .modelo-excluir')
        p.wait_for_function("window.__memdb.modelos.length === 0")
        self.assertEqual(p.locator('.modelo-item').count(), 0)


ITENS = [{'dia': 1, 'start_min': 420, 'end_min': 480, 'kind': 'commitment', 'title': 'Do modelo seg', 'category_id': None, 'card_id': None, 'item_id': None, 'lembrete_min': None, 'commitment_id': None},
         {'dia': 4, 'start_min': 420, 'end_min': 480, 'kind': 'commitment', 'title': 'Do modelo qui', 'category_id': None, 'card_id': None, 'item_id': None, 'lembrete_min': None, 'commitment_id': None}]


class TestAplicarModelo(ModelosBase):
    def preparar(self):
        self.entrar(modelos=[{'id': 'M1', 'nome': 'Rotina', 'blocos': ITENS}], blocks=[
            B('2026-11-17', 480, titulo='Ter passado'), B('2026-11-19', 480, titulo='Qui planejado'),
            B('2026-11-20', 480, 'done', titulo='Sex cumprido'), B('2026-11-21', 480, 'missed', titulo='Sab nao feito'),
            B('2026-11-23', 480, titulo='Prox planejado'), B('2026-11-24', 480, 'done', titulo='Prox cumprido')])

    def aplicar(self):
        p = self.page
        self.abrir(); p.click('.modelo-item[data-modelo="M1"] .modelo-aplicar')
        p.wait_for_selector('#modelo-aviso')

    def test_semana_seguinte_com_as_caixas_marcadas(self):
        self.preparar(); p = self.page
        p.click('#sem-prox'); self.aplicar()
        self.assertTrue(p.is_checked('#modelo-manter-cumpridos')); self.assertTrue(p.is_checked('#modelo-manter-nao-feitos'))
        self.assertIn('Manter os blocos marcados como cumpridos', p.inner_text('#modelo-aviso'))
        self.assertEqual(p.inner_text('#modelo-contagem'), 'Sai 1 planejado.')
        p.uncheck('#modelo-manter-cumpridos')
        self.assertEqual(p.inner_text('#modelo-contagem'), 'Saem 1 planejado e 1 cumprido.')
        p.check('#modelo-manter-cumpridos')
        p.click('#modelo-confirmar')
        p.wait_for_function("window.__memdb.blocks.some(b => b.title === 'Do modelo qui')")
        self.assertEqual(self.blocos('2026-11-23', '2026-11-29'), [
            ('2026-11-23', 420, 'Do modelo seg', 'planned'), ('2026-11-24', 480, 'Prox cumprido', 'done'), ('2026-11-26', 420, 'Do modelo qui', 'planned')])

    def test_semana_atual_nao_mexe_nos_dias_passados_e_desmarcados_saem(self):
        self.preparar(); p = self.page
        self.aplicar()
        p.uncheck('#modelo-manter-cumpridos'); p.uncheck('#modelo-manter-nao-feitos')
        self.assertEqual(p.inner_text('#modelo-contagem'), 'Saem 1 planejado, 1 cumprido e 1 não feito.')
        p.click('#modelo-confirmar')
        p.wait_for_function("window.__memdb.blocks.some(b => b.title === 'Do modelo qui')")
        self.assertEqual(self.blocos('2026-11-16', '2026-11-22'), [('2026-11-17', 480, 'Ter passado', 'planned'), ('2026-11-19', 420, 'Do modelo qui', 'planned')])

    def test_cancelar_nao_muda_nada(self):
        self.preparar(); p = self.page
        antes = self.blocos('2026-11-16', '2026-11-29')
        self.aplicar(); p.click('#modelo-cancelar')
        self.assertEqual(self.blocos('2026-11-16', '2026-11-29'), antes)


class TestAjusteFixasNoModelo(ModelosBase):
    def test_opcao_grava_na_hora(self):
        self.entrar(); self.ir('ajustes'); p = self.page
        self.assertFalse(p.is_checked('#aj-modelos-fixas'))
        p.check('#aj-modelos-fixas')
        p.wait_for_function("window.__memdb.settings.length === 1 && window.__memdb.settings[0].modelos_com_fixas === true")
