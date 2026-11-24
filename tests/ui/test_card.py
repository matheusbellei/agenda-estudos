from test_quadro import QuadroBase


class TestCard(QuadroBase):
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

    def add_itens(self, *titulos):
        p = self.page
        for t in titulos:
            n = len(self.db()['items'])
            p.fill('#card-itens .grupo >> nth=0 >> .novo-item input', t)
            p.press('#card-itens .grupo >> nth=0 >> .novo-item input', 'Enter')
            p.wait_for_function(f'window.__memdb.items.length === {n + 1}')

    def test_criar_card_pelo_mais_da_coluna_e_editar_titulo_e_categorias(self):
        self.preparar(categorias=True)
        p = self.page
        p.click(f'.coluna[data-lista="{self.ids["Backlog"]}"] .coluna-add')
        p.fill(f'.coluna[data-lista="{self.ids["Backlog"]}"] .coluna-novo-card input', 'Estudar CSS')
        p.press(f'.coluna[data-lista="{self.ids["Backlog"]}"] .coluna-novo-card input', 'Enter')
        p.wait_for_selector('.cartao-card')
        c = self.db()['cards'][0]
        self.assertEqual((c['title'], c['list_id']), ('Estudar CSS', self.ids['Backlog']))
        self.cid = c['id']
        self.abrir()
        p.fill('#card-titulo', 'Estudar CSS Grid'); p.press('#card-titulo', 'Enter')
        cat = next(x['id'] for x in self.db()['categories'] if x['name'] == 'Programação')
        p.click(f'#card-categorias [data-cat="{cat}"]')
        p.wait_for_function('window.__memdb.card_categories.length === 1')
        self.fechar()
        self.abrir()
        self.assertEqual(p.input_value('#card-titulo'), 'Estudar CSS Grid')
        self.assertEqual(p.get_attribute(f'#card-categorias [data-cat="{cat}"]', 'aria-pressed'), 'true')
        p.click(f'#card-categorias [data-cat="{cat}"]')
        p.wait_for_function('window.__memdb.card_categories.length === 0')

    def test_trocar_lista_no_card(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.select_option('#card-lista', self.ids['Em andamento'])
        p.wait_for_function(f"window.__memdb.cards[0].list_id === '{self.ids['Em andamento']}'")

    def test_itens_progresso_e_done_at(self):
        self.preparar_card(); p = self.page; self.abrir()
        self.add_itens('Aula 1', 'Aula 2', 'Aula 3')
        self.assertEqual(p.inner_text('#card-progresso'), '0 de 3')
        p.click('#card-itens .item >> nth=0 >> .item-feito')
        p.wait_for_function("window.__memdb.items.filter(i => i.done).length === 1")
        self.assertEqual(p.inner_text('#card-progresso'), '1 de 3')
        feito = next(i for i in self.db()['items'] if i['done'])
        self.assertEqual(feito['title'], 'Aula 1'); self.assertTrue(feito['done_at'])
        p.click('#card-itens .item >> nth=0 >> .item-feito')
        p.wait_for_function("window.__memdb.items.every(i => !i.done && i.done_at === null)")
        titulos = p.eval_on_selector_all('#card-itens .item-titulo', 'els => els.map(e => e.value)')
        self.assertEqual(titulos, ['Aula 1', 'Aula 2', 'Aula 3'])

    def test_reordenar_renomear_e_excluir_item(self):
        self.preparar_card(); p = self.page; self.abrir()
        self.add_itens('A', 'B', 'C')
        p.click('#card-itens .item >> nth=2 >> [data-acao="subir"]')
        p.wait_for_function("document.querySelectorAll('#card-itens .item-titulo')[1].value === 'C'")
        pos = {i['title']: i['position'] for i in self.db()['items']}
        self.assertLess(pos['A'], pos['C']); self.assertLess(pos['C'], pos['B'])
        p.fill('#card-itens .item >> nth=0 >> .item-titulo', 'A2'); p.press('#card-itens .item >> nth=0 >> .item-titulo', 'Enter')
        p.wait_for_function("window.__memdb.items.some(i => i.title === 'A2')")
        p.click('#card-itens .item >> nth=1 >> [data-acao="excluir"]')
        p.wait_for_function("window.__memdb.items.length === 2")
        self.assertEqual(sorted(i['title'] for i in self.db()['items']), ['A2', 'B'])

    def test_novo_grupo(self):
        self.preparar_card(); p = self.page; self.abrir()
        self.add_itens('Primeiro')
        p.click('#card-novo-grupo')
        p.fill('#novo-grupo-nome', 'Revisão final'); p.fill('#novo-grupo-item', 'Ler capítulo')
        p.click('#novo-grupo-criar')
        p.wait_for_function("window.__memdb.items.length === 2")
        grupos = {i['title']: i['group_name'] for i in self.db()['items']}
        self.assertEqual(grupos, {'Primeiro': '', 'Ler capítulo': 'Revisão final'})
        self.assertEqual(p.locator('#card-itens .grupo').count(), 2)
        self.assertIn('Revisão final', p.inner_text('#card-itens'))

    def test_anotacoes_gerais_e_do_item_persistem_cada_uma_no_seu_lugar(self):
        self.preparar_card(); p = self.page; self.abrir()
        self.add_itens('Aula 1')
        p.fill('#card-notas textarea', 'notas gerais')
        p.click('#card-itens .item >> nth=0 >> [data-acao="expandir"]')
        p.fill('#card-itens .item >> nth=0 >> .item-notas textarea', 'notas da aula')
        self.fechar()
        d = self.db()
        self.assertEqual(d['cards'][0]['notes'], 'notas gerais')
        self.assertEqual(d['items'][0]['notes'], 'notas da aula')
        self.abrir()
        self.assertEqual(p.input_value('#card-notas textarea'), 'notas gerais')
        p.click('#card-itens .item >> nth=0 >> [data-acao="expandir"]')
        self.assertEqual(p.input_value('#card-itens .item >> nth=0 >> .item-notas textarea'), 'notas da aula')

    def test_digitar_nao_perde_o_foco_nem_regrava_sem_mudar(self):
        self.preparar_card(); p = self.page; self.abrir()
        self.add_itens('Aula 1')
        p.click('#card-itens .item >> nth=0 >> [data-acao="expandir"]')
        p.click('#card-itens .item >> nth=0 >> .item-notas textarea')
        p.keyboard.type('abc def')
        p.wait_for_function("window.__memdb.items[0].notes === 'abc def'")
        p.keyboard.type(' ghi')
        self.assertEqual(p.input_value('#card-itens .item >> nth=0 >> .item-notas textarea'), 'abc def ghi')
        # abrir e fechar sem escrever não grava nada
        self.fechar()
        antes = self.db()['cards'][0]
        p.evaluate("window.__memdb.cards[0].notes = 'externo'")
        self.abrir(); self.fechar()
        self.assertEqual(self.db()['cards'][0]['notes'], 'externo')

    def test_tornar_fixa_e_voltar_ao_quadro(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.click('#card-fixa')
        p.click('#card-fixa-dias [data-dia="1"]')
        p.click('#card-fixa-confirmar')
        p.wait_for_function("window.__memdb.cards[0].is_fixed === true")
        c = self.db()['cards'][0]
        self.assertEqual((c['fixed_days'], c['list_id']), ([1], None))
        self.fechar()
        self.assertEqual(p.locator('.cartao-card').count(), 0)
        # reabrir pelo hook e voltar ao quadro
        p.evaluate(f"import('/js/telas/card.js').then(m => m.abrirCard('{self.cid}'))")
        p.wait_for_selector('#folha-card', state='visible')
        p.select_option('#card-voltar-lista', self.ids['Em andamento'])
        p.click('#card-voltar')
        p.wait_for_function("window.__memdb.cards[0].is_fixed === false")
        c = self.db()['cards'][0]
        self.assertEqual((c['list_id'], c['fixed_days']), (self.ids['Em andamento'], []))

    def test_tornar_fixa_sem_dias(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.click('#card-fixa'); p.click('#card-fixa-confirmar')
        p.wait_for_function("window.__memdb.cards[0].is_fixed === true")
        self.assertEqual(self.db()['cards'][0]['fixed_days'], [])

    def test_excluir_card_preserva_bloco_passado_e_apaga_o_futuro(self):
        self.preparar_card(); p = self.page
        self.seed('blocks', [
            {'date': '2026-11-10', 'start_min': 600, 'end_min': 660, 'kind': 'study', 'title': 'Curso de Python', 'card_id': self.cid, 'status': 'done'},
            {'date': '2026-11-20', 'start_min': 600, 'end_min': 660, 'kind': 'study', 'title': 'Curso de Python', 'card_id': self.cid, 'status': 'planned'}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        self.abrir()
        p.click('#card-excluir')
        p.wait_for_selector('#folha-card', state='hidden')
        p.wait_for_function("window.__memdb.cards.length === 0")
        blocos = self.db()['blocks']
        self.assertEqual([(b['date'], b['card_id'], b['title']) for b in blocos], [('2026-11-10', None, 'Curso de Python')])
        self.assertEqual(p.locator('.cartao-card').count(), 0)

    def test_arquivar_pelo_card_fecha_e_tira_do_quadro(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.click('#card-arquivar')
        p.wait_for_selector('#folha-card', state='hidden')
        self.assertTrue(self.db()['cards'][0]['archived'])
        self.assertEqual(p.locator('.cartao-card').count(), 0)

    def test_abrir_card_com_item_expandido(self):
        self.preparar_card()
        self.seed('items', [{'card_id': self.cid, 'title': f'Aula {n}', 'position': n, 'notes': f'nota {n}'} for n in range(1, 31)])
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible')
        alvo = self.db()['items'][24]['id']
        p.evaluate(f"import('/js/telas/card.js').then(m => m.abrirCard('{self.cid}', {{ itemId: '{alvo}' }}))")
        p.wait_for_selector('#folha-card', state='visible')
        r = p.evaluate(f"""() => {{ const el = document.querySelector('.item[data-item="{alvo}"]');
          const f = document.querySelector('#folha-card').getBoundingClientRect(); const b = el.getBoundingClientRect();
          return {{ aberto: el.classList.contains('aberto'), nota: el.querySelector('.item-notas textarea').value,
                    visivel: b.top >= f.top && b.bottom <= f.bottom + 1 }}; }}""")
        self.assertTrue(r['aberto']); self.assertEqual(r['nota'], 'nota 25'); self.assertTrue(r['visivel'])
        self.assertEqual(p.locator('.item.aberto').count(), 1)

    def test_texto_digitado_nao_vira_html(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.fill('#card-titulo', '<img src=x onerror=window.__x=1>'); p.press('#card-titulo', 'Enter')
        self.add_itens('<i>item</i>')
        self.assertEqual(p.locator('#folha-card i:not(.ti)').count(), 0)  # os ícones do app são <i class="ti">
        self.assertEqual(p.evaluate('window.__x'), None)

    def test_falha_ao_criar_item_ou_grupo_mantem_o_texto(self):
        self.preparar_card(); p = self.page; self.abrir()
        campo = '#card-itens .grupo >> nth=0 >> .novo-item input'
        p.evaluate("window.__memFalhar = 'insert'")
        p.fill(campo, 'Aula 1'); p.press(campo, 'Enter')
        p.wait_for_selector('#card-erro:has-text("Sem conexão")')
        self.assertEqual(p.input_value(campo), 'Aula 1')
        p.press(campo, 'Enter')
        p.wait_for_function('window.__memdb.items.length === 1')
        self.assertEqual(p.input_value(campo), '')
        p.click('#card-novo-grupo')
        p.fill('#novo-grupo-nome', 'Semana'); p.fill('#novo-grupo-item', 'Ler')
        p.evaluate("window.__memFalhar = 'insert'")
        p.click('#novo-grupo-criar')
        p.wait_for_selector('#card-erro:has-text("Sem conexão")')
        self.assertEqual((p.input_value('#novo-grupo-nome'), p.input_value('#novo-grupo-item')), ('Semana', 'Ler'))
        self.assertTrue(p.is_visible('#novo-grupo-form'))
        p.click('#novo-grupo-criar')
        p.wait_for_function('window.__memdb.items.length === 2')
        self.assertEqual(p.input_value('#novo-grupo-nome'), '')

    def test_esc_com_titulo_em_edicao_nao_perde_o_titulo(self):
        self.preparar_card(); p = self.page; self.abrir()
        self.add_itens('Aula 1')
        p.fill('#card-titulo', 'Curso de Python 3')
        p.keyboard.press('Escape')
        p.wait_for_function("window.__memdb.cards[0].title === 'Curso de Python 3'")
        p.fill('#card-itens .item >> nth=0 >> .item-titulo', 'Aula 1 revisada')
        p.keyboard.press('Escape')
        p.wait_for_function("window.__memdb.items[0].title === 'Aula 1 revisada'")
        self.assertTrue(p.is_visible('#folha-card'))
        p.keyboard.press('Escape')
        p.wait_for_selector('#folha-card', state='hidden')

    def test_tornar_fixa_limpa_a_conclusao(self):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'completed_at': '2026-11-10T12:00:00Z'}])
        self.cid = self.card_id('Curso de Python'); p = self.page; self.abrir()
        p.click('#card-fixa'); p.click('#card-fixa-confirmar')
        p.wait_for_function("window.__memdb.cards[0].is_fixed === true")
        self.assertIsNone(self.db()['cards'][0]['completed_at'])


class TestMetaCard(QuadroBase):
    def preparar_com_blocos(self, meta=None):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, **({'meta_min': meta} if meta else {})}])
        self.cid = self.card_id('Curso de Python')
        base = {'kind': 'study', 'title': 'Python', 'card_id': self.cid, 'category_id': None, 'item_id': None, 'commitment_id': None,
                'fixed_date': None, 'instead_note': '', 'lembrete_min': None}
        self.seed('blocks', [
            dict(base, date='2026-11-16', start_min=480, end_min=720, status='done', cancelled=False),
            dict(base, date='2026-11-17', start_min=480, end_min=600, status='planned', cancelled=False),
            dict(base, date='2026-11-18', start_min=480, end_min=600, status='planned', cancelled=True),
        ])
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')

    def abrir(self):
        p = self.page
        p.click(f'.cartao-card[data-card="{self.cid}"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')

    def test_definir_meta_grava_e_mostra_planejadas_e_cumpridas(self):
        self.preparar_com_blocos(); p = self.page
        self.assertEqual(p.locator('.card-meta-chip').count(), 0)
        self.abrir()
        self.assertEqual(p.inner_text('#card-meta-texto'), 'Planejadas 6h · Cumpridas 4h')
        p.fill('#card-meta-h', '10'); p.dispatch_event('#card-meta-h', 'change')
        p.wait_for_function(f"window.__memdb.cards.find(c => c.id === '{self.cid}').meta_min === 600")
        self.assertEqual(p.inner_text('#card-meta-texto'), 'Planejadas 6h · Cumpridas 4h / meta 10h')
        self.assertTrue(p.is_visible('.card-meta-barra'))

    def test_limpar_meta_grava_nulo(self):
        self.preparar_com_blocos(meta=600); p = self.page
        self.assertEqual(p.inner_text(f'.cartao-card[data-card="{self.cid}"] .card-meta-chip'), '4h/10h')
        self.abrir()
        self.assertEqual(p.input_value('#card-meta-h'), '10')
        p.fill('#card-meta-h', ''); p.dispatch_event('#card-meta-h', 'change')
        p.wait_for_function(f"window.__memdb.cards.find(c => c.id === '{self.cid}').meta_min === null")
        self.assertTrue(p.is_hidden('.card-meta-barra'))


class TestMetaCardFuso(TestMetaCard):
    # Domingo 22/11 ao meio-dia em São Paulo já é segunda 23/11 em Tóquio: a semana do fuso dos ajustes manda.
    TODAY = '2026-11-22'

    def test_horas_do_card_usam_o_fuso_dos_ajustes(self):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'meta_min': 600}])
        self.cid = self.card_id('Curso de Python')
        self.seed('settings', [{'fuso': 'Asia/Tokyo'}])
        self.seed('commitments', [{'id': 'F1', 'title': 'Python', 'category_id': None, 'days': [1], 'start_min': 600, 'end_min': 660,
                                   'valid_from': '2026-11-09', 'valid_to': None, 'card_id': self.cid, 'lembrete_min': None}])
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        self.abrir()
        self.assertEqual(p.inner_text('#card-meta-texto'), 'Planejadas 3h · Cumpridas 0 min / meta 10h')

    test_definir_meta_grava_e_mostra_planejadas_e_cumpridas = None
    test_limpar_meta_grava_nulo = None
