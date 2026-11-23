from test_calendario import CalendarioBase, TER

LISTAS = [dict(id='L1', name='Em andamento', position=1, is_active=True), dict(id='L2', name='Ideias', position=2)]


class TestBlocoUnico(CalendarioBase):
    def novo_bloco(self, **seeds):
        self.preparar(**seeds)
        self.page.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()

    def test_sem_escolha_de_tipo_e_titulo_obrigatorio(self):
        self.novo_bloco(); p = self.page
        self.assertEqual(p.locator('[data-tipo]').count(), 0)
        p.click('#bloco-salvar')
        self.assertEqual(p.inner_text('#bloco-erro'), 'Dê um título ao bloco.')

    def test_estudo_sem_card_salva_solto(self):
        self.novo_bloco(settings=[{'auto_card': 'nunca'}], lists=LISTAS); p = self.page
        self.assertTrue(p.is_hidden('#bloco-criar-card'))
        p.fill('#bloco-titulo', 'Vocabulário em Espanhol')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b.get('card_id'), b['title']), ('commitment', None, 'Vocabulário em Espanhol'))
        self.assertEqual(self.db()['cards'], [])

    def test_perguntar_mostra_opcao_desmarcada_e_nao_cria_sem_marcar(self):
        self.novo_bloco(lists=LISTAS); p = self.page
        self.assertFalse(p.is_checked('#bloco-criar-card'))
        p.fill('#bloco-titulo', 'Corrida')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertEqual(self.db()['cards'], [])

    def test_perguntar_cria_card_na_lista_escolhida(self):
        self.novo_bloco(lists=LISTAS, categories=[dict(id='cat1', name='Idiomas')]); p = self.page
        p.fill('#bloco-titulo', 'Vocabulário em Espanhol')
        p.select_option('#bloco-tag', 'cat1')
        p.check('#bloco-criar-card')
        self.assertEqual(p.input_value('#bloco-novo-card-titulo'), 'Vocabulário em Espanhol')
        self.assertEqual(p.input_value('#bloco-novo-card-lista'), 'L1')
        p.fill('#bloco-novo-card-titulo', 'Espanhol: vocabulário')
        p.select_option('#bloco-novo-card-lista', 'L2')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        card = self.db()['cards'][0]
        self.assertEqual((card['title'], card['list_id']), ('Espanhol: vocabulário', 'L2'))
        self.assertEqual(self.db()['card_categories'], [{'card_id': card['id'], 'category_id': 'cat1', **{k: v for k, v in self.db()['card_categories'][0].items() if k not in ('card_id', 'category_id')}}])
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b['card_id'], b['title']), ('study', card['id'], 'Vocabulário em Espanhol'))

    def test_sempre_cria_sem_perguntar_na_lista_dos_ajustes(self):
        self.novo_bloco(lists=LISTAS, settings=[{'auto_card': 'sempre', 'auto_card_list_id': 'L2'}]); p = self.page
        self.assertTrue(p.is_hidden('#bloco-criar-card'))
        p.fill('#bloco-titulo', 'Leitura')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        card = self.db()['cards'][0]
        self.assertEqual((card['title'], card['list_id']), ('Leitura', 'L2'))
        self.assertEqual(self.db()['blocks'][0]['card_id'], card['id'])

    def test_sem_listas_nao_oferece_nem_cria_card(self):
        self.novo_bloco(settings=[{'auto_card': 'sempre'}]); p = self.page
        self.assertTrue(p.is_hidden('#bloco-criar-card'))
        p.fill('#bloco-titulo', 'Leitura'); p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertEqual(self.db()['cards'], [])

    def test_associar_card_existente_continua_e_esconde_criar(self):
        self.novo_bloco(lists=LISTAS, cards=[dict(id='c1', title='Francês avançado', list_id='L1', position=1)]); p = self.page
        p.fill('#bloco-card-busca', 'frances')
        p.click('.card-opcao:has-text("Francês avançado")')
        self.assertTrue(p.is_hidden('#bloco-criar-card'))
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b['card_id'], b['title']), ('study', 'c1', 'Francês avançado'))
        self.assertEqual(len(self.db()['cards']), 1)

    def test_tirar_card_vira_bloco_solto(self):
        self.preparar(lists=LISTAS, cards=[dict(id='c1', title='Francês', list_id='L1', position=1)],
                      blocks=[dict(id='b1', kind='study', title='Francês', card_id='c1', date=TER, start_min=480, end_min=540)])
        p = self.page
        p.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca'); self.folha_aberta()
        p.click('#bloco-card-tirar')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks[0].card_id === null")
        self.assertEqual(self.db()['blocks'][0]['kind'], 'commitment')

    def test_repetir_com_card_grava_card_id_na_regra(self):
        self.novo_bloco(lists=LISTAS, cards=[dict(id='c1', title='Francês', list_id='L1', position=1)]); p = self.page
        p.fill('#bloco-card-busca', 'fran'); p.click('.card-opcao:has-text("Francês")')
        p.check('#bloco-repetir')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.commitments.length === 1")
        self.assertEqual(self.db()['commitments'][0]['card_id'], 'c1')

    def test_configuracoes_estudo_sem_card_grava_settings(self):
        self.preparar(lists=LISTAS); p = self.page
        self.ir('ajustes')
        self.assertEqual(p.input_value('#aj-auto-card-modo'), 'perguntar')
        p.select_option('#aj-auto-card-modo', 'sempre')
        p.select_option('#aj-auto-card-lista', 'L2')
        p.click('#aj-auto-card-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1 && window.__memdb.settings[0].auto_card === 'sempre'")
        self.assertEqual(self.db()['settings'][0]['auto_card_list_id'], 'L2')
