from harness import UITest


class TestTema(UITest):
    def fundo(self):
        return self.page.evaluate("getComputedStyle(document.body).backgroundColor")

    def escolhido(self):
        return [b.get_attribute('data-tema') for b in self.page.locator('#aj-tema [data-tema]').all() if b.get_attribute('aria-pressed') == 'true']

    def test_escolher_escuro_muda_na_hora_e_sobrevive_ao_recarregar(self):
        self.login(); self.ir('ajustes'); p = self.page
        self.assertEqual([t.strip() for t in p.locator('#aj-tema [data-tema]').all_inner_texts()], ['Automático', 'Claro', 'Escuro'])
        self.assertEqual(self.escolhido(), ['claro'])
        claro = self.fundo()
        p.click('#aj-tema [data-tema="escuro"]')
        self.assertEqual(p.evaluate("document.documentElement.dataset.tema"), 'escuro')
        self.assertNotEqual(self.fundo(), claro)
        self.assertEqual(self.fundo(), 'rgb(21, 16, 12)')
        self.assertEqual(p.evaluate("document.querySelector('meta[name=theme-color]').content"), '#2A1C13')
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.assertEqual(p.evaluate("document.documentElement.dataset.tema"), 'escuro')
        self.ir('ajustes'); self.assertEqual(self.escolhido(), ['escuro'])
        p.click('#aj-tema [data-tema="claro"]')
        self.assertIsNone(p.evaluate("document.documentElement.dataset.tema || null"))
        self.assertEqual(self.fundo(), claro)
        self.assertEqual(p.evaluate("document.querySelector('meta[name=theme-color]').content"), '#3B2416')

    def test_automatico_segue_o_aparelho_e_muda_junto(self):
        self.login(); p = self.page
        p.emulate_media(color_scheme='dark')
        self.ir('ajustes'); p.click('#aj-tema [data-tema="auto"]')
        self.assertEqual(p.evaluate("localStorage.getItem('agenda-tema')"), 'auto')
        self.assertEqual(p.evaluate("document.documentElement.dataset.tema"), 'escuro')
        p.emulate_media(color_scheme='light')
        p.wait_for_function("!document.documentElement.dataset.tema")
        p.emulate_media(color_scheme='dark')
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.assertEqual(p.evaluate("document.documentElement.dataset.tema"), 'escuro')
        self.ir('ajustes'); self.assertEqual(self.escolhido(), ['auto'])

    def test_tema_escuro_ja_vem_aplicado_na_tela_de_entrada(self):
        p = self.page
        p.goto(self.base); p.wait_for_selector('#login-email', state='visible')
        p.evaluate("localStorage.setItem('agenda-tema', 'escuro')")
        p.reload(); p.wait_for_selector('#login-email', state='visible')
        self.assertEqual(p.evaluate("document.documentElement.dataset.tema"), 'escuro')

    def test_icones_do_menu_legiveis_no_escuro(self):
        self.login(); p = self.page
        p.evaluate("localStorage.setItem('agenda-tema', 'escuro')"); p.reload(); p.wait_for_selector('#app', state='visible')
        p.click('#menu-botao'); p.wait_for_selector('#menu:not([hidden])')
        cor = p.eval_on_selector('#menu button i', 'e => getComputedStyle(e).color')
        self.assertEqual(cor, 'rgb(205, 180, 151)')
