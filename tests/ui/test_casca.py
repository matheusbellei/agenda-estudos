from harness import UITest

class TestCasca(UITest):
    def test_login_errado_mostra_erro(self):
        self.open(); p = self.page
        p.fill('#login-email', 'dono@exemplo.com'); p.fill('#login-senha', 'errada'); p.click('#login-entrar')
        p.wait_for_function("document.querySelector('#login-erro').textContent.length > 0")
        self.assertIn('incorretos', p.inner_text('#login-erro'))
        self.assertTrue(p.is_hidden('#app'))

    def test_login_abre_na_semana_e_troca_de_tela(self):
        self.login(); p = self.page
        self.assertTrue(p.is_visible('#tela-semana'))
        self.assertEqual(p.inner_text('#cabecalho-titulo'), 'Agenda')
        for tela in ['hoje', 'quadro', 'fixas', 'busca', 'tags', 'dashboards', 'ajustes']:
            self.ir(tela)
            self.assertTrue(p.is_hidden('#tela-semana'))
        self.ir('semana')

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

class TestTelaDeEntrada(UITest):
    def test_semana_atual_com_hoje_marcado(self):
        self.open(); p = self.page
        dias = p.eval_on_selector_all('#login-semana li', 'els => els.map(e => [e.className, e.innerText.replace(/\\s+/g, " ")])')
        self.assertEqual(len(dias), 7)
        self.assertEqual(dias[0], ['hoje', 'Seg 16'])
        self.assertEqual(dias[6], ['', 'Dom 22'])
        self.assertIn('16 de novembro', p.inner_text('#login-dia'))

    def test_titulo_visivel_e_sem_sobrepor_os_campos(self):
        self.open(); p = self.page
        h1 = p.locator('#tela-login h1').bounding_box()
        email = p.locator('#login-email').bounding_box()
        self.assertGreater(h1['width'], 150)
        self.assertLess(h1['y'] + h1['height'], email['y'])

    def test_mostrar_e_ocultar_senha(self):
        self.open(); p = self.page
        p.fill('#login-senha', 'segredo')
        p.click('#login-ver-senha')
        self.assertEqual(p.get_attribute('#login-senha', 'type'), 'text')
        self.assertEqual(p.inner_text('#login-ver-senha'), 'Ocultar')
        p.click('#login-ver-senha')
        self.assertEqual(p.get_attribute('#login-senha', 'type'), 'password')

    def test_manifesto_do_app_instalavel(self):
        self.open(); p = self.page
        m = p.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())")
        self.assertEqual(m['display'], 'standalone')
        self.assertEqual(m['start_url'], './')
        tamanhos = {(i['sizes'], i.get('purpose')) for i in m['icons']}
        self.assertIn(('192x192', 'any'), tamanhos)
        self.assertIn(('512x512', 'maskable'), tamanhos)
        for i in m['icons']:
            self.assertEqual(p.evaluate(f"fetch('icones/{i['src'].split('/')[-1]}').then(r => r.status)"), 200)


class TestMenu(UITest):
    def test_menu_abre_e_lista_as_telas_na_ordem(self):
        self.login(); p = self.page
        self.assertEqual(p.locator('#abas').count(), 0)
        self.assertEqual(p.locator('#menu-ajustes').count(), 0)
        p.click('#menu-botao')
        self.assertTrue(p.is_visible('#menu'))
        self.assertEqual(p.get_attribute('#menu-botao', 'aria-expanded'), 'true')
        itens = [t.strip() for t in p.locator('#menu button').all_inner_texts()]
        self.assertEqual(itens, ['Agenda', 'Quadro', 'Fixas', 'Busca', 'Tags', 'Dashboards', 'Revisão da semana', 'Modo foco', 'Diário', 'Configurações', 'Sair'])

    def test_escolher_item_troca_tela_titulo_e_fecha(self):
        self.login(); p = self.page
        self.ir('quadro')
        self.assertEqual(p.inner_text('#cabecalho-titulo'), 'Quadro')
        self.assertTrue(p.is_hidden('#menu'))
        self.assertEqual(p.get_attribute('#menu-botao', 'aria-expanded'), 'false')
        self.assertIn('ativo', p.get_attribute('#menu [data-tela="quadro"]', 'class'))
        self.ir('ajustes')
        self.assertEqual(p.inner_text('#cabecalho-titulo'), 'Configurações')

    def test_fecha_com_esc_e_tocando_fora(self):
        self.login(); p = self.page
        p.click('#menu-botao'); p.keyboard.press('Escape')
        self.assertTrue(p.is_hidden('#menu'))
        p.click('#menu-botao'); p.mouse.click(200, 700)
        self.assertTrue(p.is_hidden('#menu'))
        self.assertTrue(p.is_visible('#tela-semana'))

    def test_dashboards_sem_tag_de_estudo_convida(self):
        self.login(); self.ir('dashboards')
        self.assertIn('Marque quais tags contam como estudo', self.page.inner_text('#tela-dashboards'))

    def test_sair_pelo_menu(self):
        self.login(); p = self.page
        p.click('#menu-botao'); p.click('#menu-sair')
        p.wait_for_selector('#tela-login', state='visible')
        self.assertTrue(p.is_hidden('#app'))


class TestAgenda(UITest):
    def test_pagina_inicial_alterna_hoje_e_semana(self):
        self.login(); p = self.page
        self.assertTrue(p.is_visible('#visao'))
        self.assertEqual([t.strip() for t in p.locator('#visao button').all_inner_texts()], ['Hoje', 'Semana'])
        self.assertEqual(p.get_attribute('#visao [data-visao="semana"]', 'aria-pressed'), 'true')
        p.click('#visao [data-visao="hoje"]')
        self.assertTrue(p.is_visible('#tela-hoje')); self.assertTrue(p.is_hidden('#tela-semana'))
        self.assertEqual(p.get_attribute('#visao [data-visao="hoje"]', 'aria-pressed'), 'true')
        self.assertEqual(p.inner_text('#cabecalho-titulo'), 'Agenda')

    def test_agenda_no_menu_volta_para_a_ultima_visao(self):
        self.login(); p = self.page
        p.click('#visao [data-visao="hoje"]')
        self.ir('quadro')
        self.assertTrue(p.is_hidden('#visao'))
        p.click('#menu-botao'); p.click('#menu [data-tela="agenda"]')
        self.assertTrue(p.is_visible('#tela-hoje'))
        self.assertIn('ativo', p.get_attribute('#menu [data-tela="agenda"]', 'class'))
