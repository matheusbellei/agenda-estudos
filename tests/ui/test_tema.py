from harness import UITest


class TestTema(UITest):
    def fundo(self):
        return self.page.evaluate("getComputedStyle(document.body).backgroundColor")

    def test_escolher_escuro_muda_na_hora_e_sobrevive_ao_recarregar(self):
        self.login(); self.ir('ajustes'); p = self.page
        self.assertEqual(p.input_value('#aj-tema'), 'claro')
        claro = self.fundo()
        p.select_option('#aj-tema', 'escuro')
        self.assertEqual(p.evaluate("document.documentElement.dataset.tema"), 'escuro')
        self.assertNotEqual(self.fundo(), claro)
        self.assertEqual(self.fundo(), 'rgb(21, 16, 12)')
        self.assertEqual(p.evaluate("document.querySelector('meta[name=theme-color]').content"), '#2A1C13')
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.assertEqual(p.evaluate("document.documentElement.dataset.tema"), 'escuro')
        self.ir('ajustes'); self.assertEqual(p.input_value('#aj-tema'), 'escuro')
        p.select_option('#aj-tema', 'claro')
        self.assertIsNone(p.evaluate("document.documentElement.dataset.tema || null"))
        self.assertEqual(self.fundo(), claro)
        self.assertEqual(p.evaluate("document.querySelector('meta[name=theme-color]').content"), '#3B2416')

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
