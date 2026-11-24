from harness import UITest

HOJE = '2026-11-16'
BLOCO = {'id': 'b1', 'date': HOJE, 'start_min': 840, 'end_min': 900, 'kind': 'study', 'title': 'Gramática', 'status': 'planned', 'cancelled': False}
FIXA = {'id': 'F1', 'title': 'Conversação', 'category_id': None, 'days': [1], 'start_min': 600, 'end_min': 660,
        'valid_from': '2026-11-01', 'valid_to': None, 'card_id': None, 'lembrete_min': None}


class DiarioBase(UITest):
    def entrar(self, **seeds):
        self.login()
        for t, linhas in seeds.items(): self.seed(t, linhas)
        if seeds: self.page.reload(); self.page.wait_for_selector('#app', state='visible')

    def abrir_bloco(self, seletor):
        self.page.click(f'{seletor} .bloco-cabeca'); self.page.wait_for_selector('#folha-bloco', state='visible')

    def folha_fechada(self):
        self.page.wait_for_function("document.querySelector('#folha-bloco').hidden")


class TestDiarioNoBloco(DiarioBase):
    def test_cumprido_abre_o_diario_e_grava_os_dois(self):
        self.entrar(blocks=[BLOCO]); p = self.page
        self.abrir_bloco('.bloco[data-bloco="b1"]')
        self.assertTrue(p.is_hidden('#bloco-diario-caixa'))
        p.click('#bloco-cumprido')
        p.wait_for_selector('#bloco-diario-caixa', state='visible')
        p.fill('#bloco-diario', '  Li o capítulo 3.  ')
        p.click('#bloco-cumprido-ok'); self.folha_fechada()
        b = next(x for x in self.db()['blocks'] if x['id'] == 'b1')
        self.assertEqual((b['status'], b['diario']), ('done', 'Li o capítulo 3.'))

    def test_sem_texto_grava_vazio(self):
        self.entrar(blocks=[BLOCO]); p = self.page
        self.abrir_bloco('.bloco[data-bloco="b1"]')
        p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok'); self.folha_fechada()
        b = next(x for x in self.db()['blocks'] if x['id'] == 'b1')
        self.assertEqual((b['status'], b.get('diario')), ('done', ''))

    def test_ocorrencia_de_fixa_vira_bloco_com_diario(self):
        self.entrar(commitments=[FIXA]); p = self.page
        self.abrir_bloco('.dia[data-data="2026-11-16"] .bloco')
        p.click('#bloco-cumprido'); p.fill('#bloco-diario', 'Conversa sobre viagens.'); p.click('#bloco-cumprido-ok'); self.folha_fechada()
        b = next(x for x in self.db()['blocks'] if x.get('commitment_id') == 'F1')
        self.assertEqual((b['date'], b['status'], b['diario']), (HOJE, 'done', 'Conversa sobre viagens.'))

    def test_editar_o_diario_de_um_bloco_cumprido(self):
        self.entrar(blocks=[dict(BLOCO, status='done', diario='Primeira versão')]); p = self.page
        self.abrir_bloco('.bloco[data-bloco="b1"]')
        self.assertEqual(p.input_value('#bloco-diario'), 'Primeira versão')
        self.assertTrue(p.is_hidden('#bloco-cumprido-ok'))
        p.fill('#bloco-diario', 'Versão corrigida'); p.click('#bloco-salvar'); self.folha_fechada()
        self.assertEqual(next(x for x in self.db()['blocks'] if x['id'] == 'b1')['diario'], 'Versão corrigida')

    def test_tocar_fora_com_diario_digitado_pergunta(self):
        self.entrar(blocks=[BLOCO]); p = self.page
        self.abrir_bloco('.bloco[data-bloco="b1"]')
        p.click('#bloco-cumprido'); p.fill('#bloco-diario', 'algo')
        p.click('#folha-bloco .menu-fundo', position={'x': 5, 'y': 5})
        self.assertEqual(p.locator('#folha-bloco .confirmar-descarte').count(), 1)


CATS = [{'id': 'I', 'name': 'Idiomas', 'color': '#2471A3', 'parent_id': None}, {'id': 'E', 'name': 'Espanhol', 'color': '#2471A3', 'parent_id': 'I'},
        {'id': 'M', 'name': 'Matemática', 'color': '#C68B59', 'parent_id': None}]
LISTAS = [{'id': 'L1', 'name': 'Em andamento', 'position': 1, 'is_active': True}]
CARDS = [{'id': 'K', 'title': 'Curso de Espanhol', 'list_id': 'L1', 'position': 1}]


def registro(id, date, ini, cat, texto, card=None):
    return {'id': id, 'date': date, 'start_min': ini, 'end_min': ini + 60, 'kind': 'study' if card else 'commitment', 'title': id,
            'status': 'done', 'cancelled': False, 'category_id': cat, 'card_id': card, 'diario': texto}


class TestLerDiario(DiarioBase):
    def semear(self, extra=()):
        self.entrar(categories=CATS, lists=LISTAS, cards=CARDS, blocks=[
            registro('d1', '2026-11-10', 480, 'E', 'Verbos no pretérito.', 'K'),
            registro('d2', '2026-11-12', 600, 'M', 'Equações de segundo grau.'),
            registro('d3', '2026-11-12', 900, 'I', 'Leitura em voz alta.'),
            *extra])

    def test_card_mostra_so_os_registros_dele_e_abre_o_bloco(self):
        self.semear(); p = self.page
        self.ir('quadro'); p.click('.cartao-card[data-card="K"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')
        itens = p.locator('#card-diario .diario-item')
        self.assertEqual(itens.count(), 1)
        self.assertIn('Verbos no pretérito.', itens.first.inner_text())
        itens.first.click()
        p.wait_for_selector('#folha-bloco', state='visible')
        self.assertEqual(p.input_value('#bloco-diario'), 'Verbos no pretérito.')

    def test_tela_agrupa_por_dia_filtra_por_tag_e_busca(self):
        self.semear(); p = self.page
        self.ir('diario')
        self.assertEqual(p.inner_text('#cabecalho-titulo'), 'Diário')
        self.assertEqual(p.locator('#diario-lista .diario-dia').count(), 2)
        self.assertEqual(p.locator('#diario-lista .diario-item').count(), 3)
        p.select_option('#diario-tag', 'I')
        self.assertEqual(p.locator('#diario-lista .diario-item').count(), 2)
        p.select_option('#diario-tag', '')
        p.fill('#diario-busca', 'equacoes')
        p.wait_for_function("document.querySelectorAll('#diario-lista .diario-item').length === 1")
        p.fill('#diario-busca', 'nada disso')
        p.wait_for_selector('#diario-lista .vazio')

    def test_tela_pagina_de_50_em_50_dias(self):
        dias = [registro(f'x{n}', f'2026-0{1 + n // 28}-{1 + n % 28:02d}', 480, 'M', f'Dia {n}') for n in range(60)]
        self.semear(extra=dias); p = self.page
        self.ir('diario')
        self.assertEqual(p.locator('#diario-lista .diario-dia').count(), 50)
        p.click('#diario-mais')
        self.assertEqual(p.locator('#diario-lista .diario-dia').count(), 62)
        self.assertTrue(p.is_hidden('#diario-mais'))

    def test_busca_geral_acha_o_diario(self):
        self.semear(); p = self.page
        self.ir('busca')
        p.fill('#busca-termo', 'equacoes')
        p.wait_for_selector('.resultado[data-campo="diario"]')
        self.assertIn('Diário · ', p.inner_text('.resultado[data-campo="diario"] .resultado-origem'))
