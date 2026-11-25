from harness import UITest


class QuadroBase(UITest):
    def preparar(self, listas=True, cards=None, categorias=False):
        """Faz login, semeia dados e recarrega para o estado ler tudo."""
        self.login()
        p = self.page
        if categorias:
            self.seed('categories', [{'name': 'Programação', 'color': '#3E6FB0'}, {'name': 'Idiomas', 'color': '#C68B59'}])
        if listas:
            # semeadas fora de ordem: a tela deve ordenar por position
            self.seed('lists', [{'name': 'Em andamento', 'position': 2048, 'is_active': True}, {'name': 'Backlog', 'position': 1024}])
        ids = {l['name']: l['id'] for l in self.db()['lists']}
        self.ids = ids
        if cards:
            self.seed('cards', [{**c, 'list_id': ids[c.pop('lista')]} if 'lista' in c else c for c in cards])
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.ir('quadro')
        p.wait_for_selector('#tela-quadro', state='visible')

    def titulos(self, lista):
        return self.page.eval_on_selector_all(
            f'.coluna[data-lista="{self.ids[lista]}"] .cartao-card .cartao-titulo', 'els => els.map(e => e.textContent)')

    def card_id(self, titulo):
        return next(c['id'] for c in self.db()['cards'] if c['title'] == titulo)


class TestQuadro(QuadroBase):
    def test_sem_listas_mostra_convite_e_cria_lista(self):
        self.preparar(listas=False)
        p = self.page
        self.assertEqual(p.locator('.coluna[data-lista]').count(), 0)
        self.assertIn('Criar lista', p.inner_text('.convite-quadro'))
        p.fill('#quadro-nova-lista-nome', 'Backlog')
        p.click('#quadro-criar-lista')
        p.wait_for_selector('.coluna')
        self.assertEqual([l['name'] for l in self.db()['lists']], ['Backlog'])
        self.assertEqual(p.locator('.convite-quadro').count(), 0)

    def test_colunas_na_ordem_de_position_com_os_cards_certos(self):
        self.preparar(cards=[
            {'title': 'C2', 'lista': 'Backlog', 'position': 2048}, {'title': 'C1', 'lista': 'Backlog', 'position': 1024},
            {'title': 'C3', 'lista': 'Em andamento', 'position': 1024}])
        p = self.page
        nomes = p.eval_on_selector_all('.coluna .coluna-nome', 'els => els.map(e => e.value)')
        self.assertEqual(nomes, ['Backlog', 'Em andamento'])
        self.assertEqual(self.titulos('Backlog'), ['C1', 'C2'])
        self.assertEqual(self.titulos('Em andamento'), ['C3'])

    def test_mover_para_pelo_menu(self):
        self.preparar(cards=[{'title': 'C1', 'lista': 'Backlog', 'position': 1024}])
        p = self.page; cid = self.card_id('C1')
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-menu')
        p.click('.menu-card [data-acao="mover"]')
        p.click(f'.menu-card .mover-opcao[data-lista="{self.ids["Em andamento"]}"]')
        p.wait_for_function(f"window.__memdb.cards[0].list_id === '{self.ids['Em andamento']}'")
        self.assertEqual(self.titulos('Em andamento'), ['C1'])
        self.assertEqual(self.titulos('Backlog'), [])

    def test_mover_para_lista_de_conclusao_grava_e_zera_completed_at(self):
        self.preparar(cards=[{'title': 'C1', 'lista': 'Backlog', 'position': 1024}])
        p = self.page; cid = self.card_id('C1')
        # marca "Em andamento" como lista de conclusão pelo menu da lista
        p.click(f'.coluna[data-lista="{self.ids["Em andamento"]}"] .coluna-menu')
        p.click('.menu-lista [data-acao="conclusao"]')
        p.wait_for_function("window.__memdb.lists.some(l => l.is_done)")
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-menu')
        p.click('.menu-card [data-acao="mover"]')
        p.click(f'.menu-card .mover-opcao[data-lista="{self.ids["Em andamento"]}"]')
        p.wait_for_function("window.__memdb.cards[0].completed_at")
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-menu')
        p.click('.menu-card [data-acao="mover"]')
        p.click(f'.menu-card .mover-opcao[data-lista="{self.ids["Backlog"]}"]')
        p.wait_for_function("window.__memdb.cards[0].completed_at === null")

    def test_marcar_lista_de_andamento_desmarca_a_anterior(self):
        self.preparar()
        p = self.page
        p.click(f'.coluna[data-lista="{self.ids["Backlog"]}"] .coluna-menu')
        p.click('.menu-lista [data-acao="andamento"]')
        p.wait_for_function(f"window.__memdb.lists.find(l => l.name === 'Backlog').is_active === true")
        ativas = [l['name'] for l in self.db()['lists'] if l['is_active']]
        self.assertEqual(ativas, ['Backlog'])

    def test_arrastar_com_o_mouse_reordena(self):
        self.preparar(cards=[
            {'title': 'C1', 'lista': 'Backlog', 'position': 1024}, {'title': 'C2', 'lista': 'Backlog', 'position': 2048},
            {'title': 'C3', 'lista': 'Backlog', 'position': 3072}])
        p = self.page
        c1 = p.locator(f'.cartao-card[data-card="{self.card_id("C1")}"]').bounding_box()
        c3 = p.locator(f'.cartao-card[data-card="{self.card_id("C3")}"]').bounding_box()
        p.mouse.move(c3['x'] + 40, c3['y'] + c3['height'] / 2)
        p.mouse.down()
        p.mouse.move(c3['x'] + 40, c3['y'] - 20, steps=5)
        p.mouse.move(c1['x'] + 40, c1['y'] + 5, steps=10)
        p.mouse.up()
        p.wait_for_function("window.__memdb.cards.find(c => c.title === 'C3').position < 1024")
        self.assertEqual(self.titulos('Backlog'), ['C3', 'C1', 'C2'])
        self.assertEqual(p.locator('#folha-card:not([hidden])').count(), 0, 'arrastar não abre o card')

    def test_arrastar_para_outra_coluna(self):
        self.preparar(cards=[
            {'title': 'C1', 'lista': 'Backlog', 'position': 1024}, {'title': 'C3', 'lista': 'Em andamento', 'position': 1024}])
        p = self.page
        c1 = p.locator(f'.cartao-card[data-card="{self.card_id("C1")}"]').bounding_box()
        alvo = p.locator(f'.coluna[data-lista="{self.ids["Em andamento"]}"] .cartao-card').bounding_box()
        p.mouse.move(c1['x'] + 40, c1['y'] + c1['height'] / 2); p.mouse.down()
        p.mouse.move(c1['x'] + 60, c1['y'] + 30, steps=4)
        p.mouse.move(alvo['x'] + 40, alvo['y'] + alvo['height'] - 4, steps=10)
        p.mouse.up()
        p.wait_for_function(f"window.__memdb.cards.find(c => c.title === 'C1').list_id === '{self.ids['Em andamento']}'")
        self.assertEqual(self.titulos('Em andamento'), ['C3', 'C1'])

    def test_filtro_por_categoria(self):
        self.preparar(categorias=True, cards=[
            {'title': 'C1', 'lista': 'Backlog', 'position': 1024}, {'title': 'C2', 'lista': 'Backlog', 'position': 2048}])
        cat = next(c['id'] for c in self.db()['categories'] if c['name'] == 'Programação')
        self.seed('card_categories', [{'card_id': self.card_id('C1'), 'category_id': cat}])
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        p.click(f'.filtro-categorias [data-cat="{cat}"]')
        self.assertEqual(self.titulos('Backlog'), ['C1'])
        p.click('.filtro-categorias [data-cat=""]')
        self.assertEqual(self.titulos('Backlog'), ['C1', 'C2'])

    def test_excluir_lista_com_cards_e_recusado_e_vazia_exclui(self):
        self.preparar(cards=[{'title': 'C1', 'lista': 'Backlog', 'position': 1024}])
        p = self.page
        p.click(f'.coluna[data-lista="{self.ids["Backlog"]}"] .coluna-menu')
        p.click('.menu-lista [data-acao="excluir"]')
        self.assertEqual(p.inner_text('#quadro-aviso'), 'Mova ou arquive os cards desta lista antes de excluir.')
        self.assertEqual(len(self.db()['lists']), 2)
        p.click(f'.coluna[data-lista="{self.ids["Em andamento"]}"] .coluna-menu')
        p.click('.menu-lista [data-acao="excluir"]')
        p.wait_for_function("window.__memdb.lists.length === 1")
        self.assertEqual(p.locator('.coluna[data-lista]').count(), 1)

    def test_renomear_e_reordenar_lista(self):
        self.preparar()
        p = self.page
        p.fill(f'.coluna[data-lista="{self.ids["Backlog"]}"] .coluna-nome', 'Ideias')
        p.press(f'.coluna[data-lista="{self.ids["Backlog"]}"] .coluna-nome', 'Enter')
        p.wait_for_function("window.__memdb.lists.some(l => l.name === 'Ideias')")
        p.click(f'.coluna[data-lista="{self.ids["Em andamento"]}"] .coluna-menu')
        p.click('.menu-lista [data-acao="subir"]')
        p.wait_for_function(f"document.querySelector('.coluna .coluna-nome').value === 'Em andamento'")
        pos = {l['name']: l['position'] for l in self.db()['lists']}
        self.assertLess(pos['Em andamento'], pos['Ideias'])

    def test_menu_do_card_sem_abrir_e_com_excluir(self):
        self.preparar(cards=[{'title': 'C1', 'lista': 'Backlog', 'position': 1024}])
        p = self.page; cid = self.card_id('C1')
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-menu')
        self.assertEqual(p.locator('.menu-card [data-acao="abrir"]').count(), 0)
        p.evaluate("window.confirm = () => false")
        p.click('.menu-card [data-acao="excluir"]')
        p.wait_for_timeout(200)
        self.assertEqual(len(self.db()['cards']), 1)
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-menu')
        p.evaluate("window.confirm = () => true")
        p.click('.menu-card [data-acao="excluir"]')
        p.wait_for_function("window.__memdb.cards.length === 0")
        self.assertEqual(self.titulos('Backlog'), [])

    def test_excluir_pelo_menu_apaga_os_rascunhos_do_card(self):
        self.preparar(cards=[{'title': 'C1', 'lista': 'Backlog', 'position': 1024}])
        p = self.page; cid = self.card_id('C1')
        p.evaluate(f"localStorage.setItem('rascunho:cards:{cid}', '{{}}'); localStorage.setItem('rascunho:cards:{cid}:novo', '{{}}')")
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-menu')
        p.evaluate("window.confirm = () => true")
        p.click('.menu-card [data-acao="excluir"]')
        p.wait_for_function("window.__memdb.cards.length === 0")
        p.wait_for_function(f"!Object.keys(localStorage).some(k => k.startsWith('rascunho:cards:{cid}'))")

    def test_arquivar_e_restaurar(self):
        self.preparar(cards=[{'title': 'C1', 'lista': 'Backlog', 'position': 1024}])
        p = self.page; cid = self.card_id('C1')
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-menu')
        p.click('.menu-card [data-acao="arquivar"]')
        p.wait_for_function("window.__memdb.cards[0].archived === true")
        self.assertTrue(self.db()['cards'][0]['archived_at'].startswith('2026-11-16'))
        self.assertEqual(self.titulos('Backlog'), [])
        p.click('#quadro-arquivo-btn')
        p.wait_for_selector('#quadro-arquivo', state='visible')
        texto = p.inner_text('#quadro-arquivo')
        self.assertIn('Itens arquivados', texto)
        self.assertIn('Nos últimos 7 dias', texto)
        self.assertIn('Arquivado', p.inner_text(f'#quadro-arquivo [data-card="{cid}"]'))
        p.click(f'#quadro-arquivo [data-card="{cid}"] [data-acao="restaurar"]')
        p.wait_for_function("window.__memdb.cards[0].archived === false")
        self.assertIsNone(self.db()['cards'][0]['archived_at'])
        self.assertEqual(self.titulos('Backlog'), ['C1'])

    def preparar_arquivo(self):
        self.preparar(categorias=True, cards=[
            {'title': 'Revisão de Função', 'lista': 'Backlog', 'position': 1, 'archived': True, 'archived_at': '2026-11-14T10:00:00Z',
             'completed_at': '2026-04-12T10:00:00Z'},
            {'title': 'Aula 1 Software', 'lista': 'Backlog', 'position': 2, 'archived': True, 'archived_at': '2026-10-01T10:00:00Z'},
            {'title': 'Antigo', 'lista': 'Backlog', 'position': 3, 'archived': True},
        ])
        self.ids_c = {c['title']: c['id'] for c in self.db()['cards']}
        cat = next(c['id'] for c in self.db()['categories'] if c['name'] == 'Programação')
        self.seed('card_categories', [{'card_id': self.ids_c['Revisão de Função'], 'category_id': cat}])
        self.seed('items', [{'card_id': self.ids_c['Revisão de Função'], 'title': 'a', 'position': 1, 'done': True},
                            {'card_id': self.ids_c['Revisão de Função'], 'title': 'b', 'position': 2, 'done': False}])
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        p.click('#quadro-arquivo-btn'); p.wait_for_selector('#quadro-arquivo', state='visible')

    def test_arquivo_em_grupos_com_visual_do_card(self):
        self.preparar_arquivo(); p = self.page
        grupos = p.eval_on_selector_all('#quadro-arquivo .arquivo-grupo h3', 'els => els.map(e => e.textContent)')
        self.assertEqual(grupos, ['Nos últimos 7 dias', 'Há mais de 30 dias', 'Sem data'])
        item = p.inner_text(f'#quadro-arquivo [data-card="{self.ids_c["Revisão de Função"]}"]')
        for t in ['Programação', 'Revisão de Função', 'Concluído em 12 de abr.', '1/2', 'Arquivado', 'Restaurar', 'Excluir']:
            self.assertIn(t, item)
        rid = self.ids_c['Revisão de Função']
        self.assertEqual(p.get_attribute(f'#quadro-arquivo [data-card="{rid}"] [data-acao="restaurar"]', 'aria-label'), 'Restaurar Revisão de Função')
        p.click(f'#quadro-arquivo [data-card="{rid}"] [data-acao="restaurar"]')
        p.wait_for_function(f"!window.__memdb.cards.find(c => c.id === '{rid}').archived")
        self.assertEqual(p.evaluate('document.activeElement.id'), 'arquivo-busca')

    def test_arquivo_busca(self):
        self.preparar_arquivo(); p = self.page
        p.fill('#arquivo-busca', 'FUNCAO')
        self.assertEqual(p.locator('#quadro-arquivo .arquivado').count(), 1)
        p.fill('#arquivo-busca', 'nada disso')
        self.assertIn('Nenhum card arquivado encontrado', p.inner_text('#quadro-arquivo'))

    def test_arquivo_excluir_e_abrir_e_fechar(self):
        self.preparar_arquivo(); p = self.page
        cid = self.ids_c['Antigo']
        p.evaluate("window.confirm = () => true")
        p.click(f'#quadro-arquivo [data-card="{cid}"] [data-acao="excluir"]')
        p.wait_for_function(f"!window.__memdb.cards.some(c => c.id === '{cid}')")
        p.click('#arquivo-fechar')
        p.wait_for_selector('#quadro-arquivo', state='hidden')
        p.click('#quadro-arquivo-btn'); p.wait_for_selector('#quadro-arquivo', state='visible')
        p.keyboard.press('Escape')
        p.wait_for_selector('#quadro-arquivo', state='hidden')
        p.click('#quadro-arquivo-btn')
        p.click(f'#quadro-arquivo [data-card="{self.ids_c["Aula 1 Software"]}"] .arquivado-titulo')
        p.wait_for_selector('#folha-card', state='visible')

    def test_cartao_mostra_categorias_progresso_e_icone_de_anotacao(self):
        self.preparar(categorias=True, cards=[{'title': 'Trilha <b>x</b>', 'lista': 'Backlog', 'position': 1024, 'notes': 'algo'}])
        cid = self.card_id('Trilha <b>x</b>')
        cat = next(c['id'] for c in self.db()['categories'] if c['name'] == 'Programação')
        self.seed('card_categories', [{'card_id': cid, 'category_id': cat}])
        self.seed('items', [{'card_id': cid, 'title': 'a', 'position': 1, 'done': True}, {'card_id': cid, 'title': 'b', 'position': 2}])
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        c = f'.cartao-card[data-card="{cid}"]'
        self.assertEqual(p.inner_text(f'{c} .cartao-titulo'), 'Trilha <b>x</b>')
        self.assertEqual(p.locator(f'{c} .cartao-titulo b').count(), 0)
        self.assertEqual(p.inner_text(f'{c} .chip-categoria'), 'Programação')
        self.assertEqual(p.inner_text(f'{c} .cartao-progresso'), '1 de 2')
        self.assertEqual(p.locator(f'{c} .cartao-nota').count(), 1)
