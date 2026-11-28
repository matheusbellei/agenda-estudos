from test_calendario import CalendarioBase, TER

CATS = [dict(id='m', name='Idiomas', color='#2471A3', icon='language'), dict(id='f', name='Vocabulário', parent_id='m'),
        dict(id='e', name='Exatas', color='#1E8449')]


class TestTagNoBloco(CalendarioBase):
    def novo(self, **seeds):
        self.preparar(**seeds)
        self.page.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        self.page.fill('#bloco-titulo', 'Revisão')

    def test_tag_e_subtag_em_dois_passos(self):
        self.novo(categories=CATS); p = self.page
        self.assertEqual(self.opcoes_da_lista('#bloco-tag'), ['Sem tag', 'Exatas', 'Idiomas', '+ Nova tag…'])
        self.assertTrue(p.is_hidden('#bloco-subtag'))
        self.escolher('#bloco-tag', 'm')
        self.assertTrue(p.is_visible('#bloco-subtag'))
        self.assertEqual(self.opcoes_da_lista('#bloco-subtag'), ['Sem subtag', 'Vocabulário', '+ Nova subtag…'])
        self.escolher('#bloco-subtag', 'f')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertEqual(self.db()['blocks'][0]['category_id'], 'f')

    def test_tag_e_subtag_aparecem_coloridas_como_no_card(self):
        self.novo(categories=CATS); p = self.page
        p.click('#bloco-tag')
        cor = p.eval_on_selector('#bloco-tag-lista [data-cat="m"] .chip-categoria', 'e => getComputedStyle(e).backgroundColor')
        self.assertEqual(cor, 'rgb(36, 113, 163)')
        p.click('#bloco-tag-lista [data-cat="m"]')
        self.assertEqual(p.locator('#bloco-tag .chip-categoria').count(), 1)

    def test_so_a_tag_grava_a_tag(self):
        self.novo(categories=CATS); p = self.page
        self.escolher('#bloco-tag', 'm')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertEqual(self.db()['blocks'][0]['category_id'], 'm')

    def test_criar_tag_pelo_bloco_ja_escolhe(self):
        self.novo(categories=CATS); p = self.page
        self.escolher('#bloco-tag', '__nova__')
        p.wait_for_selector('#tag-janela:not([hidden])')
        p.fill('#tag-nome', 'Leitura'); p.click('#tag-salvar')
        p.wait_for_function("document.querySelector('#tag-janela').hidden")
        nova = [c for c in self.db()['categories'] if c['name'] == 'Leitura'][0]
        self.assertEqual(self.valor('#bloco-tag'), nova['id'])
        self.assertEqual(p.input_value('#bloco-titulo'), 'Revisão')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertEqual(self.db()['blocks'][0]['category_id'], nova['id'])

    def test_cancelar_nova_tag_volta_a_escolha_anterior(self):
        self.novo(categories=CATS); p = self.page
        self.escolher('#bloco-tag', 'e')
        self.escolher('#bloco-tag', '__nova__')
        p.wait_for_selector('#tag-janela:not([hidden])')
        p.click('#tag-cancelar')
        self.assertEqual(self.valor('#bloco-tag'), 'e')
        self.assertTrue(p.is_visible('#folha-bloco'))

    def test_criar_subtag_pelo_bloco_ja_escolhe(self):
        self.novo(categories=CATS); p = self.page
        self.escolher('#bloco-tag', 'e')
        self.assertEqual(self.opcoes_da_lista('#bloco-subtag'), ['Sem subtag', '+ Nova subtag…'])
        self.escolher('#bloco-subtag', '__nova__')
        p.wait_for_selector('#tag-janela:not([hidden])')
        self.assertIn('Nova subtag em Exatas', p.inner_text('#tag-janela h3'))
        p.fill('#tag-nome', 'Cálculo'); p.click('#tag-salvar')
        p.wait_for_function("document.querySelector('#tag-janela').hidden")
        nova = [c for c in self.db()['categories'] if c['name'] == 'Cálculo'][0]
        self.assertEqual((nova['parent_id'], self.valor('#bloco-subtag')), ('e', nova['id']))

    def test_editar_bloco_com_subtag_mostra_os_dois_passos(self):
        self.preparar(categories=CATS, blocks=[dict(id='b1', kind='commitment', title='Aula', category_id='f', date=TER, start_min=480, end_min=540)])
        p = self.page
        p.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca'); self.folha_aberta()
        self.assertEqual((self.valor('#bloco-tag'), self.valor('#bloco-subtag')), ('m', 'f'))

    def test_escolhas_generosas_de_icone_e_cor(self):
        self.login(); self.ir('tags'); p = self.page
        p.click('#tags-nova'); p.wait_for_selector('#tag-janela:not([hidden])')
        self.assertGreaterEqual(p.locator('#tag-janela [data-icone]').count(), 250)
        self.assertGreaterEqual(p.locator('#tag-janela .cor-opcao').count(), 90)
        self.assertGreaterEqual(p.locator('#tag-janela .grupo-icones').count(), 14)

    def test_esc_fecha_so_a_janela_da_tag(self):
        self.novo(categories=CATS); p = self.page
        self.escolher('#bloco-tag', '__nova__')
        p.wait_for_selector('#tag-janela:not([hidden])')
        p.keyboard.press('Escape')
        p.wait_for_function("document.querySelector('#tag-janela').hidden")
        self.assertTrue(p.is_visible('#folha-bloco'))
        self.assertEqual(p.input_value('#bloco-titulo'), 'Revisão')
