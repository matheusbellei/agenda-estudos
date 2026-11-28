from harness import UITest

CAT = lambda id, nome, **kw: dict({'id': id, 'owner_id': 'u1', 'name': nome, 'color': '#2471A3', 'icon': 'tag', 'parent_id': None,
                                   'archived': False, 'conta_estudo': False, 'meta_semanal_min': None}, **kw)
_n = [0]
def BLOCO(date, ini, fim, cat, status='planned', titulo='Estudo', nota=''):
    _n[0] += 1
    return {'id': f'b{_n[0]}', 'owner_id': 'u1', 'date': date, 'start_min': ini, 'end_min': fim, 'kind': 'study', 'title': titulo,
            'category_id': cat, 'card_id': None, 'item_id': None, 'commitment_id': None, 'fixed_date': None,
            'status': status, 'instead_note': nota, 'cancelled': False, 'lembrete_min': None}


class TestDashboards(UITest):
    TODAY = "2026-11-18"  # quarta
    def abrir(self, categories, blocks):
        self.login()
        self.seed('categories', categories); self.seed('blocks', blocks)
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.ir('dashboards')

    def dados(self):
        cats = [CAT('E', 'Idiomas', conta_estudo=True, meta_semanal_min=600), CAT('W', 'Trabalho'), CAT('X', 'Leitura')]
        blocks = [
            BLOCO('2026-11-16', 480, 540, 'E', 'done'),
            BLOCO('2026-11-17', 480, 510, 'E', 'done'),
            BLOCO('2026-11-16', 1200, 1230, 'E', 'missed', 'Revisão', 'Vi série'),
            BLOCO('2026-11-17', 600, 630, 'E', titulo='Gramática'),
            BLOCO('2026-11-18', 1140, 1170, 'E'),
            BLOCO('2026-11-16', 540, 1020, 'W'),
            BLOCO('2026-11-17', 900, 960, 'X', 'done'),
        ]
        return cats, blocks

    def test_sem_tag_de_estudo_convida_a_marcar(self):
        self.abrir([CAT('W', 'Trabalho')], [])
        p = self.page
        p.wait_for_selector('#dash-vazio', state='visible')
        p.click('#dash-ir-tags'); p.wait_for_selector('#tela-tags', state='visible')

    def test_numeros_metas_serie_mapa_e_lista_da_semana(self):
        self.abrir(*self.dados()); p = self.page
        self.assertEqual(p.inner_text('#dash-rotulo'), '16 a 22 de novembro')
        self.assertIn('1h30', p.inner_text('#dash-cumprido')); self.assertIn('de 3h planejadas', p.inner_text('#dash-cumprido'))
        self.assertIn('2 dias', p.inner_text('#dash-sequencia'))
        self.assertIn('50%', p.inner_text('#dash-pct'))
        tag = p.locator('#dash-tags .dash-tag[data-tag="E"]')
        self.assertIn('1h30 / 10h', tag.locator('.dash-tag-texto').inner_text())
        self.assertEqual(tag.locator('.dash-barra').get_attribute('data-cor'), 'baixo')
        self.assertEqual(p.locator('#dash-tags .dash-tag[data-tag="W"]').count(), 0)
        self.assertEqual(p.locator('#dash-serie .g-planejado').count(), 7)
        itens = p.locator('#dash-nao-feitos .dash-nao-feito')
        self.assertEqual(itens.count(), 2)
        textos = ' | '.join(itens.all_inner_texts())
        self.assertIn('sem marcar', textos); self.assertIn('Vi série', textos)

    def test_mes_media_e_setas(self):
        self.abrir(*self.dados()); p = self.page
        p.click('#dash-anterior'); self.assertEqual(p.inner_text('#dash-rotulo'), '9 a 15 de novembro')
        self.assertIn('0 min', p.inner_text('#dash-cumprido'))
        p.click('#dash-proximo'); p.click('#dash-periodo [data-periodo="mes"]')
        self.assertEqual(p.inner_text('#dash-rotulo'), 'novembro de 2026')
        self.assertIn('média', p.locator('#dash-tags .dash-tag[data-tag="E"] .dash-tag-texto').inner_text())
        self.assertEqual(p.locator('#dash-serie .g-planejado').count(), 6)
        p.click('#dash-periodo [data-periodo="ano"]'); self.assertEqual(p.inner_text('#dash-rotulo'), '2026')
        self.assertEqual(p.locator('#dash-serie .g-planejado').count(), 12)

    def test_intervalo_invalido_mantem_o_anterior(self):
        self.abrir(*self.dados()); p = self.page
        p.click('#dash-periodo [data-periodo="intervalo"]')
        antes = p.inner_text('#dash-rotulo')
        self.assertEqual(antes, '20 de outubro a 18 de novembro')
        p.fill('#dash-de', '2026-11-20'); p.fill('#dash-ate', '2026-11-10'); p.dispatch_event('#dash-ate', 'change')
        self.assertEqual(p.inner_text('#dash-erro'), 'A data final vem antes da inicial.')
        self.assertEqual(p.inner_text('#dash-rotulo'), antes)
        p.fill('#dash-de', '2026-11-16'); p.dispatch_event('#dash-de', 'change')
        p.fill('#dash-ate', '2026-11-17'); p.dispatch_event('#dash-ate', 'change')
        self.assertEqual(p.inner_text('#dash-erro'), '')
        self.assertEqual(p.inner_text('#dash-rotulo'), '16 a 17 de novembro')

    def test_marcar_outra_tag_como_estudo_atualiza_ao_voltar(self):
        self.abrir(*self.dados()); p = self.page
        self.ir('tags')
        p.click('.tag-bloco[data-tag="X"] .tag-editar'); p.wait_for_selector('#tag-janela:not([hidden])')
        p.check('#tag-estudo'); p.click('#tag-salvar')
        p.wait_for_function("document.querySelector('#tag-janela').hidden")
        self.ir('dashboards')
        self.assertIn('2h30', p.inner_text('#dash-cumprido'))
        self.assertEqual(p.locator('#dash-tags .dash-tag').count(), 2)

    def test_periodo_sem_estudo_mostra_texto(self):
        self.abrir(*self.dados()); p = self.page
        p.click('#dash-anterior'); p.click('#dash-anterior')
        self.assertIn('Nenhum estudo neste período.', p.inner_text('#tela-dashboards'))
        self.assertEqual(p.locator('#dash-serie svg').count(), 0)

    def test_erro_do_intervalo_some_quando_a_tela_redesenha(self):
        self.abrir(*self.dados()); p = self.page
        p.click('#dash-periodo [data-periodo="intervalo"]')
        p.fill('#dash-de', '2026-11-20'); p.fill('#dash-ate', '2026-11-10'); p.dispatch_event('#dash-ate', 'change')
        self.assertNotEqual(p.inner_text('#dash-erro'), '')
        self.ir('tags'); self.ir('dashboards')
        self.assertEqual(p.inner_text('#dash-erro'), '')
        self.assertEqual(p.input_value('#dash-de'), '2026-10-20')

    def test_intervalo_de_mais_de_5_anos_e_recusado(self):
        self.abrir(*self.dados()); p = self.page
        p.click('#dash-periodo [data-periodo="intervalo"]')
        antes = p.inner_text('#dash-rotulo')
        p.fill('#dash-de', '2015-01-01'); p.dispatch_event('#dash-de', 'change')
        self.assertEqual(p.inner_text('#dash-erro'), 'Escolha um intervalo de até 5 anos.')
        self.assertEqual(p.inner_text('#dash-rotulo'), antes)

    def test_flashcards_no_periodo(self):
        cats, blocks = self.dados()
        self.login()
        self.seed('categories', cats); self.seed('blocks', blocks)
        self.seed('flash_dias', [{'id': 'd1', 'data': '2026-11-16', 'revisados': 10, 'acertos': 8}, {'id': 'd2', 'data': '2026-11-17', 'revisados': 5, 'acertos': 4}])
        p = self.page; p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('dashboards')
        self.assertEqual(p.inner_text('#dash-flash-acerto'), '80% de acerto · 15 revisados')
        self.assertEqual(p.locator('#dash-flash-serie .g-cumprido').count(), 7)
        p.click('#dash-anterior')
        self.assertIn('Nenhum flashcard revisado neste período.', p.inner_text('#dash-flash'))
