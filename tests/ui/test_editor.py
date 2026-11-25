"""Editor visual de verdade (Toast UI): esta classe não liga o modo simples."""
from harness import UITest

TRELLO = "# _**Capítulo 1: Funções**_\n\n‌\n\n- _**O que é uma função?**_\n\nÉ uma regra que liga valores.\n\n1. Função afim\n2. Função quadrática\n"

WW = '#card-notas .toastui-editor-ww-container .ProseMirror'


class TestEditorVisual(UITest):
    def setUp(self):
        super().setUp()
        # roda depois do script do harness: desfaz o modo simples
        self.page.add_init_script('window.__EDITOR_SIMPLES__ = false;')

    def card_com_notas(self, notas):
        self.login()
        self.seed('cards', [{'title': 'C', 'notes': notas}])
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')
        self.cid = self.db()['cards'][0]['id']

    def abrir_card(self):
        p = self.page
        p.evaluate(f"import('/js/telas/card.js').then(m => m.abrirCard('{self.cid}'))")
        p.wait_for_selector('#folha-card', state='visible')
        p.wait_for_selector('#card-notas .toastui-editor-ww-container .toastui-editor-contents')

    def fechar(self):
        self.page.click('#card-fechar')
        self.page.wait_for_selector('#folha-card', state='hidden')

    def test_biblioteca_carregou(self):
        self.login()
        self.assertTrue(self.page.evaluate('!!(window.toastui && window.toastui.Editor)'))

    def test_abrir_e_fechar_nao_altera(self):
        self.card_com_notas(TRELLO)
        self.abrir_card()
        self.page.click(WW)  # tocar no texto também não é alterar
        self.fechar()
        self.assertEqual(self.db()['cards'][0]['notes'], TRELLO)

    def test_formatacao_do_trello_aparece(self):
        self.card_com_notas(TRELLO)
        self.abrir_card()
        r = self.page.evaluate("""(ww) => { const c = document.querySelector(ww);
          const ul = c.querySelector('ul'), ol = c.querySelector('ol');
          return { h1: c.querySelectorAll('h1').length, ul: ul ? ul.querySelectorAll('li').length : 0,
                   ol: ol ? ol.querySelectorAll('li').length : 0,
                   forte: !!c.querySelector('h1 em strong, h1 strong em'),
                   texto: c.textContent }; }""", WW)
        self.assertEqual(r['h1'], 1)
        self.assertEqual(r['ul'], 1)
        self.assertEqual(r['ol'], 2)
        self.assertTrue(r['forte'])
        self.assertIn('Capítulo 1: Funções', r['texto'])

    def test_digitar_grava_markdown(self):
        self.card_com_notas('')
        self.abrir_card()
        p = self.page
        p.click(WW)
        p.keyboard.type('Tópico')
        p.click('#card-notas .toastui-editor-toolbar-icons.bullet-list')
        self.fechar()
        notas = self.db()['cards'][0]['notes']
        self.assertTrue(any(l.startswith(('* ', '- ')) and 'Tópico' in l for l in notas.splitlines()), notas)

    def test_script_nao_executa(self):
        # Anotação com HTML abre em modo texto (o HTML nem é exibido)...
        self.card_com_notas('<img src=x onerror="window.__xss=1">')
        p = self.page
        p.evaluate(f"import('/js/telas/card.js').then(m => m.abrirCard('{self.cid}'))")
        p.wait_for_selector('#card-notas textarea.editor-simples')
        p.wait_for_timeout(300)
        self.assertIsNone(p.evaluate('window.__xss'))
        self.fechar()
        # ...e HTML colado no editor visual passa pelo limpador da biblioteca.
        self.seed('cards', [{'title': 'D', 'notes': 'texto'}])
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.cid = next(c['id'] for c in self.db()['cards'] if c['title'] == 'D')
        self.abrir_card()
        p.click(WW)
        p.evaluate("""(ww) => { const dt = new DataTransfer();
          dt.setData('text/html', '<p>colado <img src=x onerror="window.__xss=2"></p>'); dt.setData('text/plain', 'colado');
          document.querySelector(ww).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", WW)
        p.wait_for_selector(WW + ':has-text("colado")')
        p.wait_for_timeout(300)
        self.assertIsNone(p.evaluate('window.__xss'))

    def test_interface_em_portugues_e_na_paleta(self):
        self.card_com_notas('texto')
        self.abrir_card()
        p = self.page
        self.assertEqual(p.get_attribute('#card-notas .toastui-editor-toolbar-icons.bold', 'aria-label'), 'Negrito')
        fundo = p.eval_on_selector('#card-notas .toastui-editor-defaultUI', 'e => getComputedStyle(e).borderColor')
        self.assertEqual(fundo, 'rgb(226, 205, 178)')  # --linha

    def test_colar_imagem_vira_anexo(self):
        self.card_com_notas('')
        self.abrir_card()
        p = self.page
        p.click(WW)
        p.evaluate("""(ww) => { const dt = new DataTransfer();
          dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'quadro.png', { type: 'image/png' }));
          const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          document.querySelector(ww).dispatchEvent(ev); }""", WW)
        p.wait_for_function('window.__memdb.attachments.length === 1')
        a = self.db()['attachments'][0]
        self.assertEqual((a['kind'], a['name']), ('file', 'quadro.png'))
        self.assertTrue(a['path'].startswith('u1/'))
        p.wait_for_selector(WW + ' img')
        self.fechar()
        self.assertIn(f"](anexo:{a['path']})", self.db()['cards'][0]['notes'])

    def test_quebra_forcada_nao_cola_palavras_ao_editar(self):
        self.card_com_notas('primeira  \nsegunda\n\nfim')
        self.abrir_card()
        p = self.page
        p.click(WW); p.keyboard.press('Control+End'); p.keyboard.type('!')
        self.fechar()
        notas = self.db()['cards'][0]['notes']
        self.assertNotIn('primeirasegunda', notas)
        self.assertIn('primeira', notas); self.assertIn('segunda', notas); self.assertIn('fim!', notas)

    def test_contrato_do_editor_sem_gesto_devolve_o_texto_recebido(self):
        self.login()
        r = self.page.evaluate("""async (md) => {
          const { criarEditor } = await import('/js/editor.js');
          const el = document.createElement('div'); document.body.append(el);
          let mudancas = 0;
          const ed = criarEditor(el, { markdown: md, aoMudar: () => { mudancas++; } });
          const r = { visual: !!el.querySelector('.toastui-editor-defaultUI'), igual: ed.markdown() === md, alterado: ed.alterado() };
          const outro = '- _**x**_\\n\\ntexto  \\nquebra\\n';
          ed.definir(outro);
          r.igualDepois = ed.markdown() === outro; r.alteradoDepois = ed.alterado(); r.mudancas = mudancas;
          ed.destruir(); return r; }""", TRELLO)
        self.assertEqual(r, {'visual': True, 'igual': True, 'alterado': False, 'igualDepois': True, 'alteradoDepois': False, 'mudancas': 0})

    def test_barra_inteira_cabe_em_360_px(self):
        self.page.set_viewport_size({'width': 360, 'height': 740})
        self.card_com_notas('texto')
        self.abrir_card()
        r = self.page.evaluate("""() => { const t = document.querySelector('#card-notas .toastui-editor-defaultUI-toolbar');
          const vis = (b) => b.offsetWidth > 0;
          return { visiveis: [...t.querySelectorAll('.toastui-editor-toolbar-icons')].filter(vis).map((b) => b.classList[0]),
                   largura: document.documentElement.scrollWidth }; }""")
        self.assertEqual(r['visiveis'], ['heading', 'bold', 'italic', 'bullet-list', 'ordered-list', 'link', 'image'])
        self.assertLessEqual(r['largura'], 360)

    def test_esc_fecha_o_balao_e_nao_o_card(self):
        self.page.set_viewport_size({'width': 360, 'height': 740})
        self.card_com_notas('texto')
        self.abrir_card()
        p = self.page
        p.click(WW); p.click('#card-notas .toastui-editor-toolbar-icons.link')
        aberto = "() => [...document.querySelectorAll('#card-notas .toastui-editor-popup')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right]; })"
        caixas = p.evaluate(aberto)
        self.assertEqual(len(caixas), 1)
        self.assertGreaterEqual(caixas[0][0], 0); self.assertLessEqual(caixas[0][1], 360)  # cabe na tela
        p.keyboard.press('Escape')
        self.assertEqual(p.evaluate(aberto), [])
        self.assertTrue(p.is_visible('#folha-card'))
        p.keyboard.press('Escape')
        p.wait_for_selector('#folha-card', state='hidden')

    def test_anotacao_com_html_abre_em_modo_texto_e_nao_perde_o_html(self):
        notas = 'Texto <u>sublinhado</u> e <span style="color:red">vermelho</span> fim'
        self.card_com_notas(notas)
        p = self.page
        p.evaluate(f"import('/js/telas/card.js').then(m => m.abrirCard('{self.cid}'))")
        p.wait_for_selector('#card-notas textarea.editor-simples')
        self.assertEqual(p.locator('#card-notas .toastui-editor-defaultUI').count(), 0)
        self.assertIn('Esta anotação tem HTML. Ela abre em modo texto para nada se perder.', p.inner_text('#card-notas'))
        self.assertEqual(p.input_value('#card-notas textarea'), notas)
        p.click('#card-notas textarea'); p.keyboard.press('End'); p.keyboard.type('X')
        self.fechar()
        self.assertEqual(self.db()['cards'][0]['notes'], notas + 'X')

    def test_imagem_com_colchetes_no_nome_grava_o_caminho_e_nao_a_url(self):
        self.card_com_notas('')
        self.abrir_card()
        p = self.page
        p.click(WW)
        p.evaluate("""(ww) => { const dt = new DataTransfer();
          dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'foto [1].png', { type: 'image/png' }));
          document.querySelector(ww).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", WW)
        p.wait_for_function('window.__memdb.attachments.length === 1')
        p.wait_for_selector(WW + ' img')
        self.fechar()
        a = self.db()['attachments'][0]
        notas = self.db()['cards'][0]['notes']
        self.assertEqual(a['name'], 'foto [1].png')
        self.assertIn(f"](anexo:{a['path']})", notas)
        self.assertNotIn('memoria://', notas)


class TestEditorDoFlashcard(UITest):
    def setUp(self):
        super().setUp()
        self.page.add_init_script('window.__EDITOR_SIMPLES__ = false;')

    def test_barra_com_tres_botoes_e_negrito(self):
        self.login()
        self.seed('baralhos', [{'id': 'B', 'nome': 'V', 'fator': 2.5, 'novos_dia': 20, 'revisoes_dia': 200}])
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.ir('flashcards'); p.click('.baralho-item[data-baralho="B"] .baralho-nome'); p.wait_for_selector('#baralho-tela')
        p.click('#flash-adicionar'); p.wait_for_selector('#flash-frente .toastui-editor-ww-container')
        self.assertEqual(p.locator('#flash-frente .toastui-editor-toolbar-icons:not(.more)').count(), 3)
        self.assertNotIn('Formatação', p.inner_text('#flash-janela'))
        p.click('#flash-frente .toastui-editor-ww-container .ProseMirror')
        p.click('#flash-frente .toastui-editor-toolbar-icons.bold')
        p.keyboard.type('perro')
        p.click('#flash-verso .toastui-editor-ww-container .ProseMirror'); p.keyboard.type('cachorro')
        p.click('#flash-salvar')
        p.wait_for_function("window.__memdb.flashcards.length === 1")
        f = self.db()['flashcards'][0]
        self.assertEqual((f['frente'], f['verso']), ('**perro**', 'cachorro'))

    def abrir_novo_flashcard(self):
        self.login()
        self.seed('baralhos', [{'id': 'B', 'nome': 'V', 'fator': 2.5, 'novos_dia': 20, 'revisoes_dia': 200}])
        p = self.page
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.ir('flashcards'); p.click('.baralho-item[data-baralho="B"] .baralho-nome'); p.wait_for_selector('#baralho-tela')
        p.click('#flash-adicionar'); p.wait_for_selector('#flash-frente .toastui-editor-ww-container')

    def test_linhas_vazias_nao_viram_br(self):
        self.abrir_novo_flashcard(); p = self.page
        p.click('#flash-frente .toastui-editor-ww-container .ProseMirror'); p.keyboard.type('pergunta')
        p.click('#flash-verso .toastui-editor-ww-container .ProseMirror')
        p.keyboard.type('um'); [p.keyboard.press('Enter') for _ in range(4)]; p.keyboard.type('dois')
        p.click('#flash-salvar')
        p.wait_for_function("window.__memdb.flashcards.length === 1")
        verso = self.db()['flashcards'][0]['verso']
        self.assertNotIn('<br', verso)
        self.assertIn('um', verso); self.assertIn('dois', verso)

    def test_editor_com_nome_e_barra_no_tema(self):
        self.abrir_novo_flashcard(); p = self.page
        self.assertEqual(p.get_attribute('#flash-frente .toastui-editor-ww-container .ProseMirror', 'aria-label'), 'Frente')
        self.assertEqual(p.get_attribute('#flash-verso .toastui-editor-ww-container .ProseMirror', 'aria-label'), 'Verso')
        p.evaluate("document.documentElement.dataset.tema = 'escuro'")
        fundo = p.evaluate("getComputedStyle(document.querySelector('#flash-frente .toastui-editor-defaultUI-toolbar')).backgroundColor")
        self.assertNotEqual(fundo, 'rgb(247, 249, 252)')
