"""Gravação das anotações com rascunho local e anexos do card (modo simples do editor)."""
import json
from test_quadro import QuadroBase

FALHAR_UPDATE = "window.__memFalhar = 'update';"


class TestGravarERascunho(QuadroBase):
    def preparar_card(self, notas='antigo'):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'notes': notas}])
        self.cid = self.card_id('Curso de Python')

    def abrir(self):
        self.page.click(f'.cartao-card[data-card="{self.cid}"] .cartao-titulo')
        self.page.wait_for_selector('#folha-card', state='visible')

    def rascunho(self, tabela='cards', id=None):
        v = self.page.evaluate(f"localStorage.getItem('rascunho:{tabela}:{id or self.cid}')")
        return json.loads(v) if v else None

    def test_grava_depois_da_pausa_e_apaga_o_rascunho(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.fill('#card-notas textarea', 'novo texto')
        self.assertEqual(self.rascunho()['texto'], 'novo texto')  # rascunho enquanto não grava
        self.assertEqual(self.db()['cards'][0]['notes'], 'antigo')  # ainda não gravou
        p.wait_for_timeout(2000)
        self.assertEqual(self.db()['cards'][0]['notes'], 'novo texto')
        self.assertIsNone(self.rascunho())
        self.assertIn('Salvo', p.inner_text('#card-salvar'))

    def test_falha_mantem_rascunho_e_recupera_depois_de_recarregar(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.evaluate(FALHAR_UPDATE)
        p.fill('#card-notas textarea', 'texto perdido?')
        p.wait_for_selector('#card-erro:has-text("Sem conexão. Tente de novo.")')
        self.assertEqual(self.db()['cards'][0]['notes'], 'antigo')
        self.assertEqual(self.rascunho()['texto'], 'texto perdido?')
        p.evaluate("window.__memFalharSempre = 'update'")  # ainda sem conexão quando a página sai (a saída também tenta gravar)
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        self.abrir()
        self.assertIn('Há um rascunho não salvo', p.inner_text('#card-notas'))
        self.assertEqual(p.input_value('#card-notas textarea'), 'antigo')
        p.click('#card-notas .rascunho [data-acao="recuperar"]')
        self.assertEqual(p.input_value('#card-notas textarea'), 'texto perdido?')
        self.assertEqual(p.locator('#card-notas .rascunho').count(), 0)
        p.click('#card-fechar'); p.wait_for_selector('#folha-card', state='hidden')
        self.assertEqual(self.db()['cards'][0]['notes'], 'texto perdido?')
        self.assertIsNone(self.rascunho())

    def test_descartar_rascunho(self):
        self.preparar_card(); p = self.page
        p.evaluate(f"""localStorage.setItem('rascunho:cards:{self.cid}', JSON.stringify({{ texto: 'velho', base: 'antigo', em: '2026-11-16T10:00:00Z' }}))""")
        self.abrir()
        p.click('#card-notas .rascunho [data-acao="descartar"]')
        self.assertEqual(p.locator('#card-notas .rascunho').count(), 0)
        self.assertIsNone(self.rascunho())
        self.assertEqual(p.input_value('#card-notas textarea'), 'antigo')

    def test_rascunho_igual_ao_gravado_nao_e_oferecido(self):
        self.preparar_card(); p = self.page
        p.evaluate(f"""localStorage.setItem('rascunho:cards:{self.cid}', JSON.stringify({{ texto: 'antigo', base: 'antigo', em: '2026-11-16T10:00:00Z' }}))""")
        self.abrir()
        self.assertEqual(p.locator('#card-notas .rascunho').count(), 0)
        self.assertIsNone(self.rascunho())

    def test_falha_ao_fechar_nao_fecha_e_nao_perde_o_texto(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.fill('#card-notas textarea', 'importante')
        p.evaluate(FALHAR_UPDATE)
        p.click('#card-fechar')
        p.wait_for_selector('#card-erro:has-text("Sem conexão. Tente de novo.")')
        self.assertTrue(p.is_visible('#folha-card'))
        self.assertEqual(p.input_value('#card-notas textarea'), 'importante')
        self.assertEqual(self.db()['cards'][0]['notes'], 'antigo')
        self.assertEqual(self.rascunho()['texto'], 'importante')
        # Arquivar e Esc também não seguem
        p.evaluate(FALHAR_UPDATE); p.click('#card-arquivar')
        p.wait_for_selector('#card-erro:has-text("Sem conexão")')
        self.assertTrue(p.is_visible('#folha-card')); self.assertFalse(self.db()['cards'][0]['archived'])
        p.evaluate(FALHAR_UPDATE); p.keyboard.press('Escape')
        p.wait_for_selector('#card-erro:has-text("Sem conexão")')
        self.assertTrue(p.is_visible('#folha-card'))
        # sem falha, fechar grava e apaga o rascunho
        p.click('#card-fechar'); p.wait_for_selector('#folha-card', state='hidden')
        self.assertEqual(self.db()['cards'][0]['notes'], 'importante')
        self.assertIsNone(self.rascunho())

    def test_falha_impede_abrir_outro_card(self):
        self.preparar(cards=[{'title': 'A', 'lista': 'Backlog', 'position': 1}, {'title': 'B', 'lista': 'Backlog', 'position': 2}])
        p = self.page; self.cid = self.card_id('A'); self.abrir()
        p.click('#card-notas textarea'); p.keyboard.type('nota de A')
        p.evaluate(FALHAR_UPDATE)
        outro = self.card_id('B')
        p.evaluate(f"import('/js/telas/card.js').then(m => m.abrirCard('{outro}'))")
        p.wait_for_selector('#card-erro:has-text("Sem conexão")')
        self.assertEqual(p.input_value('#card-titulo'), 'A')
        self.assertEqual(p.input_value('#card-notas textarea'), 'nota de A')

    def test_so_um_editor_de_item_por_vez_e_trocar_grava(self):
        self.preparar_card(); p = self.page
        self.seed('items', [{'card_id': self.cid, 'title': 'Aula 1', 'position': 1}, {'card_id': self.cid, 'title': 'Aula 2', 'position': 2}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        self.abrir()
        p.click('#card-itens .item >> nth=0 >> [data-acao="expandir"]')
        p.click('#card-itens .item >> nth=0 >> .item-notas textarea'); p.keyboard.type('nota 1')
        p.click('#card-itens .item >> nth=1 >> [data-acao="expandir"]')
        p.wait_for_function("window.__memdb.items.some(i => i.notes === 'nota 1')")
        self.assertEqual(p.locator('.item-notas textarea').count(), 1)
        self.assertEqual(p.locator('.item.aberto').count(), 1)
        self.assertIsNone(self.rascunho('items', self.db()['items'][0]['id']))


    def test_falha_ao_trocar_de_item_mantem_o_item_aberto(self):
        self.preparar_card(); p = self.page
        self.seed('items', [{'card_id': self.cid, 'title': 'Aula 1', 'position': 1}, {'card_id': self.cid, 'title': 'Aula 2', 'position': 2}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        self.abrir()
        p.click('#card-itens .item >> nth=0 >> [data-acao="expandir"]')
        p.fill('#card-itens .item >> nth=0 >> .item-notas textarea', 'nota 1')
        p.evaluate(FALHAR_UPDATE)
        p.click('#card-itens .item >> nth=1 >> [data-acao="expandir"]')
        p.wait_for_selector('#card-erro:has-text("Sem conexão")')
        item1 = self.db()['items'][0]
        self.assertEqual(item1['notes'], '')
        self.assertEqual(p.locator('.item.aberto').count(), 1)
        self.assertEqual(p.get_attribute('#card-itens .item >> nth=0', 'class'), 'item aberto')
        self.assertEqual(p.input_value('#card-itens .item >> nth=0 >> .item-notas textarea'), 'nota 1')
        self.assertEqual(self.rascunho('items', item1['id'])['texto'], 'nota 1')
        # sem falha, a troca grava e abre o outro
        p.click('#card-itens .item >> nth=1 >> [data-acao="expandir"]')
        p.wait_for_function("window.__memdb.items[0].notes === 'nota 1'")
        p.wait_for_selector('#card-itens .item >> nth=1 >> .item-notas textarea')
        self.assertEqual(p.locator('.item.aberto').count(), 1)
        self.assertIsNone(self.rascunho('items', item1['id']))

class TestAnexos(QuadroBase):
    def preparar_card(self, anexos=None):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024}])
        self.cid = self.card_id('Curso de Python')
        if anexos:
            self.seed('attachments', [{'card_id': self.cid, **a} for a in anexos])
            self.page.reload(); self.page.wait_for_selector('#app', state='visible'); self.ir('quadro')
        self.page.click(f'.cartao-card[data-card="{self.cid}"] .cartao-titulo')
        self.page.wait_for_selector('#folha-card', state='visible')

    def arquivo(self, nome, tamanho):
        return {'name': nome, 'mimeType': 'application/pdf', 'buffer': b'x' * tamanho}

    def test_link_so_http_ou_https(self):
        self.preparar_card(); p = self.page
        p.click('#anexo-link-abrir')
        p.fill('#anexo-link-nome', 'Ruim'); p.fill('#anexo-link-url', 'javascript:alert(1)')
        p.click('#anexo-link-salvar')
        p.wait_for_selector('#card-erro:has-text("http")')
        self.assertEqual(self.db()['attachments'], [])
        p.fill('#anexo-link-nome', 'Exemplo'); p.fill('#anexo-link-url', 'https://exemplo.com')
        p.click('#anexo-link-salvar')
        p.wait_for_function('window.__memdb.attachments.length === 1')
        a = self.db()['attachments'][0]
        self.assertEqual((a['kind'], a['name'], a['url'], a['card_id']), ('link', 'Exemplo', 'https://exemplo.com', self.cid))
        self.assertIn('Exemplo', p.inner_text('#card-anexos'))
        self.assertEqual(p.get_attribute('#card-anexos .anexo a', 'href'), 'https://exemplo.com')

    def test_arquivo_acima_de_10_mb_e_recusado(self):
        self.preparar_card(); p = self.page
        p.set_input_files('#anexo-arquivo', self.arquivo('grande.pdf', 11 * 1024 * 1024))
        p.wait_for_selector('#card-erro:has-text("10 MB")')
        self.assertEqual(self.db()['attachments'], [])

    def test_anexar_arquivo_pequeno(self):
        self.preparar_card(); p = self.page
        p.set_input_files('#anexo-arquivo', self.arquivo('Aula de revisão.pdf', 1024))
        p.wait_for_function('window.__memdb.attachments.length === 1')
        a = self.db()['attachments'][0]
        self.assertEqual((a['kind'], a['name'], a['card_id']), ('file', 'Aula de revisão.pdf', self.cid))
        self.assertTrue(a['path'].startswith(f'u1/{self.cid}/'), a['path'])
        self.assertIn(a['path'], p.evaluate('window.__memArquivos'))
        self.assertIn('Aula de revisão.pdf', p.inner_text('#card-anexos'))

    def test_excluir_anexo_apaga_linha_e_arquivo(self):
        self.preparar_card(); p = self.page
        p.set_input_files('#anexo-arquivo', self.arquivo('a.pdf', 10))
        p.wait_for_function('window.__memdb.attachments.length === 1')
        caminho = self.db()['attachments'][0]['path']
        p.click('#card-anexos .anexo [data-acao="excluir"]')
        p.wait_for_function('window.__memdb.attachments.length === 0')
        p.wait_for_function(f"!('{caminho}' in window.__memArquivos)")
        self.assertEqual(p.locator('#card-anexos .anexo').count(), 0)

    def test_pendente_do_trello_e_substituido(self):
        self.preparar_card(anexos=[{'kind': 'pending', 'name': 'slide.pdf', 'trello_id': 't1'}]); p = self.page
        self.assertIn('Arquivo do Trello: anexe de novo', p.inner_text('#card-anexos'))
        p.set_input_files('#card-anexos .anexo input[type="file"]', self.arquivo('slide.pdf', 2048))
        p.wait_for_function("window.__memdb.attachments[0].kind === 'file'")
        a = self.db()['attachments'][0]
        self.assertTrue(a['path'].startswith('u1/'))
        self.assertEqual(len(self.db()['attachments']), 1)
        self.assertNotIn('anexe de novo', p.inner_text('#card-anexos'))
