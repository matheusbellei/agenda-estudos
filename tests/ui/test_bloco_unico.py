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

    def test_ajuste_antigo_nunca_ainda_pergunta(self):
        # A escolha "Bloco sem card" saiu das Configurações: o bloco sempre pergunta.
        self.novo_bloco(settings=[{'auto_card': 'nunca'}], lists=LISTAS); p = self.page
        self.assertTrue(p.is_visible('#bloco-criar-card'))
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

    def test_ajuste_antigo_sempre_nao_cria_sozinho(self):
        self.novo_bloco(lists=LISTAS, settings=[{'auto_card': 'sempre', 'auto_card_list_id': 'L2'}]); p = self.page
        self.assertTrue(p.is_visible('#bloco-criar-card'))
        p.check('#bloco-criar-card')
        self.assertEqual(p.input_value('#bloco-novo-card-lista'), 'L1')  # a lista ativa
        p.uncheck('#bloco-criar-card')
        p.fill('#bloco-titulo', 'Leitura')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertEqual(self.db()['cards'], [])

    def test_sem_listas_nao_oferece_nem_cria_card(self):
        self.novo_bloco(); p = self.page
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

    def test_configuracoes_sem_a_secao_bloco_sem_card(self):
        self.preparar(lists=LISTAS); p = self.page
        self.ir('ajustes')
        self.assertEqual(p.locator('#aj-auto-card-modo').count(), 0)
        self.assertNotIn('Bloco sem card', p.inner_text('#tela-ajustes'))


class TestRepetirDepoisDeCriado(CalendarioBase):
    def abrir(self, bloco_id='b1', **extra):
        self.preparar(blocks=[self.bloco(id=bloco_id, date=TER, start_min=480, end_min=540, title='Pular corda', **extra)])
        self.page.click(f'[data-bloco="{bloco_id}"]')
        self.folha_aberta()

    def test_compromisso_ja_salvo_pode_repetir_toda_semana(self):
        self.abrir(); p = self.page
        self.assertTrue(p.is_visible('#bloco-repetir'))
        p.check('#bloco-repetir')
        p.click('.dia-rep[data-dia="4"]')  # terça (do bloco) e quinta
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.commitments.length === 1")
        r = self.db()['commitments'][0]
        self.assertEqual((r['title'], sorted(r['days']), r['valid_from'], r['start_min'], r['end_min']), ('Pular corda', [2, 4], TER, 480, 540))
        # O bloco que já existia vira o dia da regra: nada de duplicar a terça.
        self.assertEqual([(b['id'], b['commitment_id']) for b in self.db()['blocks']], [('b1', r['id'])])
        self.assertEqual(self.page.locator(f'.dia[data-data="{TER}"] .bloco').count(), 1)

    def test_bloco_salvo_mantem_o_estado_ao_repetir(self):
        self.abrir(status='done'); p = self.page
        p.check('#bloco-repetir')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.commitments.length === 1")
        self.assertEqual(self.db()['blocks'][0]['status'], 'done')

    def test_abrir_compromisso_existente_nao_abre_o_teclado(self):
        self.abrir(); p = self.page
        self.assertNotEqual(p.evaluate('document.activeElement && document.activeElement.id'), 'bloco-titulo')

    def test_bloco_novo_ainda_foca_o_titulo(self):
        self.preparar(); p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        self.assertEqual(p.evaluate('document.activeElement.id'), 'bloco-titulo')


class TestFimNaMeiaNoite(CalendarioBase):
    def test_fim_00_00_vale_ate_a_meia_noite(self):
        self.preparar(); p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        p.fill('#bloco-titulo', 'Jogar')
        p.fill('#bloco-inicio', '22:00'); p.fill('#bloco-fim', '00:00')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['start_min'], b['end_min']), (1320, 1440))

    def test_inicio_e_fim_00_00_e_o_dia_inteiro(self):
        self.preparar(); p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        p.fill('#bloco-titulo', 'Folga')
        p.fill('#bloco-inicio', '00:00'); p.fill('#bloco-fim', '00:00')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['start_min'], b['end_min']), (0, 1440))
