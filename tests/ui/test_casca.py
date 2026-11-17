from harness import UITest

class TestCasca(UITest):
    def test_login_errado_mostra_erro(self):
        self.open(); p = self.page
        p.fill('#login-email', 'dono@exemplo.com'); p.fill('#login-senha', 'errada'); p.click('#login-entrar')
        p.wait_for_function("document.querySelector('#login-erro').textContent.length > 0")
        self.assertIn('incorretos', p.inner_text('#login-erro'))
        self.assertTrue(p.is_hidden('#app'))

    def test_login_abre_na_semana_e_troca_de_aba(self):
        self.login(); p = self.page
        self.assertTrue(p.is_visible('#tela-semana'))
        for aba in ['hoje', 'quadro', 'fixas', 'busca']:
            p.click(f'[data-aba="{aba}"]')
            self.assertTrue(p.is_visible(f'#tela-{aba}'))
            self.assertTrue(p.is_hidden('#tela-semana'))
        p.click('#menu-ajustes')
        self.assertTrue(p.is_visible('#tela-ajustes'))

    def test_recarregar_mantem_sessao(self):
        self.login(); self.page.reload()
        self.page.wait_for_selector('#app', state='visible')

    def test_cores_da_paleta(self):
        self.open()
        v = self.page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--espresso').trim()")
        self.assertEqual(v.upper(), '#3B2416')

    def test_falha_ao_carregar_fica_no_login_com_a_mensagem(self):
        self.open(); p = self.page
        p.evaluate("window.__memFalhar = 'list'")
        p.fill('#login-email', 'dono@exemplo.com'); p.fill('#login-senha', 'senha123'); p.click('#login-entrar')
        p.wait_for_function("document.querySelector('#login-erro').textContent.length > 0")
        self.assertEqual(p.inner_text('#login-erro'), 'Sem conexão. Tente de novo.')
        self.assertTrue(p.is_visible('#tela-login'))
        self.assertTrue(p.is_hidden('#app'))
        # O hook falha uma vez só: tentar de novo entra normalmente.
        p.click('#login-entrar')
        p.wait_for_selector('#tela-semana', state='visible')
        self.assertTrue(p.is_hidden('#tela-login'))

    def test_recarregar_com_falha_no_carregamento_volta_ao_login(self):
        self.login(); p = self.page
        p.add_init_script("window.__memFalhar = 'list'")  # o hook é da página: não sobrevive ao reload
        p.reload()
        p.wait_for_function("document.querySelector('#login-erro').textContent.length > 0")
        self.assertIn('Sem conexão', p.inner_text('#login-erro'))
        self.assertTrue(p.is_hidden('#app'))

    def test_sem_configuracao_o_formulario_nao_envia(self):
        self.page.add_init_script("delete window.__TEST_STORE__;")
        self.page.goto(self.base)
        p = self.page
        p.wait_for_function("document.querySelector('#login-erro').textContent.includes('Falta configurar')")
        self.assertTrue(p.is_disabled('#login-entrar'))
        url = p.url
        p.fill('#login-senha', 'x'); p.press('#login-senha', 'Enter')
        p.wait_for_timeout(300)
        self.assertEqual(p.url, url)
        self.assertEqual(p.input_value('#login-senha'), 'x')  # página não recarregou

    def test_dados_do_banco_chegam_ao_estado_e_so_do_dono(self):
        self.open(); p = self.page
        self.seed('cards', [{'title': 'Meu card'}])
        p.evaluate("window.__memSeed('cards', [{ title: 'De outro', owner_id: 'u2' }])")
        p.fill('#login-email', 'dono@exemplo.com'); p.fill('#login-senha', 'senha123'); p.click('#login-entrar')
        p.wait_for_selector('#tela-semana', state='visible')
        titulos = p.evaluate("window.__TEST_STORE__.list('cards').then(r => r.map(c => c.title))")
        self.assertEqual(titulos, ['Meu card'])

    def test_excluir_card_em_cascata_no_banco_em_memoria(self):
        self.login(); p = self.page
        r = p.evaluate("""async () => { const s = window.__TEST_STORE__;
          const [c] = await s.insert('cards', { title: 'X' });
          const [i] = await s.insert('items', { card_id: c.id, title: 'i' });
          await s.insert('blocks', { date: '2026-11-16', start_min: 60, end_min: 120, kind: 'study', card_id: c.id, item_id: i.id });
          await s.remove('cards', c.id);
          return { items: (await s.list('items')).length, blocks: await s.list('blocks') }; }""")
        self.assertEqual(r['items'], 0)
        self.assertEqual((r['blocks'][0]['card_id'], r['blocks'][0]['item_id']), (None, None))
