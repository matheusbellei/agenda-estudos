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
        self.assertEqual((p.input_value('#aj-inicio'), p.input_value('#aj-fim')), ('06:00', '22:00'))
        self.assertEqual((p.input_value('#aj-faixa-semana'), p.input_value('#aj-fatia-dia')), ('120', '30'))

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
