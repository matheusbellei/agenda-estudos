import json
from harness import UITest

# Navegador simulado: permissão de notificação, service worker pronto e PushManager.
SIMULADOR = """(() => {
  window.__push = { inscrita: null, permissao: 'default', responder: 'granted', opcoes: null };
  const sub = (endpoint) => ({ endpoint, toJSON() { return { endpoint, keys: { p256dh: 'P256', auth: 'AUTH' } }; },
    async unsubscribe() { window.__push.inscrita = null; return true; } });
  const reg = { pushManager: {
    async getSubscription() { return window.__push.inscrita; },
    async subscribe(o) { window.__push.opcoes = { userVisibleOnly: o.userVisibleOnly, chave: o.applicationServerKey && o.applicationServerKey.byteLength };
      window.__push.inscrita = sub('https://push.teste/' + Math.random().toString(36).slice(2)); return window.__push.inscrita; } } };
  Object.defineProperty(window, 'Notification', { configurable: true, value: {
    get permission() { return window.__push.permissao; },
    async requestPermission() { window.__push.permissao = window.__push.responder; return window.__push.permissao; } } });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    ready: Promise.resolve(reg), register: async () => reg, addEventListener() {} } });
  window.PushManager = function PushManager() {};
})();"""


class NotifBase(UITest):
    def abrir(self, antes='', **seeds):
        self.page.add_init_script(SIMULADOR + antes)
        self.login()
        for t, linhas in seeds.items():
            self.seed(t, linhas)
        if seeds:
            self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.ir('ajustes')
        self.page.click('#aj-abas [data-aba-ajustes="notificacoes"]')
        self.page.wait_for_selector('#aj-notificacoes', state='visible')


class TestAbaNotificacoes(NotifBase):
    def test_abas_trocam_entre_geral_e_notificacoes(self):
        self.abrir(); p = self.page
        self.assertEqual([t.strip() for t in p.locator('#aj-abas button').all_inner_texts()], ['Geral', 'Notificações'])
        self.assertTrue(p.is_hidden('#aj-geral'))
        p.click('#aj-abas [data-aba-ajustes="geral"]')
        self.assertTrue(p.is_visible('#aj-geral')); self.assertTrue(p.is_hidden('#aj-notificacoes'))
        self.assertTrue(p.is_visible('#aj-horarios'))

    def test_aparelhos_e_verificacao_ficam_recolhidos(self):
        self.abrir(); p = self.page
        self.assertFalse(p.evaluate("document.querySelector('#notif-mais').open"))
        self.assertFalse(p.is_visible('#notif-verificar'))
        p.click('#notif-mais summary')
        self.assertTrue(p.is_visible('#notif-verificar'))

    def test_ativar_grava_o_aparelho_e_desativar_remove(self):
        self.abrir(); p = self.page
        self.assertEqual(p.inner_text('#notif-aparelho-estado'), 'Este aparelho não recebe os avisos.')
        self.assertEqual(p.inner_text('#notif-ativar'), 'Receber neste aparelho')
        p.click('#notif-ativar')
        p.wait_for_function("window.__memdb.push_subscriptions && window.__memdb.push_subscriptions.length === 1")
        s = self.db()['push_subscriptions'][0]
        self.assertTrue(s['endpoint'].startswith('https://push.teste/'))
        self.assertEqual((s['p256dh'], s['auth']), ('P256', 'AUTH'))
        self.assertTrue(s['aparelho'])
        self.assertEqual(p.evaluate('window.__push.opcoes'), {'userVisibleOnly': True, 'chave': 65})
        p.wait_for_function("document.querySelector('#notif-aparelho-estado').textContent === 'Este aparelho recebe os avisos.'")
        self.assertEqual(p.inner_text('#notif-desativar'), 'Parar de receber neste aparelho')
        self.assertEqual(p.get_attribute('#notif-status', 'data-estado'), 'ativado')
        self.assertEqual(p.locator('#notif-aparelhos li').count(), 1)
        p.click('#notif-desativar')
        p.wait_for_function("window.__memdb.push_subscriptions.length === 0")
        self.assertIsNone(p.evaluate('window.__push.inscrita'))

    def test_permissao_bloqueada_explica_e_esconde_ativar(self):
        self.abrir("window.__push.permissao = 'denied';"); p = self.page
        self.assertIn('bloquead', p.inner_text('#notif-aparelho-estado').lower())
        self.assertTrue(p.is_hidden('#notif-ativar'))

    def test_negar_no_pedido_mostra_aviso_e_nao_grava(self):
        self.abrir("window.__push.responder = 'denied';"); p = self.page
        p.click('#notif-ativar')
        p.wait_for_function("document.querySelector('#notif-erro').textContent.length > 0")
        self.assertEqual(self.db().get('push_subscriptions', []), [])

    def test_salvar_preferencias_grava_settings(self):
        self.abrir(); p = self.page
        self.assertEqual(p.input_value('#notif-antes'), '10')
        self.assertTrue(p.is_hidden('#notif-silencio-de'))
        p.select_option('#notif-antes', '30')
        p.uncheck('#notif-resumo')
        p.fill('#notif-pendencias-hora', '22:00')
        p.check('#notif-silencio')
        self.assertTrue(p.is_visible('#notif-silencio-de'))
        p.fill('#notif-silencio-de', '23:00'); p.fill('#notif-silencio-ate', '06:30')
        p.click('#notif-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1 && window.__memdb.settings[0].notif_antes_min === 30")
        s = self.db()['settings'][0]
        self.assertEqual((s['notif_resumo'], s['notif_pendencias_min'], s['notif_silencio'], s['notif_silencio_de'], s['notif_silencio_ate']),
                         (False, 1320, True, 1380, 390))
        self.assertTrue(s['fuso'])

    def test_enviar_teste_chama_a_funcao_com_a_sessao_e_o_aparelho(self):
        self.abrir(); p = self.page
        pedidos = []
        p.on('request', lambda r: pedidos.append(r) if 'functions/v1/lembretes' in r.url else None)
        p.click('#notif-ativar')
        p.wait_for_function("window.__memdb.push_subscriptions && window.__memdb.push_subscriptions.length === 1")
        p.click('#notif-teste')
        p.wait_for_function("document.querySelector('#notif-msg').textContent.includes('Enviado')")
        r = pedidos[-1]
        self.assertIn('?teste=1', r.url)
        self.assertEqual(r.headers['authorization'], 'Bearer jwt-teste')
        self.assertEqual(json.loads(r.post_data)['endpoint'], self.db()['push_subscriptions'][0]['endpoint'])

    def test_outros_aparelhos_aparecem_e_podem_ser_removidos(self):
        self.abrir(push_subscriptions=[{'id': 'o1', 'endpoint': 'https://push.teste/outro', 'p256dh': 'x', 'auth': 'y', 'aparelho': 'Chrome no Windows'}]); p = self.page
        p.click('#notif-mais summary')
        self.assertIn('Chrome no Windows', p.inner_text('#notif-aparelhos'))
        p.click('#notif-aparelhos [data-sub="o1"] .notif-remover')
        p.wait_for_function("window.__memdb.push_subscriptions.length === 0")

    def test_sem_chave_publica_explica_o_que_falta(self):
        self.abrir("window.__memSemVapid = true;"); p = self.page
        self.assertIn('VAPID_PUBLIC_KEY', p.inner_text('#notif-aparelho-estado'))
        self.assertTrue(p.is_hidden('#notif-ativar'))


class TestLembreteNoBloco(NotifBase):
    def novo(self, **seeds):
        self.page.add_init_script(SIMULADOR)
        self.login()
        for t, linhas in seeds.items():
            self.seed(t, linhas)
        if seeds:
            self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.page.click('.dia[data-data="2026-11-17"] .faixa[data-inicio="480"]')
        self.page.wait_for_selector('#folha-bloco:not([hidden])')
        self.page.fill('#bloco-titulo', 'Revisão')

    def test_padrao_mostra_o_valor_geral_e_lembrete_proprio_grava(self):
        self.novo(settings=[{'notif_antes_min': 15}]); p = self.page
        self.assertEqual(p.locator('#bloco-lembrete option').first.inner_text(), 'Padrão (15 min antes)')
        p.select_option('#bloco-lembrete', '30')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertEqual(self.db()['blocks'][0]['lembrete_min'], 30)

    def test_padrao_grava_null_e_fixa_grava_na_regra(self):
        self.novo(); p = self.page
        p.select_option('#bloco-lembrete', '0')
        p.check('#bloco-repetir')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.commitments.length === 1")
        self.assertEqual(self.db()['commitments'][0]['lembrete_min'], 0)

    def test_abrir_pelo_link_da_notificacao_abre_o_bloco(self):
        self.page.add_init_script(SIMULADOR)
        self.login()
        self.seed('blocks', [{'id': 'b1', 'kind': 'commitment', 'title': 'Aula de espanhol', 'date': '2026-11-18', 'start_min': 600, 'end_min': 660}])
        self.page.goto(self.base + '?bloco=b1&data=2026-11-18')
        self.page.wait_for_selector('#folha-bloco:not([hidden])')
        self.assertEqual(self.page.input_value('#bloco-titulo'), 'Aula de espanhol')
        self.assertTrue(self.page.is_visible('#tela-hoje'))

    def test_bloco_gravado_de_fixa_mostra_o_proprio_lembrete_e_nao_o_da_fixa(self):
        self.page.add_init_script(SIMULADOR)
        self.login()
        self.seed('commitments', [{'id': 'f1', 'title': 'Leitura', 'days': [2], 'start_min': 480, 'end_min': 540, 'valid_from': '2026-11-01', 'lembrete_min': 30}])
        self.seed('blocks', [{'id': 'b1', 'commitment_id': 'f1', 'kind': 'commitment', 'title': 'Leitura', 'date': '2026-11-17', 'start_min': 480, 'end_min': 540, 'lembrete_min': None}])
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.page.click('.dia[data-data="2026-11-17"] .bloco .bloco-cabeca')
        self.page.wait_for_selector('#folha-bloco:not([hidden])')
        self.assertEqual(self.page.input_value('#bloco-lembrete'), '')

    def test_ocorrencia_virtual_mostra_o_lembrete_da_fixa(self):
        self.page.add_init_script(SIMULADOR)
        self.login()
        self.seed('commitments', [{'id': 'f1', 'title': 'Leitura', 'days': [2], 'start_min': 480, 'end_min': 540, 'valid_from': '2026-11-01', 'lembrete_min': 30}])
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.page.click('.dia[data-data="2026-11-17"] .bloco .bloco-cabeca')
        self.page.wait_for_selector('#folha-bloco:not([hidden])')
        self.assertEqual(self.page.input_value('#bloco-lembrete'), '30')


class TestSincronizar(UITest):
    def test_ao_entrar_inscricao_renovada_pelo_navegador_volta_a_ser_gravada(self):
        antes = ("window.__push.permissao = 'granted';"
                 "window.__push.inscrita = { endpoint: 'https://push.teste/renovada', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P2', auth: 'A2' } }; }, async unsubscribe() { return true; } };")
        self.page.add_init_script(SIMULADOR + antes)
        self.login()
        self.page.wait_for_function("window.__memdb.push_subscriptions.length === 1")
        s = self.db()['push_subscriptions'][0]
        self.assertEqual((s['endpoint'], s['p256dh'], s['auth']), ('https://push.teste/renovada', 'P2', 'A2'))

    def test_sem_permissao_nao_grava_nada_ao_entrar(self):
        antes = "window.__push.inscrita = { endpoint: 'https://push.teste/x', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P', auth: 'A' } }; } };"
        self.page.add_init_script(SIMULADOR + antes)
        self.login()
        self.page.wait_for_timeout(300)
        self.assertEqual(self.db()['push_subscriptions'], [])


class TestAvisoRevisao(NotifBase):
    def test_revisao_da_semana_grava_dia_e_horario(self):
        self.abrir(); p = self.page
        self.assertTrue(p.is_checked('#notif-revisao'))
        self.assertEqual(p.get_attribute('#notif-revisao-dia [data-dia="7"]', 'aria-pressed'), 'true')
        self.assertEqual(p.locator('#notif-revisao-dia [data-dia]').all_inner_texts(), ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'])
        self.assertEqual(p.input_value('#notif-revisao-hora'), '20:00')
        p.click('#notif-revisao-dia [data-dia="1"]'); p.fill('#notif-revisao-hora', '08:30')
        self.assertEqual(p.get_attribute('#notif-revisao-dia [data-dia="7"]', 'aria-pressed'), 'false')
        p.click('#notif-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1 && window.__memdb.settings[0].revisao_dia === 1")
        s = self.db()['settings'][0]
        self.assertEqual((s['revisao'], s['revisao_min']), (True, 510))
        p.uncheck('#notif-revisao'); self.assertTrue(p.is_hidden('#notif-revisao-hora'))
        p.click('#notif-salvar')
        p.wait_for_function("window.__memdb.settings[0].revisao === false")

    def test_silencio_vem_desligado_e_avisa_que_nada_chega(self):
        self.abrir(); p = self.page
        self.assertFalse(p.is_checked('#notif-silencio'))
        self.assertIn('nenhum aviso', p.inner_text('#notif-silencio-aviso'))
        self.assertIn('revisão da semana', p.inner_text('#notif-silencio-aviso'))
        self.assertTrue(p.is_hidden('#notif-revisao-no-silencio'))
        p.check('#notif-silencio'); p.fill('#notif-silencio-de', '19:00'); p.dispatch_event('#notif-silencio-de', 'input')
        self.assertTrue(p.is_visible('#notif-revisao-no-silencio'))
        p.fill('#notif-revisao-hora', '18:00'); p.dispatch_event('#notif-revisao-hora', 'input')
        self.assertTrue(p.is_hidden('#notif-revisao-no-silencio'))


class TestAvisoFlash(NotifBase):
    def test_flashcards_do_dia_grava_liga_e_horario(self):
        self.abrir(); p = self.page
        self.assertTrue(p.is_checked('#notif-flash'))
        self.assertEqual(p.input_value('#notif-flash-hora'), '19:00')
        p.fill('#notif-flash-hora', '07:30'); p.uncheck('#notif-flash')
        p.click('#notif-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1 && window.__memdb.settings[0].flash_aviso === false")
        self.assertEqual(self.db()['settings'][0]['flash_aviso_min'], 450)


DIAG_OK = {'chaves': {'publica': True, 'publicaIgual': True, 'privada': True, 'segredo': True}, 'banco': 'ok',
           'agendador': {'ultimoTique': '2026-11-16T14:59:00Z', 'segundosDesdeUltimo': 40, 'ultimoErro': None, 'erroEm': None},
           'aparelho': {'ativado': True, 'ultimoOk': '2026-11-16T14:50:00Z', 'ultimoStatus': 201}}


class TestVerificar(NotifBase):
    def responder(self, corpo, status=200):
        self.pedidos = []
        def rota(r):
            self.pedidos.append(r.request)
            r.fulfill(status=status, body=json.dumps(corpo), content_type='application/json')
        self.page.route('**/functions/v1/lembretes?diagnostico=1', rota)

    def ativar_e_verificar(self):
        p = self.page
        p.click('#notif-ativar')
        p.wait_for_function("window.__memdb.push_subscriptions && window.__memdb.push_subscriptions.length === 1")
        if not p.evaluate("document.querySelector('#notif-mais').open"): p.click('#notif-mais summary')
        p.click('#notif-verificar')
        p.wait_for_selector('#notif-diagnostico li[data-item]')
        return {li.get_attribute('data-item'): (li.get_attribute('data-ok'), li.inner_text()) for li in p.locator('#notif-diagnostico li').all()}

    def test_tudo_certo(self):
        self.abrir(); self.responder(DIAG_OK)
        itens = self.ativar_e_verificar()
        self.assertTrue(all(ok == 'sim' for ok, _ in itens.values()), itens)
        self.assertIn('rodou há 40 s', itens['agendador'][1])
        corpo = json.loads(self.pedidos[-1].post_data)
        self.assertEqual(corpo['endpoint'], self.db()['push_subscriptions'][0]['endpoint'])
        self.assertTrue(corpo['vapidPublica'].startswith('BCJ6'))
        self.assertEqual(self.pedidos[-1].headers['authorization'], 'Bearer jwt-teste')

    def test_aponta_o_que_esta_errado(self):
        d = json.loads(json.dumps(DIAG_OK))
        d['chaves']['publicaIgual'] = False
        d['agendador'] = {'ultimoTique': None, 'segundosDesdeUltimo': None, 'ultimoErro': None, 'erroEm': None}
        d['aparelho']['ultimoStatus'] = 403
        self.abrir(); self.responder(d)
        itens = self.ativar_e_verificar()
        self.assertEqual(itens['chaves'][0], 'nao'); self.assertIn('VAPID_PUBLIC_KEY', itens['chaves'][1])
        self.assertEqual(itens['agendador'][0], 'nao'); self.assertIn('agendar-lembretes.sql', itens['agendador'][1])
        self.assertEqual(itens['entrega'][0], 'nao'); self.assertIn('403', itens['entrega'][1])

    def test_agendador_parado_e_erro_do_ultimo_tique(self):
        d = json.loads(json.dumps(DIAG_OK))
        d['agendador'] = {'ultimoTique': '2026-11-16T14:00:00Z', 'segundosDesdeUltimo': 3600, 'ultimoErro': 'GET blocks: 403 permission denied', 'erroEm': '2026-11-16T14:59:00Z'}
        self.abrir(); self.responder(d)
        itens = self.ativar_e_verificar()
        self.assertEqual(itens['agendador'][0], 'nao')
        self.assertIn('60 min', itens['agendador'][1])
        self.assertIn('permission denied', itens['agendador'][1])

    def test_funcao_antiga_ou_fora_do_ar(self):
        self.abrir(); self.responder({'erro': 'Não encontrado.'}, status=404)
        itens = self.ativar_e_verificar()
        self.assertEqual(itens['funcao'][0], 'nao')
        self.assertIn('Deploy', itens['funcao'][1])

    def test_sem_ativar_avisa_primeiro(self):
        self.abrir(); self.responder(DIAG_OK); p = self.page
        if not p.evaluate("document.querySelector('#notif-mais').open"): p.click('#notif-mais summary')
        p.click('#notif-verificar')
        p.wait_for_selector('#notif-diagnostico li[data-item]')
        self.assertEqual(p.get_attribute('#notif-diagnostico li[data-item="aparelho"]', 'data-ok'), 'nao')
        self.assertIn('Ativar neste aparelho', p.inner_text('#notif-diagnostico'))


class TestSincronizarChave(UITest):
    def test_inscricao_com_chave_antiga_e_refeita_com_a_chave_atual(self):
        antes = ("window.__push.permissao = 'granted';"
                 "window.__push.inscrita = { endpoint: 'https://push.teste/velha', options: { applicationServerKey: new Uint8Array(65).fill(7).buffer },"
                 " toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P', auth: 'A' } }; }, async unsubscribe() { window.__push.inscrita = null; return true; } };")
        self.page.add_init_script(SIMULADOR + antes)
        self.login()
        self.seed('push_subscriptions', [{'id': 'v1', 'endpoint': 'https://push.teste/velha', 'p256dh': 'P', 'auth': 'A', 'aparelho': 'Chrome no Android'}])
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        # a linha da inscrição velha some e entra a nova, feita com a chave atual
        self.page.wait_for_function("window.__memdb.push_subscriptions.length >= 1 && !window.__memdb.push_subscriptions.some(s => s.endpoint === 'https://push.teste/velha')")
        self.assertEqual(self.page.evaluate('window.__push.opcoes.chave'), 65)
