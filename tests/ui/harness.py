"""Abre o index.html num Chrome headless com Supabase simulado e banco em memória."""
import functools, http.server, pathlib, threading, unittest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
MEM = (ROOT / 'tests/ui/memory-store.js').read_text()
SUPA_STUB = "window.supabase = { createClient() { return {}; } };"

class UITest(unittest.TestCase):
    TODAY = '2026-11-16'  # segunda-feira

    @classmethod
    def setUpClass(cls):
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        handler = functools.partial(Quiet, directory=str(ROOT))
        cls.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.httpd.server_address[1]}/index.html'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.httpd.shutdown(); cls.httpd.server_close()

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR', timezone_id='America/Sao_Paulo')
        self.errors = []
        self.ctx.set_default_timeout(4000)
        self.page = self.ctx.new_page()
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('dialog', lambda d: d.accept())
        def route(r):
            u = r.request.url
            if u.startswith('http://127.0.0.1'): return r.continue_()
            if 'supabase' in u: return r.fulfill(body=SUPA_STUB, content_type='text/javascript')
            if u.endswith('.js') or '.js?' in u: return r.fulfill(body='', content_type='text/javascript')
            return r.fulfill(body='', content_type='text/css')
        self.page.route('**/*', route)
        # `window.__agora` muda o relógio no meio do teste (virada de dia com o app aberto).
        self.page.add_init_script(f"""(() => {{ globalThis.__agora = new Date('{self.TODAY}T12:00:00-03:00').getTime();
          const D = Date; class FakeDate extends D {{ constructor(...a) {{ super(...(a.length ? a : [globalThis.__agora])); }} static now() {{ return globalThis.__agora; }} }};
          globalThis.Date = FakeDate; window.__EDITOR_SIMPLES__ = true; }})();""")
        self.page.add_init_script(MEM)

    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.errors, [], 'erros de JavaScript na página')

    def open(self):
        self.page.goto(self.base)
        self.page.wait_for_selector('#tela-login, #app', state='visible')

    def fechar_folha(self):
        """Fecha a folha do bloco pelo botão Fechar/Cancelar, depois de terminar a gravação em curso."""
        p = self.page
        p.wait_for_function("!document.querySelector('#bloco-salvar').disabled")
        p.click('#bloco-cancelar')
        p.wait_for_function("document.querySelector('#folha-bloco').hidden")

    def login(self, email='dono@exemplo.com', senha='senha123'):
        self.open()
        p = self.page
        p.fill('#login-email', email); p.fill('#login-senha', senha); p.click('#login-entrar')
        p.wait_for_selector('#tela-semana', state='visible')

    def ir(self, tela):
        """Abre o menu ☰ e escolhe a tela."""
        p = self.page
        if p.is_hidden('#menu'): p.click('#menu-botao')
        # Agenda = Semana; o dia (Hoje) abre tocando no nome do dia na Semana.
        p.click(f'#menu [data-tela="{"agenda" if tela in ("hoje", "semana") else tela}"]')
        if tela == 'hoje':
            p.wait_for_selector('#tela-semana', state='visible')
            p.click(f'#sem-grade .dia[data-data="{self.TODAY}"] .dia-nome')
        p.wait_for_selector(f'#tela-{tela}', state='visible')

    def seed(self, table, rows):
        self.page.evaluate('([t, r]) => window.__memSeed(t, r)', [table, rows])

    def db(self):
        return self.page.evaluate('() => window.__memdb')
