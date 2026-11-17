from harness import UITest

OUTRO = '2026-11-17'


class TestBusca(UITest):
    def preparar(self):
        self.login()
        self.seed('categories', [{'name': 'Programação', 'color': '#3E6FB0'}, {'name': 'Idiomas', 'color': '#C68B59'}])
        cats = {c['name']: c['id'] for c in self.db()['categories']}
        self.seed('lists', [{'name': 'Em andamento', 'position': 1024}])
        lista = self.db()['lists'][0]['id']
        self.seed('cards', [
            {'title': 'Linguística geral', 'list_id': lista, 'notes': 'Estudo da Semântica formal e lexical.'},
            {'title': 'Francês avançado', 'list_id': lista, 'notes': ''},
            {'title': 'Perigoso', 'list_id': lista, 'notes': 'texto zebra <img src=x onerror="window.__xss=1"> depois'},
        ])
        self.cards = {c['title']: c['id'] for c in self.db()['cards']}
        self.seed('card_categories', [{'card_id': self.cards['Linguística geral'], 'category_id': cats['Programação']},
                                      {'card_id': self.cards['Francês avançado'], 'category_id': cats['Idiomas']}])
        self.cats = cats
        self.seed('items', [{'card_id': self.cards['Linguística geral'], 'title': 'Aula 3', 'position': 1, 'notes': 'rever fonologia segmental'}])
        self.item = self.db()['items'][0]['id']
        self.seed('blocks', [{'date': OUTRO, 'start_min': 600, 'end_min': 660, 'kind': 'study', 'title': 'Francês avançado',
                              'card_id': self.cards['Francês avançado'], 'status': 'missed', 'instead_note': 'fui ao parque e fiz fonologia leve'}])
        self.bloco = self.db()['blocks'][0]['id']
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible')
        p.click('[data-aba="busca"]')
        p.wait_for_selector('#busca-termo', state='visible')

    def buscar(self, termo):
        self.page.fill('#busca-termo', termo)

    def test_digitar_acha_e_destaca_com_mark(self):
        self.preparar(); p = self.page
        self.buscar('semantica')
        p.wait_for_selector('.resultado')
        self.assertEqual(p.locator('.resultado').count(), 1)
        self.assertEqual(p.get_attribute('.resultado', 'data-card'), self.cards['Linguística geral'])
        self.assertEqual(p.inner_text('.resultado mark'), 'Semântica')
        self.assertIn('Linguística geral', p.inner_text('.resultado'))
        self.assertIn('Anotações', p.inner_text('.resultado'))

    def test_busca_espera_a_pausa_na_digitacao(self):
        self.preparar(); p = self.page
        self.buscar('semantica')
        self.assertEqual(p.locator('.resultado').count(), 0)  # antes dos 250 ms
        p.wait_for_selector('.resultado')

    def test_tocar_em_resultado_de_item_abre_o_card_com_o_item_expandido(self):
        self.preparar(); p = self.page
        self.buscar('segmental')
        p.click(f'.resultado[data-item="{self.item}"]')
        p.wait_for_selector('#folha-card', state='visible')
        self.assertEqual(p.locator(f'.item[data-item="{self.item}"].aberto').count(), 1)

    def test_origem_do_resultado_de_item(self):
        self.preparar(); p = self.page
        self.buscar('segmental')
        p.wait_for_selector('.resultado')
        self.assertIn('Item: Aula 3', p.inner_text('.resultado'))

    def test_sem_resultados(self):
        self.preparar(); p = self.page
        self.buscar('xyzzy')
        p.wait_for_selector('#busca-resultados:has-text("Nada encontrado para")')
        self.assertIn('Nada encontrado para “xyzzy”', p.inner_text('#busca-resultados'))
        self.assertEqual(p.locator('.resultado').count(), 0)

    def test_termo_curto_pede_mais_letras(self):
        self.preparar(); p = self.page
        self.buscar('a')
        p.wait_for_selector('#busca-resultados:has-text("pelo menos 2")')

    def test_no_lugar_abre_o_dia_em_hoje(self):
        self.preparar(); p = self.page
        self.buscar('parque')
        p.wait_for_selector(f'.resultado[data-bloco="{self.bloco}"]')
        self.assertIn('No lugar · 17/11', p.inner_text('.resultado'))
        p.click('.resultado')
        p.wait_for_selector('#tela-hoje', state='visible')
        self.assertIn('17 de novembro', p.inner_text('#dia-titulo'))
        self.assertEqual(p.locator('#folha-card').is_visible(), False)

    def test_filtro_por_categoria(self):
        self.preparar(); p = self.page
        self.buscar('fonologia')
        p.wait_for_selector('.resultado')
        self.assertEqual(p.locator('.resultado').count(), 2)
        p.click(f'#busca-categorias [data-cat="{self.cats["Programação"]}"]')
        p.wait_for_function("document.querySelectorAll('.resultado').length === 1")
        self.assertEqual(p.get_attribute('.resultado', 'data-item'), self.item)
        p.click('#busca-categorias [data-cat=""]')
        p.wait_for_function("document.querySelectorAll('.resultado').length === 2")

    def test_html_na_anotacao_aparece_como_texto_e_nao_executa(self):
        self.preparar(); p = self.page
        self.buscar('zebra')
        p.wait_for_selector('.resultado')
        self.assertIn('<img src=x onerror="window.__xss=1">', p.inner_text('.resultado'))
        self.assertEqual(p.inner_text('.resultado mark'), 'zebra')
        self.assertEqual(p.locator('.resultado img').count(), 0)
        p.wait_for_timeout(300)
        self.assertIsNone(p.evaluate('window.__xss'))

    def test_mudanca_nos_dados_atualiza_os_resultados_visiveis(self):
        self.preparar(); p = self.page
        self.buscar('avancado')
        p.wait_for_selector(f'.resultado[data-card="{self.cards["Francês avançado"]}"]')
        p.click(f'.resultado[data-card="{self.cards["Francês avançado"]}"]')
        p.wait_for_selector('#folha-card', state='visible')
        p.fill('#card-titulo', 'Francês avançado B')
        p.press('#card-titulo', 'Enter')
        p.wait_for_function("window.__memdb.cards.some(c => c.title === 'Francês avançado B')")
        p.wait_for_selector('#busca-resultados .resultado:has-text("Francês avançado B")')

    def test_trecho_cortado_mostra_reticencias(self):
        self.preparar(); p = self.page
        self.seed('cards', [{'title': 'Longo', 'list_id': self.db()['lists'][0]['id'], 'notes': 'x ' * 80 + 'girafa' + ' y' * 80}])
        p.reload(); p.wait_for_selector('#app', state='visible')
        p.click('[data-aba="busca"]')
        self.buscar('girafa')
        p.wait_for_selector('.resultado')
        texto = p.inner_text('.resultado-trecho')
        self.assertTrue(texto.startswith('…') and texto.endswith('…'), texto)
        self.assertEqual(p.inner_text('.resultado mark'), 'girafa')
        self.buscar('semantica')
        p.wait_for_selector('.resultado:has-text("Semântica")')
        self.assertNotIn('…', p.inner_text('.resultado-trecho'))
