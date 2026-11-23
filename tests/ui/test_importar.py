import pathlib
from harness import UITest, ROOT

EXEMPLO = ROOT / 'tests/fixtures/trello-exemplo.json'


class TestImportar(UITest):
    def abrir_ajustes(self):
        self.login()
        self.ir('ajustes')
        self.page.wait_for_selector('#tela-ajustes', state='visible')

    def importar(self, arquivo=EXEMPLO, conteudo=None):
        p = self.page
        if conteudo is not None:
            p.set_input_files('#importar-arquivo', files=[{'name': 'x.json', 'mimeType': 'application/json', 'buffer': conteudo.encode()}])
        else:
            p.set_input_files('#importar-arquivo', str(arquivo))
        p.click('#importar-ir')
        p.wait_for_function("(() => { const t = document.querySelector('#importar-resumo').textContent.trim(); return t !== '' && t !== 'Importando…'; })()")

    def test_importa_exemplo_e_mostra_resumo(self):
        self.abrir_ajustes(); p = self.page
        self.importar()
        resumo = p.inner_text('#importar-resumo')
        self.assertIn('8 cards', resumo)
        self.assertIn('4 itens', resumo)
        self.assertIn('2 categorias', resumo)
        self.assertEqual(p.locator('#importar-resumo li').count(), 1)
        self.assertIn('apostila.pdf', p.inner_text('#importar-resumo li'))
        db = self.db()
        self.assertEqual((len(db['cards']), len(db['items']), len(db['categories']), len(db['lists']), len(db['card_categories'])), (8, 4, 2, 3, 3))
        # as referências foram resolvidas para ids reais
        ids_listas = {l['id'] for l in db['lists']}
        self.assertTrue(all(c['list_id'] in ids_listas for c in db['cards'] if c['list_id']))
        ids_cards = {c['id'] for c in db['cards']}
        self.assertTrue(all(i['card_id'] in ids_cards for i in db['items']))
        self.assertTrue(all(a['card_id'] in ids_cards for a in db['attachments']))
        self.assertEqual(sorted(a['kind'] for a in db['attachments']), ['link', 'pending'])
        self.ir('quadro')
        p.wait_for_selector('.coluna[data-lista]')
        self.assertEqual(p.locator('.coluna[data-lista]').count(), 3)
        self.ir('fixas')
        p.wait_for_selector('#tela-fixas', state='visible')

    def test_primeira_importacao_marca_a_virada_na_segunda_da_semana(self):
        self.abrir_ajustes()
        self.importar()
        self.page.wait_for_function("window.__memdb.settings.length === 1")
        self.assertEqual(self.db()['settings'][0]['last_rollover'], '2026-11-16')

    def test_virada_ja_existente_nao_e_alterada(self):
        self.abrir_ajustes()
        # Uma fixa pendente mantém a virada em 02/11 até alguém responder; "Depois" não grava nada.
        self.seed('settings', [{'last_rollover': '2026-11-02'}])
        self.seed('cards', [{'title': 'Revisão semanal', 'is_fixed': True, 'fixed_days': [1], 'created_at': '2026-08-01T12:00:00Z'}])
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.page.click('#virada-depois')
        self.ir('ajustes')
        self.importar()
        self.assertEqual(self.db()['settings'][0]['last_rollover'], '2026-11-02')

    def test_reimportar_nao_duplica_nem_sobrescreve(self):
        self.abrir_ajustes(); p = self.page
        self.importar()
        card = next(c for c in self.db()['cards'] if c['title'] == 'Ler o guia de exemplo')
        p.evaluate("(id) => { window.__memdb.cards.find((c) => c.id === id).notes = 'Texto que eu editei'; }", card['id'])
        antes = self.db()
        p.set_input_files('#importar-arquivo', str(EXEMPLO))
        p.click('#importar-ir')
        p.wait_for_function("document.querySelector('#importar-resumo').textContent.includes('Nada novo para importar')")
        depois = self.db()
        self.assertEqual({t: len(depois[t]) for t in depois}, {t: len(antes[t]) for t in antes})
        self.assertEqual(next(c for c in depois['cards'] if c['id'] == card['id'])['notes'], 'Texto que eu editei')

    def test_arquivo_invalido_mostra_erro_e_nao_grava(self):
        self.abrir_ajustes(); p = self.page
        self.importar(conteudo='{"nome": "outra coisa"}')
        self.assertEqual(p.inner_text('#importar-resumo'), 'Este arquivo não parece ser um quadro exportado do Trello.')
        self.assertEqual({t: len(v) for t, v in self.db().items() if v}, {})

    def test_arquivo_que_nao_e_json_mostra_erro(self):
        self.abrir_ajustes(); p = self.page
        self.importar(conteudo='isto não é json')
        self.assertIn('não parece', p.inner_text('#importar-resumo'))
        self.assertEqual({t: len(v) for t, v in self.db().items() if v}, {})

    def test_sem_arquivo_escolhido_pede_o_arquivo(self):
        self.abrir_ajustes(); p = self.page
        p.click('#importar-ir')
        self.assertEqual(p.inner_text('#importar-resumo'), 'Escolha o arquivo JSON exportado do Trello.')

    def test_textos_importados_entram_como_texto(self):
        import json
        dados = json.loads(EXEMPLO.read_text())
        dados['cards'][0]['name'] = '<img src=x onerror="window.__xss=1">'
        dados['cards'][1]['attachments'][0]['fileName'] = '<b>arq</b>.pdf'
        self.abrir_ajustes(); p = self.page
        self.importar(conteudo=json.dumps(dados))
        self.assertEqual(p.locator('#importar-resumo b, #importar-resumo img').count(), 0)
        self.assertIn('<b>arq</b>.pdf', p.inner_text('#importar-resumo li'))
        self.assertIsNone(p.evaluate('window.__xss'))

    def test_memoria_trata_conflito_nulo_como_distinto(self):
        self.abrir_ajustes()
        r = self.page.evaluate("""async () => {
          const s = window.__TEST_STORE__; const base = { card_id: 'c', kind: 'link', name: 'n' };
          await s.upsert('attachments', [{ ...base, trello_id: null }, { ...base }, { ...base, trello_id: 't' }, { ...base, trello_id: 't' }], 'owner_id,trello_id');
          return window.__memdb.attachments.length; }""")
        self.assertEqual(r, 3)

    def test_importar_com_listas_ja_marcadas_nao_falha(self):
        self.abrir_ajustes()
        self.seed('lists', [{'id': 'minha1', 'name': 'Fazendo', 'position': 1, 'is_active': True},
                            {'id': 'minha2', 'name': 'Feito', 'position': 2, 'is_done': True}])
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.ir('ajustes')
        self.importar()
        self.assertIn('8 cards', self.page.inner_text('#importar-resumo'))
        listas = self.db()['lists']
        self.assertEqual([l['id'] for l in listas if l['is_active']], ['minha1'])
        self.assertEqual([l['id'] for l in listas if l['is_done']], ['minha2'])
        self.assertEqual(len(self.db()['cards']), 8)
