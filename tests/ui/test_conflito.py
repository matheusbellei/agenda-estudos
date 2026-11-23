"""Anotação alterada em outro aparelho, rascunho que não se perde e recarga ao voltar para a página."""
import json
from test_quadro import QuadroBase

MSG = 'Esta anotação foi alterada em outro aparelho.'


class TestConflito(QuadroBase):
    def preparar_card(self, notas='base'):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'notes': notas}])
        self.cid = self.card_id('Curso de Python')

    def abrir(self):
        self.page.click(f'.cartao-card[data-card="{self.cid}"] .cartao-titulo')
        self.page.wait_for_selector('#folha-card', state='visible')

    def outro_aparelho(self, texto, tabela='cards', id=None):
        self.page.evaluate('([t, id, x]) => { window.__memdb[t].find((l) => l.id === id).notes = x; }', [tabela, id or self.cid, texto])

    def rascunho(self, tabela='cards', id=None, sufixo=''):
        v = self.page.evaluate(f"localStorage.getItem('rascunho:{tabela}:{id or self.cid}{sufixo}')")
        return json.loads(v) if v else None

    def notas_db(self):
        return [c for c in self.db()['cards'] if c['id'] == self.cid][0]['notes']

    def provocar_conflito(self):
        self.preparar_card(); p = self.page; self.abrir()
        self.outro_aparelho('do celular')
        p.fill('#card-notas textarea', 'base + do PC')
        p.wait_for_selector(f'#card-notas .conflito:has-text("{MSG}")')
        return p

    def test_nao_sobrescreve_e_avisa(self):
        p = self.provocar_conflito()
        p.wait_for_timeout(300)
        self.assertEqual(self.notas_db(), 'do celular')
        self.assertEqual(self.rascunho()['texto'], 'base + do PC')
        # fechar não segue enquanto o conflito não for resolvido
        p.click('#card-fechar'); p.wait_for_timeout(300)
        self.assertTrue(p.is_visible('#folha-card'))
        self.assertEqual(self.notas_db(), 'do celular')

    def test_ver_a_versao_mais_recente(self):
        p = self.provocar_conflito()
        p.click('#card-notas .conflito [data-acao="ver-recente"]')
        self.assertEqual(p.input_value('#card-notas textarea'), 'do celular')
        self.assertEqual(p.locator('#card-notas .conflito').count(), 0)
        # o texto do usuário continua disponível pelo rascunho
        self.assertIn('Há um rascunho não salvo', p.inner_text('#card-notas'))
        p.click('#card-fechar'); p.wait_for_selector('#folha-card', state='hidden')
        self.assertEqual(self.notas_db(), 'do celular')
        self.abrir()
        p.click('#card-notas .rascunho [data-acao="recuperar"]')
        self.assertEqual(p.input_value('#card-notas textarea'), 'base + do PC')

    def test_manter_a_minha(self):
        p = self.provocar_conflito()
        p.click('#card-notas .conflito [data-acao="manter"]')
        p.wait_for_function(f"window.__memdb.cards.find(c => c.id === '{self.cid}').notes === 'base + do PC'")
        self.assertEqual(p.locator('#card-notas .conflito').count(), 0)
        p.click('#card-fechar'); p.wait_for_selector('#folha-card', state='hidden')
        self.assertIsNone(self.rascunho())

    def test_sem_mudanca_em_outro_aparelho_grava_normalmente(self):
        self.preparar_card(); p = self.page; self.abrir()
        p.fill('#card-notas textarea', 'base 2')
        p.wait_for_function(f"window.__memdb.cards.find(c => c.id === '{self.cid}').notes === 'base 2'")
        p.fill('#card-notas textarea', 'base 3')  # a base agora é o que acabou de ser gravado
        p.wait_for_function(f"window.__memdb.cards.find(c => c.id === '{self.cid}').notes === 'base 3'")
        self.assertEqual(p.locator('#card-notas .conflito').count(), 0)

    def test_anotacao_de_item_tambem_nao_e_sobrescrita(self):
        self.preparar_card(); p = self.page
        self.seed('items', [{'id': 'it1', 'card_id': self.cid, 'title': 'Exercícios de álgebra', 'notes': 'item base'}])
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('quadro')
        self.abrir()
        p.click('.item[data-item="it1"] [data-acao="expandir"]')
        self.outro_aparelho('item do celular', 'items', 'it1')
        p.fill('.item[data-item="it1"] .item-notas textarea', 'item base + PC')
        p.wait_for_selector(f'.item[data-item="it1"] .conflito:has-text("{MSG}")')
        self.assertEqual(self.db()['items'][0]['notes'], 'item do celular')
        p.click('.item[data-item="it1"] .conflito [data-acao="manter"]')
        p.wait_for_function("window.__memdb.items[0].notes === 'item base + PC'")


class TestRascunhoNaoSePerde(QuadroBase):
    def test_digitar_antes_de_escolher_nao_apaga_o_rascunho(self):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'notes': 'base'}])
        cid = self.card_id('Curso de Python'); p = self.page
        p.evaluate(f"""localStorage.setItem('rascunho:cards:{cid}', JSON.stringify({{ texto: 'RASCUNHO', base: 'base', em: '2026-11-16T10:00:00Z' }}))""")
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-titulo')
        p.wait_for_selector('#card-notas .rascunho')
        p.fill('#card-notas textarea', 'base mais')
        p.wait_for_function("window.__memdb.cards[0].notes === 'base mais'")
        p.wait_for_timeout(200)
        r = p.evaluate(f"localStorage.getItem('rascunho:cards:{cid}')")
        self.assertEqual(json.loads(r)['texto'], 'RASCUNHO')
        p.click('#card-fechar'); p.wait_for_selector('#folha-card', state='hidden')
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-titulo')
        p.wait_for_selector('#card-notas .rascunho')
        p.click('#card-notas .rascunho [data-acao="recuperar"]')
        self.assertEqual(p.input_value('#card-notas textarea'), 'RASCUNHO')


class TestRecargaAoVoltar(QuadroBase):
    def voltar(self):
        self.page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")

    def test_recarrega_ao_ficar_visivel(self):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024}]); p = self.page
        lista = self.db()['lists'][0]['id']
        p.evaluate(f"window.__memdb.cards.push({{ id: 'outro1', owner_id: 'u1', title: 'Criado no celular', list_id: '{lista}', position: 9999, notes: '', archived: false, is_fixed: false, fixed_days: [], created_at: '2026-11-16T10:00:00Z', completed_at: null, trello_id: null }})")
        self.voltar()
        p.wait_for_selector('.cartao-card[data-card="outro1"]')

    def test_recarrega_ao_receber_foco(self):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024}]); p = self.page
        cid = self.card_id('Curso de Python')
        p.evaluate(f"window.__memdb.cards.find(c => c.id === '{cid}').title = 'Renomeado no celular'")
        p.evaluate("window.dispatchEvent(new Event('focus'))")
        p.wait_for_selector(f'.cartao-card[data-card="{cid}"]:has-text("Renomeado no celular")')

    def test_nao_recarrega_com_anotacao_pendente(self):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'notes': 'base'}]); p = self.page
        cid = self.card_id('Curso de Python')
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')
        p.evaluate("window.__memFalharSempre = 'update'")
        p.fill('#card-notas textarea', 'digitando')
        p.wait_for_selector('#card-erro:has-text("Sem conexão")')
        p.evaluate(f"window.__memdb.cards.find(c => c.id === '{cid}').title = 'Renomeado no celular'")
        self.voltar(); p.wait_for_timeout(300)
        self.assertEqual(p.input_value('#card-titulo'), 'Curso de Python')
        self.assertEqual(p.input_value('#card-notas textarea'), 'digitando')
        p.evaluate("window.__memFalharSempre = null")

    def test_recarga_nao_troca_o_texto_do_editor_aberto(self):
        # O editor aberto guarda a base até fechar ou até "Ver a versão mais recente"; a mudança alheia vira conflito.
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'notes': 'base'}]); p = self.page
        cid = self.card_id('Curso de Python')
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')
        p.evaluate(f"window.__memdb.cards.find(c => c.id === '{cid}').notes = 'do celular'")
        self.voltar(); p.wait_for_timeout(300)
        self.assertEqual(p.input_value('#card-notas textarea'), 'base')
        p.fill('#card-notas textarea', 'base + PC')
        p.wait_for_selector('#card-notas .conflito')
        p.click('#card-notas .conflito [data-acao="ver-recente"]')
        self.assertEqual(p.input_value('#card-notas textarea'), 'do celular')

    def test_virada_de_semana_com_o_app_aberto(self):
        self.login(); p = self.page
        self.seed('settings', [{'last_rollover': '2026-11-16'}])
        self.seed('cards', [{'id': 'f1', 'title': 'Revisão semanal', 'is_fixed': True, 'fixed_days': [1], 'created_at': '2026-11-01T12:00:00Z'}])
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.assertTrue(p.is_hidden('#folha-virada'))
        p.evaluate("window.__agora = new Date('2026-11-23T12:00:00-03:00').getTime()")
        self.voltar()
        p.wait_for_selector('#folha-virada', state='visible')
        self.assertEqual(p.inner_text('#folha-virada .virada-quem'), 'Revisão semanal · 16/11')
        p.click('#virada-depois')
        self.ir('semana')
        p.wait_for_selector('.dia[data-data="2026-11-23"]')


class TestRecargaDuranteGravacao(QuadroBase):
    def test_foco_durante_a_gravacao_nao_desfaz_a_anotacao(self):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'notes': 'base'}]); p = self.page
        cid = self.card_id('Curso de Python')
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')
        # A recarga começa ao voltar para a janela e demora; a anotação é gravada enquanto ela está a caminho.
        p.evaluate("window.__memAtraso = { list: 2500 }")
        p.evaluate("window.dispatchEvent(new Event('focus'))")
        p.fill('#card-notas textarea', 'base novo')
        p.wait_for_function(f"window.__memdb.cards.find(c => c.id === '{cid}').notes === 'base novo'")
        p.wait_for_timeout(2500)
        p.evaluate("window.__memAtraso = null")
        nota = lambda: [c for c in self.db()['cards'] if c['id'] == cid][0]['notes']
        self.assertEqual(nota(), 'base novo')
        self.assertEqual(p.input_value('#card-notas textarea'), 'base novo')
        self.assertEqual(p.locator('#card-notas .conflito').count(), 0)
        p.fill('#card-notas textarea', 'base novo 2')
        p.wait_for_function(f"window.__memdb.cards.find(c => c.id === '{cid}').notes === 'base novo 2'")
        self.assertEqual(p.locator('#card-notas .conflito').count(), 0)

    def test_card_criado_durante_a_recarga_nao_some(self):
        self.preparar(); p = self.page
        lista = self.ids['Backlog']
        p.evaluate("window.__memAtraso = { list: 800 }")
        p.evaluate("window.dispatchEvent(new Event('focus'))")
        p.click(f'.coluna[data-lista="{lista}"] .coluna-add')
        p.fill(f'.coluna[data-lista="{lista}"] .coluna-novo-card input', 'Leitura do capítulo')
        p.press(f'.coluna[data-lista="{lista}"] .coluna-novo-card input', 'Enter')
        p.wait_for_selector('.cartao-card:has-text("Leitura do capítulo")')
        p.wait_for_timeout(2000)
        p.evaluate("window.__memAtraso = null")
        self.assertEqual(p.locator('.cartao-card:has-text("Leitura do capítulo")').count(), 1)


class TestRascunhoComConflito(QuadroBase):
    def test_ver_a_versao_recente_com_aviso_aberto_nao_perde_o_texto_digitado(self):
        self.preparar(cards=[{'title': 'Curso de Python', 'lista': 'Backlog', 'position': 1024, 'notes': 'base'}])
        cid = self.card_id('Curso de Python'); p = self.page
        p.evaluate(f"""localStorage.setItem('rascunho:cards:{cid}', JSON.stringify({{ texto: 'RASCUNHO', base: 'base', em: '2026-11-16T10:00:00Z' }}))""")
        p.click(f'.cartao-card[data-card="{cid}"] .cartao-titulo')
        p.wait_for_selector('#card-notas .rascunho')
        p.evaluate(f"window.__memdb.cards.find(c => c.id === '{cid}').notes = 'do celular'")
        p.fill('#card-notas textarea', 'base + PC')
        p.wait_for_selector('#card-notas .conflito')
        p.click('#card-notas .conflito [data-acao="ver-recente"]')
        self.assertEqual(p.input_value('#card-notas textarea'), 'do celular')
        p.click('#card-notas .rascunho [data-acao="recuperar"]')
        self.assertEqual(p.input_value('#card-notas textarea'), 'RASCUNHO')
        # o texto digitado com o aviso aberto é oferecido em seguida
        p.wait_for_selector('#card-notas .rascunho')
        p.click('#card-notas .rascunho [data-acao="recuperar"]')
        self.assertEqual(p.input_value('#card-notas textarea'), 'base + PC')
