"""Texto digitado não some ao tocar fora da folha ou apertar Esc; "Salvar" grava o "o que fiz no lugar";
excluir regra com dias já marcados pergunta antes."""
from test_calendario import CalendarioBase, SEG, TER, QUA, SEX

PERGUNTA = 'Descartar o que você escreveu?'


class BlocoBase(CalendarioBase):
    def bloco_nao_feito(self, nota='Velho'):
        self.preparar(blocks=[self.bloco(id='b1', date=TER, start_min=600, end_min=660, title='Aula', status='missed', instead_note=nota)])
        self.page.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca')
        self.folha_aberta()

    def tocar_fora(self, camada='#folha-bloco'):
        self.page.click(f'{camada} .menu-fundo', position={'x': 5, 'y': 5})

    def aberta(self, camada='#folha-bloco'):
        return self.page.evaluate(f"!document.querySelector('{camada}').hidden")


class TestSalvarNoLugar(BlocoBase):
    def test_salvar_grava_o_que_fiz_no_lugar_alterado(self):
        self.bloco_nao_feito(); p = self.page
        p.fill('#bloco-no-lugar', 'Novo texto')
        p.click('#bloco-salvar')
        p.wait_for_function("document.querySelector('#folha-bloco').hidden")
        self.assertEqual(self.db()['blocks'][0]['instead_note'], 'Novo texto')
        self.assertEqual(self.db()['blocks'][0]['status'], 'missed')

    def test_salvar_sem_mudar_nao_toca_no_texto(self):
        self.bloco_nao_feito(); p = self.page
        p.fill('#bloco-titulo', 'Aula 2'); p.click('#bloco-salvar')
        p.wait_for_function("document.querySelector('#folha-bloco').hidden")
        self.assertEqual((self.db()['blocks'][0]['title'], self.db()['blocks'][0]['instead_note']), ('Aula 2', 'Velho'))


class TestDescartarBloco(BlocoBase):
    def test_fundo_com_texto_pergunta_e_continuar_mantem(self):
        self.preparar(blocks=[self.bloco(id='b1', date=TER, start_min=600, end_min=660, title='Aula')]); p = self.page
        p.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca'); self.folha_aberta()
        p.fill('#bloco-titulo', 'Fui estudar outra coisa')
        self.tocar_fora()
        self.assertTrue(self.aberta())
        self.assertIn(PERGUNTA, p.inner_text('#folha-bloco .confirmar-descarte'))
        p.click('#folha-bloco [data-continuar]')
        self.assertTrue(self.aberta())
        self.assertEqual(p.input_value('#bloco-titulo'), 'Fui estudar outra coisa')
        p.keyboard.press('Escape')
        self.assertTrue(self.aberta())
        p.click('#folha-bloco [data-descartar]')
        p.wait_for_function("document.querySelector('#folha-bloco').hidden")
        self.assertEqual(self.db()['blocks'][0]['status'], 'planned')

    def test_titulo_digitado_em_bloco_novo_tambem_pergunta(self):
        self.preparar(); p = self.page
        p.click(f'.dia[data-data="{SEG}"] .faixa[data-inicio="480"]'); self.folha_aberta()
        p.fill('#bloco-titulo', 'Prova')
        p.keyboard.press('Escape')
        self.assertTrue(self.aberta())
        self.assertEqual(p.locator('#folha-bloco .confirmar-descarte').count(), 1)

    def test_sem_texto_fecha_na_hora(self):
        self.preparar(blocks=[self.bloco(id='b1', date=TER, start_min=600, end_min=660, title='Aula')]); p = self.page
        p.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca'); self.folha_aberta()
        self.tocar_fora()
        p.wait_for_function("document.querySelector('#folha-bloco').hidden")
        p.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca'); self.folha_aberta()
        p.keyboard.press('Escape')
        p.wait_for_function("document.querySelector('#folha-bloco').hidden")


class TestEscComCardAberto(CalendarioBase):
    def test_esc_na_folha_do_bloco_nao_fecha_o_card(self):
        self.preparar(lists=[dict(id='L1', name='Backlog', position=1)], cards=[dict(id='c1', title='Curso de Python', list_id='L1', position=1)])
        p = self.page
        self.ir('quadro'); p.click('.cartao-card[data-card="c1"] .cartao-titulo')
        p.wait_for_selector('#folha-card', state='visible')
        p.click('#card-sessao'); self.folha_aberta()
        p.keyboard.press('Escape')
        p.wait_for_function("document.querySelector('#folha-bloco').hidden")
        self.assertTrue(p.is_visible('#folha-card'))


class TestExcluirRegraComHistorico(CalendarioBase):
    def regra(self, status_qua='done', status_seg='missed'):
        self.preparar(commitments=[{'id': 'r1', 'title': 'Trabalho', 'days': [1, 3, 5], 'start_min': 540, 'end_min': 720, 'valid_from': SEG}])
        self.seed('blocks', [
            self.bloco(date=SEG, start_min=540, end_min=720, title='Trabalho', commitment_id='r1', status=status_seg, instead_note='Li um livro'),
            self.bloco(date=QUA, start_min=540, end_min=720, title='Trabalho', commitment_id='r1', status=status_qua)])
        self.page.reload(); self.page.wait_for_selector('#tela-semana .dia', state='visible')

    def test_todos_com_dias_marcados_pergunta_com_a_contagem(self):
        self.regra(); p = self.page
        p.click(f'.dia[data-data="{SEX}"] .bloco .bloco-cabeca'); self.folha_aberta()
        p.click('#bloco-excluir'); p.click('[data-escopo="todos"]')
        p.wait_for_selector('#bloco-escopo:has-text("Isso apaga também 2 dia(s) já marcado(s) como cumprido ou não feito, com o que você escreveu. Excluir mesmo assim?")')
        self.assertEqual(len(self.db()['commitments']), 1)
        self.assertEqual(len(self.db()['blocks']), 2)
        p.click('[data-escopo="confirmar"]')
        p.wait_for_function("window.__memdb.commitments.length === 0")
        self.assertEqual(self.db()['blocks'], [])

    def test_este_e_os_proximos_conta_so_os_do_dia_em_diante(self):
        self.regra(); p = self.page
        p.click(f'.dia[data-data="{QUA}"] .bloco .bloco-cabeca'); self.folha_aberta()
        p.click('#bloco-excluir'); p.click('[data-escopo="proximos"]')
        p.wait_for_selector('#bloco-escopo:has-text("Isso apaga também 1 dia(s) já marcado(s)")')
        self.assertIsNone(self.db()['commitments'][0]['valid_to'])
        p.click('[data-escopo-voltar]')
        self.assertEqual(len(self.db()['blocks']), 2)

    def test_sem_dias_marcados_nao_pergunta(self):
        self.regra(status_qua='planned', status_seg='planned'); p = self.page
        p.click(f'.dia[data-data="{SEX}"] .bloco .bloco-cabeca'); self.folha_aberta()
        p.click('#bloco-excluir'); p.click('[data-escopo="todos"]')
        p.wait_for_function("window.__memdb.commitments.length === 0")


from test_fixas import FixasBase
from test_quadro import QuadroBase


class TestDescartarVirada(FixasBase):
    def fixa(self):
        return dict(id='cL', title='Revisão semanal', is_fixed=True, fixed_days=[1], created_at='2026-11-01T12:00:00Z')

    def test_virada_com_resposta_pergunta_antes_de_fechar(self):
        self.entrar(cards=[self.fixa()]); p = self.page
        self.folha_aberta()
        self.responder('cL', '2026-11-09', 'missed')
        p.fill('#folha-virada .virada-nota', 'Estudei outra matéria')
        p.click('#folha-virada .menu-fundo', position={'x': 5, 'y': 5})
        self.assertFalse(p.evaluate("document.querySelector('#folha-virada').hidden"))
        self.assertIn('Descartar o que você escreveu?', p.inner_text('#folha-virada'))
        p.click('#folha-virada [data-continuar]')
        p.keyboard.press('Escape')
        self.assertFalse(p.evaluate("document.querySelector('#folha-virada').hidden"))
        self.assertEqual(p.input_value('#folha-virada .virada-nota'), 'Estudei outra matéria')
        p.click('#folha-virada [data-descartar]')
        self.folha_fechada()
        self.assertEqual(self.db()['occurrences'], [])

    def test_virada_sem_resposta_fecha_pelo_fundo(self):
        self.entrar(cards=[self.fixa()]); p = self.page
        self.folha_aberta()
        p.click('#folha-virada .menu-fundo', position={'x': 5, 'y': 5})
        self.folha_fechada()

    def test_nova_fixa_com_titulo_pergunta(self):
        self.entrar(rollover='2026-11-16'); p = self.page
        self.ir_fixas(); p.click('#fixas-nova')
        p.wait_for_selector('#folha-fixa:not([hidden])')
        p.fill('#fixa-titulo', 'Exercícios de álgebra')
        p.keyboard.press('Escape')
        self.assertIn('Descartar o que você escreveu?', p.inner_text('#folha-fixa'))
        p.click('#folha-fixa [data-descartar]')
        p.wait_for_function("document.querySelector('#folha-fixa').hidden")
        p.click('#fixas-nova'); p.wait_for_selector('#folha-fixa:not([hidden])')
        p.click('#folha-fixa .menu-fundo', position={'x': 5, 'y': 5})
        p.wait_for_function("document.querySelector('#folha-fixa').hidden")


class TestDescartarNovoCard(QuadroBase):
    def test_esc_no_novo_card_com_texto_pergunta(self):
        self.preparar(); p = self.page
        lista = self.ids['Backlog']
        p.click(f'.coluna[data-lista="{lista}"] .coluna-add')
        campo = f'.coluna[data-lista="{lista}"] .coluna-novo-card input'
        p.fill(campo, 'Leitura do capítulo')
        p.press(campo, 'Escape')
        self.assertIn('Descartar o que você escreveu?', p.inner_text(f'.coluna[data-lista="{lista}"]'))
        p.click(f'.coluna[data-lista="{lista}"] [data-continuar]')
        self.assertEqual(p.input_value(campo), 'Leitura do capítulo')
        p.press(campo, 'Escape')
        p.click(f'.coluna[data-lista="{lista}"] [data-descartar]')
        p.wait_for_function(f"!document.querySelector('.coluna[data-lista=\"{lista}\"] .coluna-novo-card')")
        self.assertEqual(self.db()['cards'], [])


class TestSalvarComNotaEmBlocoPlanejado(BlocoBase):
    def test_nao_feito_e_salvar_grava_a_nota(self):
        self.preparar(blocks=[self.bloco(id='b1', date=TER, start_min=600, end_min=660, title='Aula')]); p = self.page
        p.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca'); self.folha_aberta()
        p.click('#bloco-nao-feito'); p.wait_for_function("window.__memdb.blocks[0].status === 'missed'")
        p.fill('#bloco-no-lugar', 'Estudei outra matéria')
        p.click('#bloco-salvar')
        p.wait_for_function("document.querySelector('#folha-bloco').hidden")
        p.wait_for_function("window.__memdb.blocks[0].instead_note === 'Estudei outra matéria'")
