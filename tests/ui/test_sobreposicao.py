from test_planejar import PlanejarBase
from test_calendario import SEG, TER

EXP = dict(id='cE', title='Expediente', days=[1, 2, 3, 4, 5], start_min=462, end_min=1050, valid_from=SEG)
V_EXP = f'v:cE:{SEG}'


class TestSobreposicao(PlanejarBase):
    def caixa(self, sel):
        return self.page.locator(sel).bounding_box()

    def z(self, sel):
        return int(self.page.eval_on_selector(sel, 'e => getComputedStyle(e).zIndex') or 0)

    def bloco_sel(self, ident, dia=SEG):
        return f'.dia[data-data="{dia}"] .bloco[data-bloco="{ident}"]'

    def test_semana_estudo_dentro_do_expediente_fica_por_cima_largura_inteira(self):
        self.semear(blocos=[dict(id='bE', kind='commitment', title='Inglês', date=SEG, start_min=720, end_min=780)], commitments=[EXP])
        exp, est = self.caixa(self.bloco_sel(V_EXP)), self.caixa(self.bloco_sel('bE'))
        self.assertAlmostEqual(est['x'], exp['x'], delta=2)
        self.assertAlmostEqual(est['width'], exp['width'], delta=2)
        self.assertGreater(self.z(self.bloco_sel('bE')), self.z(self.bloco_sel(V_EXP)))
        self.assertIn('bloco-fundo', self.page.get_attribute(self.bloco_sel(V_EXP), 'class'))
        self.assertNotIn('bloco-fundo', self.page.get_attribute(self.bloco_sel('bE'), 'class'))

    def test_semana_mesmo_inicio_lado_a_lado_e_titulo_do_expediente_abre(self):
        self.semear(blocos=[dict(id='bE', kind='commitment', title='Inglês', date=SEG, start_min=462, end_min=540)], commitments=[EXP])
        p = self.page
        exp, est = self.caixa(self.bloco_sel(V_EXP)), self.caixa(self.bloco_sel('bE'))
        coluna = self.caixa(f'.dia[data-data="{SEG}"] .dia-blocos')
        self.assertLess(exp['width'], coluna['width'] * 0.55)
        self.assertLess(est['width'], coluna['width'] * 0.55)
        self.assertNotAlmostEqual(exp['x'], est['x'], delta=10)
        self.assertTrue(p.is_visible(self.bloco_sel(V_EXP) + ' .bloco-cabeca'))
        p.click(self.bloco_sel(V_EXP) + ' .bloco-cabeca')
        self.folha_aberta()
        self.assertEqual(p.input_value('#bloco-titulo'), 'Expediente')

    def test_hoje_cascata_recuada(self):
        self.semear(blocos=[dict(id='bA', kind='commitment', title='A', date=SEG, start_min=540, end_min=660),
                            dict(id='bB', kind='commitment', title='B', date=SEG, start_min=600, end_min=720)])
        self.ir_para_hoje()
        a, b = self.caixa('.linha-do-tempo .bloco[data-bloco="bA"]'), self.caixa('.linha-do-tempo .bloco[data-bloco="bB"]')
        self.assertAlmostEqual(b['x'] - a['x'], 22, delta=2)
        self.assertGreater(self.z('.linha-do-tempo .bloco[data-bloco="bB"]'), self.z('.linha-do-tempo .bloco[data-bloco="bA"]'))

    def ponto_no_corpo(self, sel_bloco, sel_hora):
        b, h = self.caixa(sel_bloco), self.caixa(sel_hora)
        return b['x'] + b['width'] / 2, h['y'] + 3

    def test_tocar_corpo_do_expediente_no_hoje_cria_novo_as_10(self):
        self.semear(commitments=[EXP])
        p = self.page
        self.ir_para_hoje()
        x, y = self.ponto_no_corpo(f'.linha-do-tempo .bloco[data-bloco="{V_EXP}"]', '.fatia[data-inicio="600"]')
        p.mouse.click(x, y)
        self.folha_aberta()
        self.assertEqual(p.input_value('#bloco-titulo'), '')
        self.assertEqual((p.input_value('#bloco-inicio'), p.input_value('#bloco-fim')), ('10:00', '11:00'))
        self.assertEqual(self.db()['blocks'], [])

    def test_tocar_cabeca_do_expediente_no_hoje_abre_o_expediente(self):
        self.semear(commitments=[EXP])
        p = self.page
        self.ir_para_hoje()
        p.click(f'.linha-do-tempo .bloco[data-bloco="{V_EXP}"] .bloco-cabeca')
        self.folha_aberta()
        self.assertEqual(p.input_value('#bloco-titulo'), 'Expediente')

    def test_fila_escolhida_toque_no_corpo_na_semana_agenda_ali(self):
        self.semear(commitments=[EXP])
        p = self.page
        self.item_fila('cA').click()
        x, y = self.ponto_no_corpo(self.bloco_sel(V_EXP), f'.dia[data-data="{SEG}"] .faixa[data-inicio="720"]')
        p.mouse.click(x, y)
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b['date'], b['start_min'], b['end_min'], b['title']), ('study', SEG, 720, 780, 'A'))

    def test_soltar_item_da_fila_sobre_o_expediente_no_hoje(self):
        self.semear(commitments=[EXP])
        p = self.page
        p.set_viewport_size({'width': 1280, 'height': 800})
        self.ir_para_hoje()
        item = self.item_fila('cT', 'hoje').bounding_box()
        x, y = self.ponto_no_corpo(f'.linha-do-tempo .bloco[data-bloco="{V_EXP}"]', '.fatia[data-inicio="720"]')
        x0, y0 = item['x'] + item['width'] / 2, item['y'] + item['height'] / 2
        p.mouse.move(x0, y0); p.mouse.down()
        p.mouse.move(x0 - 40, y0 + 10, steps=4)
        p.mouse.move(x, y, steps=8)
        p.mouse.up()
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b['date'], b['start_min'], b['end_min']), ('study', SEG, 720, 780))

    def test_formulario_nao_avisa_sobreposicao(self):
        self.semear(commitments=[EXP])
        p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="1080"]', position={'x': 3, 'y': 60})
        self.folha_aberta()
        p.fill('#bloco-titulo', 'Outro'); p.fill('#bloco-inicio', '08:30'); p.fill('#bloco-fim', '09:30')
        p.dispatch_event('#bloco-inicio', 'change')
        self.assertEqual(p.locator('#bloco-aviso').count(), 0)
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")

    def test_toque_no_corpo_nunca_comeca_antes_do_bloco_tocado(self):
        # fatia de 60 min e bloco às 08:02: o toque às 08:50 arredondaria para 08:00, antes do bloco
        self.semear(settings=[{'day_slot_min': 60}],
                    blocos=[dict(id='bL', kind='commitment', title='Leitura longa', date=SEG, start_min=482, end_min=722)])
        p = self.page
        self.ir_para_hoje()
        b, f = self.caixa('.linha-do-tempo .bloco[data-bloco="bL"]'), self.caixa('.fatia[data-inicio="480"]')
        p.mouse.click(b['x'] + b['width'] / 2, f['y'] + 50 * 1.4)
        self.folha_aberta()
        self.assertEqual((p.input_value('#bloco-inicio'), p.input_value('#bloco-fim')), ('08:02', '09:02'))
