from harness import UITest
from test_dashboards import CAT, BLOCO


class TestRevisao(UITest):
    TODAY = '2026-11-18'  # quarta: a revisão de domingo 15/11 já passou

    def abrir(self, url=None):
        self.login()
        self.seed('categories', [CAT('E', 'Idiomas', conta_estudo=True, meta_semanal_min=300)])
        self.seed('lists', [{'id': 'L1', 'name': 'Em andamento', 'position': 1, 'is_active': True}])
        self.seed('cards', [{'id': 'cA', 'title': 'Espanhol', 'list_id': 'L1', 'position': 1}])
        sexta = BLOCO('2026-11-13', 1140, 1170, 'E', titulo='Espanhol')
        sexta['card_id'] = 'cA'
        self.seed('blocks', [
            BLOCO('2026-11-09', 480, 540, 'E', 'done'),
            BLOCO('2026-11-11', 1140, 1200, 'E', 'missed', 'Leitura', 'Cansado'),
            sexta,
        ])
        self.seed('commitments', [{'id': 'F1', 'title': 'Conversação', 'category_id': 'E', 'days': [4], 'start_min': 1140, 'end_min': 1200,
                                   'valid_from': '2026-11-01', 'valid_to': None, 'card_id': None, 'lembrete_min': None}])
        p = self.page
        if url:
            p.goto(self.base + url); p.wait_for_selector('#tela-revisao', state='visible')
        else:
            p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('revisao')

    def test_semana_numeros_e_resumo(self):
        self.abrir(); p = self.page
        self.assertEqual(p.inner_text('#cabecalho-titulo'), 'Revisão da semana')
        self.assertEqual(p.inner_text('#rev-rotulo'), '9 a 15 de novembro')
        self.assertTrue(p.is_hidden('#rev-proximo'))
        self.assertIn('1h', p.inner_text('#rev-cumprido')); self.assertIn('de 3h30 planejadas', p.inner_text('#rev-cumprido'))
        self.assertIn('25%', p.inner_text('#rev-pct'))
        self.assertIn('1h / 5h', p.inner_text('#rev-metas'))
        self.assertEqual(p.inner_text('#rev-resumo'), '3 não feitos · 2h30 · Mais falhas: quarta à noite, quinta à noite e sexta à noite')
        self.assertEqual(p.locator('#rev-lista .rev-item').count(), 3)
        self.assertIn('Cansado', p.inner_text('#rev-lista'))
        p.click('#rev-anterior'); self.assertEqual(p.inner_text('#rev-rotulo'), '2 a 8 de novembro')
        self.assertTrue(p.is_visible('#rev-proximo'))
        self.assertEqual(p.inner_text('#rev-resumo'), '1 não feito · 1h · Mais falhas: quinta à noite')

    def test_mandar_pendencias_para_a_fila(self):
        self.abrir(); p = self.page
        self.assertIn('2', p.inner_text('#rev-fila'))
        p.click('#rev-fila')
        p.wait_for_function("window.__memdb.blocks.some(b => b.commitment_id === 'F1' && b.date === '2026-11-12' && b.status === 'missed')")
        p.wait_for_function("window.__memdb.blocks.find(b => b.card_id === 'cA').status === 'missed'")
        p.wait_for_selector('#rev-fila', state='hidden')
        self.ir('semana')
        self.assertIn('Reagendar', p.locator('#fila-semana .fila-item[data-card="cA"]').inner_text())

    def test_link_do_aviso_abre_a_revisao(self):
        self.abrir('?tela=revisao')
        self.assertEqual(self.page.inner_text('#rev-rotulo'), '9 a 15 de novembro')
