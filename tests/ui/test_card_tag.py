import json
from test_quadro import QuadroBase


class CardTagBase(QuadroBase):
    def preparar_card(self, **kw):
        self.preparar(categorias=True, cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024}], **kw)
        self.cid = self.card_id('Curso de Python')

    def abrir(self):
        p = self.page
        p.click(f'.cartao-card[data-card="{self.cid}"] .cartao-titulo')
        p.wait_for_selector('#folha-card', state='visible')

    def fechar(self):
        self.page.click('#card-fechar')
        self.page.wait_for_selector('#folha-card', state='hidden')

    def preparar_tags(self):
        self.preparar_card()
        self.seed('categories', [{'name': 'Espiritual', 'color': '#2F6B4F'}, {'name': 'Lazer', 'color': '#7A5C9E'}])
        cats = {c['name']: c['id'] for c in self.db()['categories']}
        self.seed('categories', [
            {'name': 'Orações', 'color': '#2F6B4F', 'parent_id': cats['Espiritual']},
            {'name': 'Estudo pessoal', 'color': '#2F6B4F', 'parent_id': cats['Espiritual']},
            {'name': 'Inglês', 'color': '#C68B59', 'parent_id': cats['Idiomas']},
            {'name': 'Velha', 'color': '#C68B59', 'parent_id': cats['Idiomas'], 'archived': True},
        ])
        self.cat = {c['name']: c['id'] for c in self.db()['categories']}
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')

    def do_card(self):
        return sorted(cc['category_id'] for cc in self.db()['card_categories'] if cc['card_id'] == self.cid)

    def esperar(self, ids):
        alvo = sorted(ids)
        self.page.wait_for_function(
            f"JSON.stringify(window.__memdb.card_categories.filter(c => c.card_id === '{self.cid}').map(c => c.category_id).sort()) === '{json.dumps(alvo).replace(' ', '')}'")

    def escolher_tag(self, nome):
        p = self.page
        p.click('#card-tag')
        p.click(f'#card-tag-lista [data-cat="{self.cat[nome] if nome else ""}"]')

    def visivel(self, sel):
        return self.page.is_visible(sel)


class TestCardTag(CardTagBase):
    def test_tag_e_subtag_em_listas(self):
        self.preparar_tags(); p = self.page; self.abrir()
        self.assertFalse(self.visivel('#card-subtags'))
        self.assertIn('Escolher tag', p.inner_text('#card-tag'))
        self.escolher_tag('Espiritual')
        self.esperar([self.cat['Espiritual']])
        self.assertFalse(self.visivel('#card-tag-lista'))
        self.assertIn('Espiritual', p.inner_text('#card-tag'))
        self.assertIn('Nenhuma', p.inner_text('#card-subtags'))
        p.click('#card-subtags')
        # "Nenhuma" e as duas subtags da tag escolhida
        self.assertEqual(p.locator('#card-subtags-lista [role="option"]').count(), 3)
        self.assertIsNone(p.get_attribute('#card-subtags-lista', 'aria-multiselectable'))
        p.click(f'#card-subtags-lista [data-cat="{self.cat["Orações"]}"]')
        self.esperar([self.cat['Orações']])
        self.assertFalse(self.visivel('#card-subtags-lista'))
        self.assertIn('Orações', p.inner_text('#card-subtags'))
        p.click('#card-subtags'); p.click(f'#card-subtags-lista [data-cat="{self.cat["Estudo pessoal"]}"]')
        self.esperar([self.cat['Estudo pessoal']])
        p.click('#card-subtags'); p.click('#card-subtags-lista [data-cat=""]')
        self.esperar([self.cat['Espiritual']])
        self.escolher_tag(None)
        self.esperar([])
        self.assertFalse(self.visivel('#card-subtags'))

    def test_card_antigo_com_duas_subtags_mostra_a_primeira(self):
        self.preparar_tags(); p = self.page
        self.seed('card_categories', [{'card_id': self.cid, 'category_id': self.cat['Orações']},
                                      {'card_id': self.cid, 'category_id': self.cat['Estudo pessoal']}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro'); self.abrir()
        self.assertIn('Estudo pessoal', p.inner_text('#card-subtags'))
        self.assertIn('Espiritual › Orações', p.inner_text('#card-tag-outras'))
        p.click('#card-subtags'); p.click(f'#card-subtags-lista [data-cat="{self.cat["Orações"]}"]')
        self.esperar([self.cat['Orações']])
        self.assertFalse(self.visivel('#card-tag-outras'))

    def test_trocar_tag_tira_subtags(self):
        self.preparar_tags(); p = self.page; self.abrir()
        self.escolher_tag('Espiritual')
        p.click('#card-subtags'); p.click(f'#card-subtags-lista [data-cat="{self.cat["Orações"]}"]')
        self.esperar([self.cat['Orações']])
        self.escolher_tag('Idiomas')
        self.esperar([self.cat['Idiomas']])

    def test_tag_sem_subtags_nao_mostra_campo(self):
        self.preparar_tags(); self.abrir()
        self.escolher_tag('Lazer')
        self.esperar([self.cat['Lazer']])
        self.assertFalse(self.visivel('#card-subtags'))

    def test_subtag_arquivada_so_aparece_se_o_card_usa(self):
        self.preparar_tags(); p = self.page; self.abrir()
        self.escolher_tag('Idiomas'); self.esperar([self.cat['Idiomas']])
        p.click('#card-subtags')
        self.assertEqual(p.locator(f'#card-subtags-lista [data-cat="{self.cat["Velha"]}"]').count(), 0)
        self.fechar()
        self.page.evaluate(f"window.__memdb.card_categories = window.__memdb.card_categories.filter(c => c.category_id !== '{self.cat['Idiomas']}')")
        self.seed('card_categories', [{'card_id': self.cid, 'category_id': self.cat['Velha']}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro'); self.abrir()
        self.assertIn('Velha', p.inner_text('#card-subtags'))
        p.click('#card-subtags')
        self.assertEqual(p.get_attribute(f'#card-subtags-lista [data-cat="{self.cat["Velha"]}"]', 'aria-selected'), 'true')

    def test_card_antigo_com_duas_familias(self):
        self.preparar_tags(); p = self.page
        self.seed('card_categories', [{'card_id': self.cid, 'category_id': self.cat['Inglês']},
                                      {'card_id': self.cid, 'category_id': self.cat['Orações']}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro'); self.abrir()
        self.assertIn('Espiritual', p.inner_text('#card-tag'))
        self.assertIn('Também neste card', p.inner_text('#card-tag-outras'))
        self.assertIn('Idiomas › Inglês', p.inner_text('#card-tag-outras'))
        p.click('#card-subtags'); p.click(f'#card-subtags-lista [data-cat="{self.cat["Estudo pessoal"]}"]')
        self.esperar([self.cat['Inglês'], self.cat['Estudo pessoal']])
        self.escolher_tag('Lazer')
        self.esperar([self.cat['Lazer']])
        self.assertFalse(self.visivel('#card-tag-outras'))

    def test_esc_fecha_so_a_lista_e_teclado(self):
        self.preparar_tags(); p = self.page; self.abrir()
        p.click('#card-tag')
        self.assertEqual(p.get_attribute('#card-tag', 'aria-expanded'), 'true')
        p.keyboard.press('Escape')
        self.assertFalse(self.visivel('#card-tag-lista'))
        self.assertTrue(self.visivel('#folha-card'))
        self.assertEqual(p.evaluate('document.activeElement.id'), 'card-tag')
        # teclado: abre, desce até Espiritual (Sem tag, Espiritual, ...) e escolhe com Enter
        p.keyboard.press('Enter')
        p.keyboard.press('ArrowDown'); p.keyboard.press('Enter')
        self.esperar([self.cat['Espiritual']])
        p.keyboard.press('Escape')
        p.wait_for_selector('#folha-card', state='hidden')

    def test_abrir_uma_lista_fecha_a_outra(self):
        self.preparar_tags(); p = self.page; self.abrir()
        self.escolher_tag('Espiritual'); self.esperar([self.cat['Espiritual']])
        p.click('#card-subtags'); self.assertTrue(self.visivel('#card-subtags-lista'))
        p.click('#card-tag')
        self.assertTrue(self.visivel('#card-tag-lista'))
        self.assertFalse(self.visivel('#card-subtags-lista'))

    def test_toques_rapidos_nao_deixam_sem_categoria(self):
        self.preparar_tags(); p = self.page
        self.seed('card_categories', [{'card_id': self.cid, 'category_id': self.cat['Orações']}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro'); self.abrir()
        p.evaluate("window.__memAtraso = { removeWhere: 300, insert: 300 }")
        p.click('#card-subtags'); p.click(f'#card-subtags-lista [data-cat="{self.cat["Estudo pessoal"]}"]')
        p.click('#card-subtags'); p.click('#card-subtags-lista [data-cat=""]')
        p.wait_for_timeout(200); p.wait_for_function('!window.__memGravando')
        p.wait_for_timeout(800); p.wait_for_function('!window.__memGravando')
        self.assertEqual(self.do_card(), [self.cat['Espiritual']])

    def test_mesma_tag_em_card_antigo_nao_apaga_nada(self):
        self.preparar_tags(); p = self.page
        self.seed('card_categories', [{'card_id': self.cid, 'category_id': self.cat['Inglês']},
                                      {'card_id': self.cid, 'category_id': self.cat['Orações']}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro'); self.abrir()
        self.escolher_tag('Espiritual')
        p.wait_for_timeout(300)
        self.assertEqual(self.do_card(), sorted([self.cat['Inglês'], self.cat['Orações']]))

    def test_tab_fecha_a_lista(self):
        self.preparar_tags(); p = self.page; self.abrir()
        p.click('#card-tag')
        self.assertTrue(self.visivel('#card-tag-lista'))
        p.keyboard.press('Tab')
        self.assertFalse(self.visivel('#card-tag-lista'))
        self.assertEqual(p.get_attribute('#card-tag', 'aria-expanded'), 'false')

    def test_espaco_escolhe_e_nao_reabre(self):
        self.preparar_tags(); p = self.page; self.abrir()
        p.focus('#card-tag'); p.keyboard.press('Enter')
        p.keyboard.press('ArrowDown'); p.keyboard.press(' ')
        self.esperar([self.cat['Espiritual']])
        p.wait_for_timeout(100)
        self.assertFalse(self.visivel('#card-tag-lista'))
