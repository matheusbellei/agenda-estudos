from harness import UITest

class TestAjustes(UITest):
    def abrir_ajustes(self):
        self.login()
        self.ir('ajustes')
        self.page.wait_for_selector('#tela-ajustes', state='visible')

    def criar(self, nome, cor=None):
        p = self.page
        p.fill('#aj-cat-nome', nome)
        if cor: p.fill('#aj-cat-form .cor-outra input', cor)
        p.click('#aj-cat-criar')

    def test_secoes_existem(self):
        self.abrir_ajustes()
        for s in ['horarios', 'importar', 'backup']:
            self.assertEqual(self.page.locator(f'#tela-ajustes #aj-{s}.cartao').count(), 1)
        self.assertEqual(self.page.locator('#aj-sair').count(), 0)

    def test_horarios_gravam_e_persistem(self):
        self.abrir_ajustes(); p = self.page
        p.fill('#aj-inicio', '07:00'); p.fill('#aj-fim', '23:00')
        p.select_option('#aj-faixa-semana', '180'); p.select_option('#aj-fatia-dia', '15')
        p.click('#aj-horarios-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1")
        s = self.db()['settings'][0]
        self.assertEqual((s['day_start_min'], s['day_end_min'], s['week_slot_min'], s['day_slot_min']), (420, 1380, 180, 15))
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.ir('ajustes')
        self.assertEqual(p.input_value('#aj-inicio'), '07:00')
        self.assertEqual(p.input_value('#aj-fim'), '23:00')
        self.assertEqual(p.input_value('#aj-faixa-semana'), '180')
        self.assertEqual(p.input_value('#aj-fatia-dia'), '15')

    def test_horarios_mostram_padrao_sem_settings(self):
        self.abrir_ajustes(); p = self.page
        # dia inteiro: o fim "00:00" é a meia-noite do fim do dia
        self.assertEqual((p.input_value('#aj-inicio'), p.input_value('#aj-fim')), ('00:00', '00:00'))
        self.assertEqual((p.input_value('#aj-faixa-semana'), p.input_value('#aj-fatia-dia')), ('120', '30'))

    def test_fim_meia_noite_grava_o_dia_inteiro(self):
        self.abrir_ajustes(); p = self.page
        p.fill('#aj-inicio', '05:00'); p.fill('#aj-fim', '00:00')
        p.click('#aj-horarios-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1")
        s = self.db()['settings'][0]
        self.assertEqual((s['day_start_min'], s['day_end_min']), (300, 1440))

    def test_fim_antes_do_inicio_e_recusado(self):
        self.abrir_ajustes(); p = self.page
        self.seed('settings', [{}])
        before = self.db()['settings'][0]
        p.fill('#aj-inicio', '22:00'); p.fill('#aj-fim', '21:00')
        p.click('#aj-horarios-salvar')
        self.assertNotEqual(p.inner_text('#aj-horarios-erro'), '')
        self.assertEqual(self.db()['settings'][0], before)

    def test_fim_menor_que_uma_faixa_e_recusado(self):
        self.abrir_ajustes(); p = self.page
        p.fill('#aj-inicio', '10:00'); p.fill('#aj-fim', '11:00')  # 60 min < faixa padrão de 120
        p.click('#aj-horarios-salvar')
        self.assertNotEqual(p.inner_text('#aj-horarios-erro'), '')
        self.assertEqual(self.db()['settings'], [])

    def test_sair_volta_ao_login(self):
        self.abrir_ajustes(); p = self.page
        p.click('#menu-botao'); p.click('#menu-sair')
        p.wait_for_selector('#tela-login', state='visible')
        self.assertTrue(p.is_hidden('#app'))

    def test_chip_categoria_contraste(self):
        self.abrir_ajustes(); p = self.page
        r = p.evaluate("""async () => { const m = await import('/js/telas/ajustes.js');
          const c = (cor) => getComputedStyle(m.chipCategoria({ name: 'x', color: cor })).color;
          const clara = m.chipCategoria({ name: 'x', color: '#F5EBDD' }); const escura = m.chipCategoria({ name: 'x', color: '#3B2416' });
          document.body.append(clara, escura);
          return [getComputedStyle(clara).color, getComputedStyle(escura).color]; }""")
        self.assertEqual(r, ['rgb(59, 36, 22)', 'rgb(251, 246, 239)'])

    def test_chip_nao_interpreta_html_e_cor_invalida_usa_a_primeira_da_paleta(self):
        self.abrir_ajustes(); p = self.page
        r = p.evaluate("""async () => { const m = await import('/js/telas/ajustes.js');
          const html = m.chipCategoria({ name: '<b>x</b>', color: '#3E6FB0' });
          const ruim = m.chipCategoria({ name: 'y', color: 'url(x)' });
          const falta = m.chipCategoria({ name: 'z' });
          document.body.append(html, ruim, falta);
          const bg = (e) => getComputedStyle(e).backgroundColor;
          const sel = m.seletorDeCor('url(x)'); const sel2 = m.seletorDeCor(undefined);
          return { filhos: html.children.length, texto: html.textContent, corHtml: bg(html), ruim: bg(ruim), falta: bg(falta),
                   valor: sel.valor(), valor2: sel2.valor(), ativo: sel.el.querySelector('.cor-opcao.ativo')?.dataset.cor }; }""")
        self.assertEqual((r['filhos'], r['texto']), (0, '<b>x</b>'))
        self.assertEqual(r['corHtml'], 'rgb(62, 111, 176)')
        self.assertEqual((r['ruim'], r['falta']), ('rgb(111, 78, 55)', 'rgb(111, 78, 55)'))
        self.assertEqual((r['valor'], r['valor2'], r['ativo']), ('#6F4E37', '#6F4E37', '#6F4E37'))



class TestAcompanhamentoAjustes(UITest):
    def test_minimo_da_sequencia_grava(self):
        self.login(); self.ir('ajustes'); p = self.page
        self.assertEqual(p.input_value('#aj-sequencia'), '30')
        p.fill('#aj-sequencia', '45'); p.click('#aj-acomp-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1 && window.__memdb.settings[0].sequencia_min === 45")

    def test_minimo_fora_da_faixa_da_erro(self):
        self.login(); self.ir('ajustes'); p = self.page
        p.fill('#aj-sequencia', '0'); p.click('#aj-acomp-salvar')
        self.assertEqual(p.inner_text('#aj-acomp-erro'), 'Use de 5 a 600 minutos.')
        self.assertEqual(self.db()['settings'], [])


class TestFlashAjustes(UITest):
    def test_padroes_dos_flashcards_dos_cards(self):
        self.login(); self.ir('ajustes'); p = self.page
        self.assertEqual((p.input_value('#aj-flash-card-novos'), p.input_value('#aj-flash-card-revisoes'), p.input_value('#aj-flash-card-fator')), ('20', '200', '2.5'))
        p.fill('#aj-flash-card-fator', '6'); p.click('#aj-flash-salvar')
        self.assertEqual(p.inner_text('#aj-flash-erro'), 'Use de 0 a 999 novos, de 0 a 9999 revisões e um fator de 1,3 a 5.')
        p.fill('#aj-flash-card-fator', '2'); p.fill('#aj-flash-card-novos', '10'); p.fill('#aj-flash-card-revisoes', '100'); p.click('#aj-flash-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1 && window.__memdb.settings[0].flash_card_novos_dia === 10")
        s = self.db()['settings'][0]
        self.assertEqual((s['flash_card_revisoes_dia'], float(s['flash_card_fator'])), (100, 2.0))


class TestAbasDoAjuste(UITest):
    def test_abas_com_o_visual_do_app(self):
        self.login(); self.ir('ajustes'); p = self.page
        fundo = p.evaluate("getComputedStyle(document.querySelector('#aj-abas')).backgroundColor")
        self.assertNotIn(fundo, ('rgba(0, 0, 0, 0)', 'transparent'))
        borda = p.evaluate("getComputedStyle(document.querySelector('#aj-abas [data-aba-ajustes=\"geral\"]')).borderTopStyle")
        self.assertEqual(borda, 'none')
