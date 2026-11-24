from harness import UITest

HOJE = '2026-11-16'
MEIO_DIA = 'new Date("2026-11-16T12:00:00-03:00").getTime()'


class FocoBase(UITest):
    def entrar(self, blocks=(), settings=None):
        self.login()
        if blocks: self.seed('blocks', list(blocks))
        if settings: self.seed('settings', [settings])
        if blocks or settings:
            self.page.reload(); self.page.wait_for_selector('#app', state='visible')

    def avancar(self, minutos):
        self.page.evaluate(f'globalThis.__agora += {minutos} * 60000')

    def tempo(self, texto):
        self.page.wait_for_function(f"document.querySelector('#foco-tempo').textContent === '{texto}'")

    def foco(self):
        f = self.db()['focos']
        return f[0] if f else None


BLOCO = {'id': 'b1', 'date': HOJE, 'start_min': 840, 'end_min': 900, 'kind': 'study', 'title': 'Gramática', 'status': 'planned', 'cancelled': False}


class TestFoco(FocoBase):
    def test_iniciar_contar_pausar_e_retomar(self):
        self.entrar(); self.ir('foco'); p = self.page
        self.assertEqual(p.inner_text('#cabecalho-titulo'), 'Modo foco')
        self.assertEqual(p.inner_text('#foco-tempo'), '25:00')
        self.assertEqual(p.inner_text('#foco-fase'), 'Foco')
        self.assertEqual(p.inner_text('#foco-ciclo'), 'Ciclo 1 de 4')
        p.click('#foco-iniciar')
        p.wait_for_function("window.__memdb.focos.length === 1")
        f = self.foco()
        self.assertEqual((f['fase'], f['ciclo'], f['estado']), ('foco', 1, 'rodando'))
        self.assertEqual(p.evaluate(f"Date.parse(window.__memdb.focos[0].termina_em) - {MEIO_DIA}"), 25 * 60000)
        self.avancar(10); self.tempo('15:00')
        p.click('#foco-pausar')
        p.wait_for_function("window.__memdb.focos[0].estado === 'pausado'")
        self.assertEqual(self.foco()['restante_s'], 900)
        self.avancar(30); self.tempo('15:00')
        p.click('#foco-retomar')
        p.wait_for_function("window.__memdb.focos[0].estado === 'rodando'")
        self.assertEqual(p.evaluate(f"Date.parse(window.__memdb.focos[0].termina_em) - {MEIO_DIA}"), 55 * 60000)

    def test_fase_que_acabou_com_o_app_fechado_fica_esperando(self):
        self.entrar(); self.ir('foco'); p = self.page
        p.click('#foco-iniciar'); p.wait_for_function("window.__memdb.focos.length === 1")
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.avancar(40)  # o relógio de teste volta ao meio-dia a cada carga: avança depois de recarregar
        self.ir('foco')
        p.wait_for_selector('#foco-proxima', state='visible')
        self.assertEqual(p.inner_text('#foco-proxima'), 'Começar pausa')
        self.assertEqual(p.inner_text('#foco-tempo'), '00:00')
        self.assertIn('Hora da pausa de 5 min', p.inner_text('#foco-fim-texto'))
        p.wait_for_function("window.__memdb.focos[0].estado === 'esperando'")
        p.click('#foco-proxima')
        p.wait_for_function("window.__memdb.focos[0].fase === 'pausa' && window.__memdb.focos[0].estado === 'rodando'")
        self.tempo('05:00')

    def test_pular_vai_para_a_pausa(self):
        self.entrar(); self.ir('foco'); p = self.page
        p.click('#foco-iniciar'); p.wait_for_function("window.__memdb.focos.length === 1")
        p.click('#foco-pular')
        p.wait_for_function("window.__memdb.focos[0].fase === 'pausa'")
        self.assertEqual(p.inner_text('#foco-fase'), 'Pausa')

    def test_parar_sem_bloco_nao_pergunta(self):
        self.entrar(); self.ir('foco'); p = self.page
        p.click('#foco-iniciar'); p.wait_for_function("window.__memdb.focos.length === 1")
        p.click('#foco-parar')
        p.wait_for_function("window.__memdb.focos.length === 0")
        self.assertTrue(p.is_hidden('#foco-perguntar'))
        self.assertEqual(p.inner_text('#foco-tempo'), '25:00')

    def test_focar_pelo_bloco_e_parar_marcando_com_diario(self):
        self.entrar(blocks=[BLOCO]); p = self.page
        p.click('.bloco[data-bloco="b1"] .bloco-cabeca'); p.wait_for_selector('#folha-bloco', state='visible')
        p.click('#bloco-focar')
        p.wait_for_selector('#tela-foco', state='visible')
        self.assertEqual(p.inner_text('#foco-titulo'), 'Gramática')
        p.click('#foco-iniciar'); p.wait_for_function("window.__memdb.focos.length === 1")
        self.assertEqual((self.foco()['bloco_ref'], self.foco()['bloco_data'], self.foco()['titulo']), ('b1', HOJE, 'Gramática'))
        p.click('#foco-parar')
        p.wait_for_selector('#foco-perguntar', state='visible')
        p.fill('#foco-diario', 'Revisei os verbos irregulares.')
        p.click('#foco-marcar')
        p.wait_for_function("window.__memdb.focos.length === 0")
        b = next(x for x in self.db()['blocks'] if x['id'] == 'b1')
        self.assertEqual((b['status'], b['diario']), ('done', 'Revisei os verbos irregulares.'))

    def test_parar_com_bloco_agora_nao_nao_marca(self):
        self.entrar(blocks=[BLOCO]); p = self.page
        p.click('.bloco[data-bloco="b1"] .bloco-cabeca'); p.wait_for_selector('#folha-bloco', state='visible')
        p.click('#bloco-focar'); p.wait_for_selector('#tela-foco', state='visible')
        p.click('#foco-iniciar'); p.wait_for_function("window.__memdb.focos.length === 1")
        p.click('#foco-parar'); p.click('#foco-agora-nao')
        p.wait_for_function("window.__memdb.focos.length === 0")
        self.assertEqual(next(x for x in self.db()['blocks'] if x['id'] == 'b1')['status'], 'planned')

    def test_link_do_aviso_abre_a_tela(self):
        self.entrar(); p = self.page
        p.goto(self.base + '?tela=foco'); p.wait_for_selector('#tela-foco', state='visible')

    def test_tempos_das_configuracoes(self):
        self.entrar(settings={'foco_min': 50, 'pausa_min': 10, 'ciclos_longa': 3}); self.ir('foco')
        self.assertEqual(self.page.inner_text('#foco-tempo'), '50:00')
        self.assertEqual(self.page.inner_text('#foco-ciclo'), 'Ciclo 1 de 3')


class TestAjustesFoco(FocoBase):
    def test_grava_os_tempos_e_recusa_fora_da_faixa(self):
        self.entrar(); self.ir('ajustes'); p = self.page
        self.assertEqual(p.input_value('#aj-foco-min'), '25')
        p.fill('#aj-foco-min', '3'); p.click('#aj-foco-salvar')
        self.assertEqual(p.inner_text('#aj-foco-erro'), 'Foco de 5 a 120 min, pausas de 1 a 60 e de 2 a 8 ciclos.')
        p.fill('#aj-foco-min', '45'); p.fill('#aj-pausa-min', '10'); p.fill('#aj-pausa-longa-min', '20'); p.fill('#aj-ciclos-longa', '3')
        p.uncheck('#aj-foco-som'); p.click('#aj-foco-salvar')
        p.wait_for_function("window.__memdb.settings.length === 1 && window.__memdb.settings[0].foco_min === 45")
        s = self.db()['settings'][0]
        self.assertEqual((s['pausa_min'], s['pausa_longa_min'], s['ciclos_longa'], s['foco_som']), (10, 20, 3, False))


class TestFocoConcorrencia(FocoBase):
    def iniciar(self):
        self.entrar(); self.ir('foco'); p = self.page
        p.click('#foco-iniciar'); p.wait_for_function("window.__memdb.focos.length === 1")

    def test_pausa_comecada_pela_notificacao_nao_e_desfeita_pelo_app(self):
        self.iniciar(); p = self.page
        # A função começou a pausa (botão da notificação) sem o app saber: o app ainda acha que o foco está rodando.
        p.evaluate("""() => { const f = window.__memdb.focos[0];
          Object.assign(f, { fase: 'pausa', estado: 'rodando', termina_em: new Date(globalThis.__agora + 31 * 60000).toISOString() }); }""")
        self.avancar(26)
        p.wait_for_function("document.querySelector('#foco-fase').textContent === 'Pausa'")
        f = self.foco()
        self.assertEqual((f['fase'], f['estado']), ('pausa', 'rodando'))

    def test_fim_da_fase_em_outra_tela_avisa_e_abre_o_foco(self):
        self.iniciar(); p = self.page
        self.ir('semana')
        self.avancar(26)
        p.wait_for_selector('#foco-aviso', state='visible')
        self.assertIn('Foco concluído', p.inner_text('#foco-aviso'))
        p.wait_for_function("window.__memdb.focos[0].estado === 'esperando'")
        p.click('#foco-aviso-abrir')
        p.wait_for_selector('#tela-foco', state='visible')
        self.assertTrue(p.is_hidden('#foco-aviso'))
        self.assertEqual(p.inner_text('#foco-proxima'), 'Começar pausa')

    def test_foco_parado_em_outro_aparelho(self):
        self.iniciar(); p = self.page
        p.evaluate("() => { window.__memdb.focos.length = 0; }")
        p.click('#foco-pausar')
        p.wait_for_function("document.querySelector('#foco-erro').textContent === 'O foco foi parado em outro aparelho.'")
        self.assertEqual(p.inner_text('#foco-tempo'), '25:00')
        self.assertTrue(p.is_visible('#foco-iniciar'))
        self.assertEqual(self.db()['focos'], [])
