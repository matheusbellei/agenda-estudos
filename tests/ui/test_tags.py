from harness import UITest


class TagsBase(UITest):
    def abrir_tags(self, **seeds):
        self.login()
        for t, linhas in seeds.items():
            self.seed(t, linhas)
        if seeds:
            self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.ir('tags')

    def nova_tag(self, nome, cor=None, icone=None):
        p = self.page
        p.click('#tags-nova')
        self.salvar_janela(nome, cor, icone)

    def salvar_janela(self, nome=None, cor=None, icone=None):
        p = self.page
        p.wait_for_selector('#tag-janela:not([hidden])')
        if nome is not None: p.fill('#tag-nome', nome)
        if cor: p.click(f'#tag-janela .cor-opcao[data-cor="{cor}"]')
        if icone: p.click(f'#tag-janela [data-icone="{icone}"]')
        p.click('#tag-salvar')

    def janela_fechada(self):
        self.page.wait_for_function("document.querySelector('#tag-janela').hidden")

    def cats(self):
        return {c['name']: c for c in self.db()['categories']}


class TestTelaTags(TagsBase):
    def test_criar_tag_com_cor_e_icone(self):
        self.abrir_tags(); p = self.page
        p.click('#tags-nova'); p.wait_for_selector('#tag-janela:not([hidden])')
        self.assertGreater(p.locator('#tag-janela .cor-opcao').count(), 50)
        self.assertGreater(p.locator('#tag-janela [data-icone]').count(), 60)
        self.salvar_janela('Idiomas', '#2471A3', 'language')
        self.janela_fechada()
        c = self.cats()['Idiomas']
        self.assertEqual((c['color'].upper(), c['icon'], c.get('parent_id')), ('#2471A3', 'language', None))
        self.assertIn('Idiomas', p.inner_text('#tags-lista'))

    def test_criar_subtag_herda_cor_e_aparece_dentro_da_mae(self):
        self.abrir_tags(categories=[{'id': 'm', 'name': 'Idiomas', 'color': '#2471A3', 'icon': 'language'}]); p = self.page
        p.click('[data-tag="m"] .tag-nova-subtag')
        p.wait_for_selector('#tag-janela:not([hidden])')
        self.assertEqual(p.get_attribute('#tag-janela .cor-opcao.ativo', 'data-cor').upper(), '#2471A3')
        self.salvar_janela('Vocabulário')
        self.janela_fechada()
        c = self.cats()['Vocabulário']
        self.assertEqual((c['parent_id'], c['color'].upper()), ('m', '#2471A3'))
        self.assertEqual(p.locator(f'[data-tag="m"] .sub-linha[data-tag="{c["id"]}"]').count(), 1)

    def test_nome_vazio_e_repetido_so_entre_irmas(self):
        self.abrir_tags(categories=[{'id': 'm', 'name': 'Idiomas'}, {'id': 'e', 'name': 'Exatas'},
                                    {'id': 'f', 'name': 'Vocabulário', 'parent_id': 'm'}]); p = self.page
        p.click('#tags-nova'); self.salvar_janela('   ')
        self.assertEqual(p.inner_text('#tag-erro'), 'Dê um nome à tag.')
        p.fill('#tag-nome', 'idiomas'); p.click('#tag-salvar')
        self.assertEqual(p.inner_text('#tag-erro'), 'Já existe uma tag com esse nome.')
        p.click('#tag-cancelar'); self.janela_fechada()
        p.click('[data-tag="m"] .tag-nova-subtag'); self.salvar_janela('vocabulario')
        self.assertEqual(p.inner_text('#tag-erro'), 'Já existe uma subtag com esse nome nesta tag.')
        p.click('#tag-cancelar'); self.janela_fechada()
        p.click('[data-tag="e"] .tag-nova-subtag'); self.salvar_janela('Vocabulário')
        self.janela_fechada()
        self.assertEqual(sum(1 for c in self.db()['categories'] if c['name'] == 'Vocabulário'), 2)

    def test_subtag_nao_pode_ter_subtag(self):
        self.abrir_tags(categories=[{'id': 'm', 'name': 'Idiomas'}, {'id': 'f', 'name': 'Vocabulário', 'parent_id': 'm'}])
        self.assertEqual(self.page.locator('.sub-linha[data-tag="f"] .tag-nova-subtag').count(), 0)

    def test_editar_nome_cor_e_icone(self):
        self.abrir_tags(categories=[{'id': 'm', 'name': 'Idiomas', 'color': '#2471A3', 'icon': 'language'}]); p = self.page
        p.click('[data-tag="m"] .tag-editar')
        self.assertEqual(p.input_value('#tag-nome'), 'Idiomas')
        self.salvar_janela('Línguas', '#1E8449', 'world')
        self.janela_fechada()
        c = self.db()['categories'][0]
        self.assertEqual((c['name'], c['color'].upper(), c['icon']), ('Línguas', '#1E8449', 'world'))

    def test_arquivar_mae_arquiva_filhas_e_vai_para_o_fim(self):
        self.abrir_tags(categories=[{'id': 'a', 'name': 'Alfa'}, {'id': 'm', 'name': 'Beta'}, {'id': 'f', 'name': 'Filha', 'parent_id': 'm'}]); p = self.page
        p.click('[data-tag="a"] > .tag-topo .tag-arquivar')
        p.wait_for_function("window.__memdb.categories.find((c) => c.id === 'a').archived === true")
        self.assertEqual(p.get_attribute('#tags-lista .tag-bloco >> nth=-1', 'data-tag'), 'a')
        self.assertIn('tag-arquivada', p.get_attribute('[data-tag="a"]', 'class'))
        p.click('[data-tag="m"] > .tag-topo .tag-arquivar')
        p.wait_for_function("window.__memdb.categories.filter((c) => c.archived).length === 3")
        p.click('[data-tag="m"] > .tag-topo .tag-desarquivar')
        p.wait_for_function("window.__memdb.categories.find((c) => c.id === 'm').archived === false")
        self.assertTrue(self.cats()['Filha']['archived'])

    def test_excluir_conta_o_que_fica_sem_tag_e_apaga(self):
        self.abrir_tags(categories=[{'id': 'm', 'name': 'Idiomas'}, {'id': 'f', 'name': 'Vocabulário', 'parent_id': 'm'}],
                        cards=[{'id': 'c1', 'title': 'Verbos'}], card_categories=[{'card_id': 'c1', 'category_id': 'f'}],
                        blocks=[{'id': 'b1', 'kind': 'commitment', 'title': 'Aula', 'date': '2026-11-16', 'start_min': 480, 'end_min': 540, 'category_id': 'm'}]); p = self.page
        p.click('[data-tag="m"] > .tag-topo .tag-excluir')
        texto = p.inner_text('#tag-janela')
        for trecho in ['1 subtag', '1 card', '1 compromisso']:
            self.assertIn(trecho, texto)
        p.click('#tag-excluir-confirmar')
        p.wait_for_function("window.__memdb.categories.length === 0")
        self.assertEqual(self.db()['card_categories'], [])

    def test_nome_html_aparece_como_texto(self):
        self.abrir_tags(categories=[{'id': 'm', 'name': '<b>x</b>', 'color': 'url(x)'}]); p = self.page
        self.assertEqual(p.locator('#tags-lista b').count(), 0)
        self.assertIn('<b>x</b>', p.inner_text('#tags-lista'))

    def test_configuracoes_sem_categorias(self):
        self.login(); self.ir('ajustes')
        self.assertEqual(self.page.locator('#aj-categorias').count(), 0)


class TestSubtagsNasTelas(TagsBase):
    SEED = dict(
        categories=[{'id': 'm', 'name': 'Idiomas', 'color': '#2471A3'}, {'id': 'f', 'name': 'Vocabulário', 'parent_id': 'm', 'color': '#2471A3'},
                    {'id': 'e', 'name': 'Exatas', 'color': '#1E8449'}],
        lists=[{'id': 'L1', 'name': 'Em andamento', 'position': 1, 'is_active': True}],
        cards=[{'id': 'c1', 'title': 'Verbos', 'list_id': 'L1', 'position': 1}, {'id': 'c2', 'title': 'Funções', 'list_id': 'L1', 'position': 2}],
        card_categories=[{'card_id': 'c1', 'category_id': 'f'}, {'card_id': 'c2', 'category_id': 'e'}],
    )

    def test_filtro_da_mae_mostra_cards_das_subtags(self):
        self.abrir_tags(**self.SEED); p = self.page
        self.ir('quadro')
        self.assertEqual(p.locator('.filtro-chip.filtro-sub[data-cat="f"]').count(), 1)
        p.click('.filtro-chip[data-cat="m"]')
        self.assertEqual(p.locator('.cartao-card').count(), 1)
        self.assertEqual(p.get_attribute('.cartao-card', 'data-card'), 'c1')

    def test_card_mostra_subtag_com_o_nome_da_mae(self):
        self.abrir_tags(**self.SEED); p = self.page
        self.ir('quadro')
        self.assertIn('Idiomas › Vocabulário', p.inner_text('.cartao-card[data-card="c1"]'))

    def test_seletor_do_bloco_agrupa_subtags(self):
        self.abrir_tags(**self.SEED); p = self.page
        self.ir('semana')
        p.click('.dia[data-data="2026-11-17"] .faixa[data-inicio="480"]')
        p.wait_for_selector('#folha-bloco:not([hidden])')
        self.assertEqual(p.locator('#bloco-categoria optgroup[label="Idiomas"] option').count(), 2)

    def test_mae_arquivada_some_dos_filtros_e_chip_continua_no_card(self):
        self.SEED['categories'][0]['archived'] = True
        self.SEED['categories'][1]['archived'] = True
        try:
            self.abrir_tags(**self.SEED); p = self.page
            self.ir('quadro')
            self.assertEqual(p.locator('.filtro-chip[data-cat="m"], .filtro-chip[data-cat="f"]').count(), 0)
            self.assertIn('Idiomas › Vocabulário', p.inner_text('.cartao-card[data-card="c1"]'))
        finally:
            self.SEED['categories'][0]['archived'] = False
            self.SEED['categories'][1]['archived'] = False
