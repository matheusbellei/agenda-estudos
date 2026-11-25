from harness import UITest

SEG, TER, QUA, QUI, SEX = '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'


class CalendarioBase(UITest):
    def preparar(self, **seeds):
        """Login, semeia (tabela=linhas) e recarrega para o estado ler tudo.
        As contas de posição destes testes usam o dia das 6h às 22h (o padrão do app agora é o dia inteiro)."""
        self.login()
        dia = {'day_start_min': 360, 'day_end_min': 1320}
        seeds['settings'] = [{**dia, **l} for l in seeds.get('settings', [{}])]
        for tabela, linhas in seeds.items():
            self.seed(tabela, linhas)
        self.page.reload()
        self.page.wait_for_selector('#tela-semana', state='visible')

    def bloco(self, **kw):
        return {'kind': 'commitment', 'title': 'Aula', **kw}

    def ir_para_hoje(self):
        self.ir('hoje')
        self.page.wait_for_selector('#tela-hoje .linha-do-tempo', state='visible')
        # O dia de hoje abre rolado até a hora atual; as contas de posição destes testes partem do topo.
        self.page.evaluate('window.scrollTo(0, 0)')

    def folha_aberta(self):
        self.page.wait_for_selector('#folha-bloco:not([hidden])')

    def ids_na_coluna(self, dia):
        return set(self.page.eval_on_selector_all(
            f'.dia[data-data="{dia}"] .bloco', 'els => els.map(e => e.dataset.bloco)'))

    def criar_repetido(self):
        """Compromisso segunda, quarta e sexta, 09:00-12:00, a partir de 16/11."""
        p = self.page
        p.click(f'.dia[data-data="{SEG}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        p.fill('#bloco-titulo', 'Trabalho')
        p.fill('#bloco-inicio', '09:00'); p.fill('#bloco-fim', '12:00')
        p.check('#bloco-repetir')
        p.click('.dia-rep[data-dia="3"]'); p.click('.dia-rep[data-dia="5"]')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.commitments.length === 1")


class TestSemana(CalendarioBase):
    def test_semana_vazia(self):
        self.login(); p = self.page
        self.assertEqual(p.eval_on_selector_all('#tela-semana .dia', 'els => els.map(e => e.dataset.data)'),
                         ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
        self.assertEqual(p.inner_text('#sem-titulo'), '16 a 22 de novembro')
        for dia in ('2026-11-16', '2026-11-22'):
            self.assertEqual(p.locator(f'.dia[data-data="{dia}"] .faixa').count(), 12)  # dia inteiro em faixas de 2h
            self.assertEqual(p.locator(f'.dia[data-data="{dia}"] .faixa .livre').count(), 12)
        self.assertEqual(p.locator('#fila-semana').count(), 1)

    def test_navegar_entre_semanas(self):
        self.login(); p = self.page
        p.click('#sem-prox')
        self.assertEqual(p.inner_text('#sem-titulo'), '23 a 29 de novembro')
        self.assertEqual(p.locator('.dia').first.get_attribute('data-data'), '2026-11-23')
        p.click('#sem-ant'); p.click('#sem-ant')
        self.assertEqual(p.inner_text('#sem-titulo'), '9 a 15 de novembro')
        p.click('#sem-hoje')
        self.assertEqual(p.inner_text('#sem-titulo'), '16 a 22 de novembro')

    def test_semana_entre_dois_meses(self):
        self.login(); p = self.page
        p.click('#sem-prox'); p.click('#sem-prox')
        self.assertEqual(p.inner_text('#sem-titulo'), '30 de novembro a 6 de dezembro')

    def test_tocar_na_faixa_cria_compromisso(self):
        self.login(); p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        self.assertEqual(p.input_value('#bloco-data'), TER)
        self.assertEqual(p.input_value('#bloco-inicio'), '08:00')
        self.assertEqual(p.input_value('#bloco-fim'), '10:00')
        p.fill('#bloco-titulo', 'Trabalho')
        p.click('#bloco-salvar')
        p.wait_for_selector(f'.dia[data-data="{TER}"] .bloco:has-text("Trabalho")')
        self.assertEqual(p.locator('#folha-bloco:not([hidden])').count(), 0)
        blocos = self.db()['blocks']
        self.assertEqual([(b['kind'], b['title'], b['date'], b['start_min'], b['end_min']) for b in blocos],
                         [('commitment', 'Trabalho', TER, 480, 600)])

    def test_titulo_com_html_aparece_como_texto(self):
        self.preparar(blocks=[self.bloco(date=TER, start_min=480, end_min=540, title='<b>x</b>')])
        self.assertEqual(self.page.inner_text(f'.dia[data-data="{TER}"] .bloco .bloco-titulo'), '<b>x</b>')

    def test_faixa_com_pouco_espaco_livre_nao_mostra_livre(self):
        self.preparar(blocks=[self.bloco(date=TER, start_min=480, end_min=570)])  # 90 de 120 min ocupados
        faixa = f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]'
        self.assertEqual(self.page.locator(f'{faixa} .livre').count(), 0)
        self.assertEqual(self.page.locator(f'.dia[data-data="{TER}"] .bloco').count(), 1)
        self.assertEqual(self.page.locator(f'.dia[data-data="{TER}"] .faixa[data-inicio="600"] .livre').count(), 1)

    def test_bloco_de_varias_faixas_e_uma_peca_sem_livre_por_baixo(self):
        self.preparar(commitments=[{'title': 'Trabalho', 'days': [1], 'start_min': 540, 'end_min': 720, 'valid_from': SEG}])
        p = self.page
        self.assertEqual(p.locator(f'.dia[data-data="{SEG}"] .bloco').count(), 1)
        bloco = p.locator(f'.dia[data-data="{SEG}"] .bloco').bounding_box()
        f480 = p.locator(f'.dia[data-data="{SEG}"] .faixa[data-inicio="480"]').bounding_box()
        f600 = p.locator(f'.dia[data-data="{SEG}"] .faixa[data-inicio="600"]').bounding_box()
        # começa no meio da faixa das 8h e termina no fim da das 10h
        self.assertAlmostEqual(bloco['y'], f480['y'] + f480['height'] / 2, delta=3)
        self.assertAlmostEqual(bloco['y'] + bloco['height'], f600['y'] + f600['height'], delta=3)
        self.assertEqual(p.locator(f'.dia[data-data="{SEG}"] .faixa[data-inicio="600"] .livre').count(), 0)
        livre = p.locator(f'.dia[data-data="{SEG}"] .faixa[data-inicio="480"] .livre').bounding_box()
        self.assertLessEqual(livre['y'] + livre['height'], bloco['y'] + 0.5)
        # tocar na cabeça da peça abre a folha; tocar no livre cria ali
        p.locator(f'.dia[data-data="{SEG}"] .bloco .bloco-cabeca').click()
        self.folha_aberta()
        self.assertEqual(p.input_value('#bloco-titulo'), 'Trabalho')
        p.click('#bloco-cancelar')
        p.click(f'.dia[data-data="{SEG}"] .faixa[data-inicio="480"] .livre')
        self.folha_aberta()
        self.assertEqual((p.input_value('#bloco-inicio'), p.input_value('#bloco-fim')), ('08:00', '09:00'))

    def test_bloco_de_varias_faixas_tambem_a_1280(self):
        self.page.set_viewport_size({'width': 1280, 'height': 800})
        self.preparar(commitments=[{'title': 'Trabalho', 'days': [7], 'start_min': 540, 'end_min': 720, 'valid_from': SEG}])
        dom = self.page.locator('.dia[data-data="2026-11-22"] .bloco').bounding_box()
        rolagem = self.page.locator('.semana-rolagem').bounding_box()
        self.assertEqual(self.page.locator('.dia .bloco').count(), 1)
        self.assertLessEqual(dom['x'] + dom['width'], rolagem['x'] + rolagem['width'])

    def test_blocos_empilham_na_mesma_faixa(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=540, title='Aaa'),
                              self.bloco(date=SEG, start_min=480, end_min=540, title='Bbb')])
        caixas = [self.page.locator(f'.dia[data-data="{SEG}"] .bloco').nth(i).bounding_box() for i in range(2)]
        self.assertEqual(len(caixas), 2)
        # lado a lado: mesma altura e topo, sem se cobrirem
        self.assertEqual(round(caixas[0]['y']), round(caixas[1]['y']))
        esq, dir_ = sorted(caixas, key=lambda c: c['x'])
        self.assertLessEqual(esq['x'] + esq['width'], dir_['x'] + 0.5)

    def test_compromisso_repetido(self):
        self.login(); p = self.page
        self.criar_repetido()
        for dia in (SEG, QUA, SEX):
            self.assertEqual(len(self.ids_na_coluna(dia)), 1, dia)
        self.assertEqual(len(self.ids_na_coluna(TER)), 0)
        self.assertEqual(len(self.db()['commitments']), 1)
        regra = self.db()['commitments'][0]
        self.assertEqual((regra['title'], regra['days'], regra['start_min'], regra['end_min'], regra['valid_from'], regra['valid_to']),
                         ('Trabalho', [1, 3, 5], 540, 720, SEG, None))
        self.assertEqual(self.db()['blocks'], [])
        p.click('#sem-prox')
        self.assertEqual(sum(len(self.ids_na_coluna(d)) for d in ('2026-11-23', '2026-11-25', '2026-11-27')), 3)
        # uma peça por dia, não uma por faixa
        self.assertEqual(p.locator('.dia .bloco').count(), 3)

    def test_editar_so_este_dia(self):
        self.login(); p = self.page
        self.criar_repetido()
        p.click(f'.dia[data-data="{QUA}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.fill('#bloco-inicio', '10:00')
        p.click('#bloco-salvar')
        p.click('[data-escopo="dia"]')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['date'], b['start_min'], b['end_min'], b['kind']), (QUA, 600, 720, 'commitment'))
        self.assertTrue(b['commitment_id'])
        p.wait_for_selector(f'.dia[data-data="{QUA}"] .bloco:has-text("10:00")')
        # cada dia tem uma peça só; a de quarta ficou mais baixa (10:00-12:00) que as de segunda e sexta (09:00-12:00)
        for dia in (QUA, SEG, SEX):
            self.assertEqual(p.locator(f'.dia[data-data="{dia}"] .bloco').count(), 1, dia)
        alt = lambda dia: p.locator(f'.dia[data-data="{dia}"] .bloco').bounding_box()['height']
        self.assertAlmostEqual(alt(SEG) * 2 / 3, alt(QUA), delta=2)
        self.assertEqual(self.db()['commitments'][0]['start_min'], 540)

    def test_editar_todos_muda_a_regra(self):
        self.login(); p = self.page
        self.criar_repetido()
        p.click(f'.dia[data-data="{SEX}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.fill('#bloco-titulo', 'Plantão')
        p.click('#bloco-salvar')
        p.click('[data-escopo="todos"]')
        p.wait_for_function("window.__memdb.commitments[0].title === 'Plantão'")
        self.assertEqual(self.db()['blocks'], [])
        self.assertIn('Plantão', p.inner_text(f'.dia[data-data="{SEG}"]'))

    def test_excluir_so_este_dia(self):
        self.login(); p = self.page
        self.criar_repetido()
        p.click(f'.dia[data-data="{SEX}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-excluir')
        p.click('[data-escopo="dia"]')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertTrue(self.db()['blocks'][0]['cancelled'])
        self.assertEqual(self.db()['blocks'][0]['date'], SEX)
        self.assertEqual(p.locator(f'.dia[data-data="{SEX}"] .bloco').count(), 0)
        self.assertEqual(len(self.ids_na_coluna(SEG)), 1)

    def test_excluir_este_e_os_proximos(self):
        self.login(); p = self.page
        self.criar_repetido()
        p.click(f'.dia[data-data="{QUA}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-excluir')
        p.click('[data-escopo="proximos"]')
        p.wait_for_function(f"window.__memdb.commitments[0].valid_to === '{TER}'")
        self.assertEqual(len(self.ids_na_coluna(SEG)), 1)
        self.assertEqual(len(self.ids_na_coluna(QUA)), 0)
        self.assertEqual(len(self.ids_na_coluna(SEX)), 0)

    def test_excluir_todos_apaga_a_regra_e_os_blocos_dela(self):
        self.login(); p = self.page
        self.criar_repetido()
        p.click(f'.dia[data-data="{QUA}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.fill('#bloco-inicio', '10:00'); p.click('#bloco-salvar'); p.click('[data-escopo="dia"]')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        p.click(f'.dia[data-data="{SEG}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-excluir')
        p.click('[data-escopo="todos"]')
        p.wait_for_function("window.__memdb.commitments.length === 0")
        self.assertEqual(self.db()['blocks'], [])
        self.assertEqual(p.locator('.dia .bloco').count(), 0)

    def test_fim_antes_do_inicio_e_recusado(self):
        self.login(); p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        p.fill('#bloco-titulo', 'X'); p.fill('#bloco-inicio', '10:00'); p.fill('#bloco-fim', '09:00')
        p.click('#bloco-salvar')
        self.assertEqual(p.inner_text('#bloco-erro'), 'O fim precisa ser depois do início.')
        self.assertEqual(self.db()['blocks'], [])
        self.assertEqual(p.locator('#folha-bloco:not([hidden])').count(), 1)

    def test_bloco_sem_titulo_e_sem_card_e_recusado(self):
        self.login(); p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        p.click('#bloco-salvar')
        self.assertEqual(p.inner_text('#bloco-erro'), 'Dê um título ao bloco.')
        self.assertEqual(self.db()['blocks'], [])

    def test_falha_ao_salvar_mantem_a_folha_e_o_texto(self):
        self.login(); p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        p.fill('#bloco-titulo', 'Prova importante')
        p.evaluate("window.__memFalhar = 'insert'")
        p.click('#bloco-salvar')
        p.wait_for_function("document.querySelector('#bloco-erro').textContent.length > 0")
        self.assertEqual(p.inner_text('#bloco-erro'), 'Sem conexão. Tente de novo.')
        self.assertEqual(p.locator('#folha-bloco:not([hidden])').count(), 1)
        self.assertEqual(p.input_value('#bloco-titulo'), 'Prova importante')
        self.assertEqual(self.db()['blocks'], [])
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        self.assertEqual(p.locator('#folha-bloco:not([hidden])').count(), 0)

    def test_card_pela_busca_da_titulo_e_vira_estudo(self):
        self.preparar(cards=[{'title': 'Francês avançado', 'is_fixed': False}, {'title': 'Cálculo', 'is_fixed': False}])
        p = self.page
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="480"]')
        self.folha_aberta()
        p.fill('#bloco-card-busca', 'frances')
        p.click('.card-opcao:has-text("Francês avançado")')
        self.assertEqual(p.locator('.card-opcao').count(), 0)
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b['title'], b['card_id']), ('study', 'Francês avançado', self.db()['cards'][0]['id']))
        self.assertEqual(p.locator(f'.dia[data-data="{TER}"] .bloco:has-text("Francês avançado")').count(), 1)

    def test_nome_do_dia_abre_o_dia_em_hoje(self):
        self.login(); p = self.page
        p.click('.dia-nome:has-text("Qua")')
        p.wait_for_selector('#tela-hoje', state='visible')
        self.assertIn('18 de novembro', p.inner_text('#dia-titulo'))
        self.assertEqual(p.locator('#tela-semana').is_visible(), False)

    def test_faixa_de_180_minutos(self):
        self.preparar(settings=[{'week_slot_min': 180}])
        p = self.page
        inicios = p.eval_on_selector_all(f'.dia[data-data="{SEG}"] .faixa', 'els => els.map(e => e.dataset.inicio)')
        self.assertEqual(inicios, ['360', '540', '720', '900', '1080', '1260'])


class TestCores(CalendarioBase):
    def test_cor_da_categoria_e_cor_estragada(self):
        self.preparar(categories=[{'name': 'Boa', 'color': '#3E6FB0'}, {'name': 'Ruim', 'color': 'red; background:url(x)'}])
        cats = {c['name']: c['id'] for c in self.db()['categories']}
        self.seed('blocks', [self.bloco(date=SEG, start_min=480, end_min=540, title='B', category_id=cats['Boa']),
                             self.bloco(date=SEG, start_min=600, end_min=660, title='R', category_id=cats['Ruim']),
                             self.bloco(date=SEG, start_min=720, end_min=780, title='S')])
        self.page.reload(); self.page.wait_for_selector('#tela-semana', state='visible')
        p = self.page
        cor = lambda t: p.eval_on_selector(f'.bloco:has-text("{t}")', 'e => getComputedStyle(e).backgroundColor')
        self.assertEqual(cor('B'), 'rgb(62, 111, 176)')
        self.assertEqual(cor('R'), cor('S'))
        self.assertIn('bloco-sem-categoria', p.get_attribute('.bloco:has-text("R")', 'class'))

    def test_tres_estados_do_bloco(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=540, title='P'),
                              self.bloco(date=SEG, start_min=600, end_min=660, title='D', status='done'),
                              self.bloco(date=SEG, start_min=720, end_min=780, title='M', status='missed')])
        p = self.page
        for titulo, classe, status in [('P', 'bloco-planejado', 'planned'), ('D', 'bloco-cumprido', 'done'), ('M', 'bloco-nao-feito', 'missed')]:
            el = p.locator(f'.bloco:has-text("{titulo}")')
            self.assertIn(classe, el.get_attribute('class').split())
            self.assertEqual(el.get_attribute('data-status'), status)
        self.assertEqual(p.eval_on_selector('.bloco-cumprido', 'e => getComputedStyle(e).backgroundColor'), 'rgb(91, 122, 58)')
        self.assertEqual(p.eval_on_selector('.bloco-nao-feito', 'e => getComputedStyle(e).backgroundColor'), 'rgb(181, 84, 58)')


class TestHoje(CalendarioBase):
    def test_cabecalho_e_navegacao(self):
        self.login(); p = self.page
        self.ir_para_hoje()
        self.assertEqual(p.inner_text('#dia-titulo'), 'segunda-feira, 16 de novembro')
        p.click('#dia-prox')
        self.assertEqual(p.inner_text('#dia-titulo'), 'terça-feira, 17 de novembro')
        p.click('#dia-ant'); p.click('#dia-ant')
        self.assertEqual(p.inner_text('#dia-titulo'), 'domingo, 15 de novembro')

    def test_sem_blocos_o_dia_inteiro_e_livre(self):
        self.login(); p = self.page
        self.ir_para_hoje()
        self.assertEqual(p.locator('.fatia').count(), 48)  # meia-noite a meia-noite, de 30 em 30
        self.assertEqual(p.locator('.fatia').first.get_attribute('data-inicio'), '0')
        self.assertEqual(p.locator('.linha-do-tempo .livre').count(), 1)
        self.assertEqual(p.locator('.agora-linha').count(), 1)

    def test_linha_da_hora_atual_so_no_dia_de_hoje(self):
        self.login(); p = self.page
        self.ir_para_hoje()
        self.assertEqual(p.locator('.agora-linha').count(), 1)
        p.click('#dia-prox')
        self.assertEqual(p.locator('.agora-linha').count(), 0)

    def test_blocos_que_comecam_juntos_ficam_lado_a_lado(self):
        # início com menos de 30 min de diferença: lado a lado (mais que isso vira cascata, ver test_sobreposicao)
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=600, title='Aaa'),
                              self.bloco(date=SEG, start_min=500, end_min=620, title='Bbb')])
        self.ir_para_hoje(); p = self.page
        linha = p.locator('.linha-do-tempo').bounding_box()
        a = p.locator('#tela-hoje .bloco:has-text("Aaa")').bounding_box()
        b = p.locator('#tela-hoje .bloco:has-text("Bbb")').bounding_box()
        self.assertLess(a['width'], linha['width'] * 0.75)
        self.assertLess(b['width'], linha['width'] * 0.75)
        esq, dir_ = sorted([a, b], key=lambda r: r['x'])
        self.assertLessEqual(esq['x'] + esq['width'], dir_['x'] + 0.5)

    def test_bloco_antes_do_periodo_alarga_a_linha_do_tempo(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=300, end_min=330, title='Madrugada')])
        self.ir_para_hoje(); p = self.page
        self.assertEqual(p.locator('.fatia').first.get_attribute('data-inicio'), '300')
        self.assertTrue(p.locator('#tela-hoje .bloco:has-text("Madrugada")').is_visible())

    def test_tocar_na_fatia_cria_bloco_de_uma_hora_cortado_no_proximo(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=570, end_min=630, title='Depois')])
        self.ir_para_hoje(); p = self.page
        p.click('.fatia[data-inicio="480"]')
        self.folha_aberta()
        self.assertEqual((p.input_value('#bloco-data'), p.input_value('#bloco-inicio'), p.input_value('#bloco-fim')), (SEG, '08:00', '09:00'))
        p.click('#bloco-cancelar')
        p.click('.fatia[data-inicio="510"]')
        self.folha_aberta()
        self.assertEqual((p.input_value('#bloco-inicio'), p.input_value('#bloco-fim')), ('08:30', '09:30'))
        p.click('#bloco-cancelar')
        p.click('.fatia[data-inicio="540"]')  # a fatia 09:00 está livre só até as 09:30
        self.folha_aberta()
        self.assertEqual((p.input_value('#bloco-inicio'), p.input_value('#bloco-fim')), ('09:00', '09:30'))

    def test_esticar_pela_alca_muda_o_fim(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=540, title='Aula')])
        self.ir_para_hoje(); p = self.page
        bloco_id = self.db()['blocks'][0]['id']
        alca = p.locator(f'#tela-hoje [data-bloco="{bloco_id}"] .bloco-alca').bounding_box()
        h = p.locator('.fatia[data-inicio="540"]').bounding_box()['y'] - p.locator('.fatia[data-inicio="480"]').bounding_box()['y']
        x, y = alca['x'] + alca['width'] / 2, alca['y'] + alca['height'] / 2
        p.mouse.move(x, y); p.mouse.down()
        p.mouse.move(x, y + h / 2, steps=4)
        p.mouse.move(x, y + h, steps=6)
        p.mouse.up()
        p.wait_for_function("window.__memdb.blocks[0].end_min === 600")
        b = self.db()['blocks'][0]
        self.assertEqual((b['start_min'], b['end_min']), (480, 600))
        self.assertEqual(p.locator('#folha-bloco:not([hidden])').count(), 0, 'arrastar não abre a folha')

    def test_mover_o_bloco_mantem_a_duracao(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=570, title='Aula')])
        self.ir_para_hoje(); p = self.page
        caixa = p.locator('#tela-hoje .bloco:has-text("Aula")').bounding_box()
        h = p.locator('.fatia[data-inicio="540"]').bounding_box()['y'] - p.locator('.fatia[data-inicio="480"]').bounding_box()['y']
        x, y = caixa['x'] + caixa['width'] / 2, caixa['y'] + 12
        p.mouse.move(x, y); p.mouse.down()
        p.mouse.move(x, y + h, steps=8)
        p.mouse.up()
        p.wait_for_function("window.__memdb.blocks[0].start_min === 540")
        b = self.db()['blocks'][0]
        self.assertEqual((b['start_min'], b['end_min']), (540, 630))

    def test_mover_ocorrencia_de_compromisso_repetido_grava_so_aquele_dia(self):
        self.preparar(commitments=[{'title': 'Aula', 'days': [1, 3], 'start_min': 480, 'end_min': 540, 'valid_from': SEG}])
        self.ir_para_hoje(); p = self.page
        caixa = p.locator('#tela-hoje .bloco:has-text("Aula")').bounding_box()
        h = p.locator('.fatia[data-inicio="540"]').bounding_box()['y'] - p.locator('.fatia[data-inicio="480"]').bounding_box()['y']
        x, y = caixa['x'] + caixa['width'] / 2, caixa['y'] + 12
        p.mouse.move(x, y); p.mouse.down(); p.mouse.move(x, y + h * 2, steps=8); p.mouse.up()
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['commitment_id'], b['date'], b['start_min'], b['end_min']), (self.db()['commitments'][0]['id'], SEG, 600, 660))
        self.assertEqual(self.db()['commitments'][0]['start_min'], 480)

    def test_tocar_no_bloco_abre_a_folha_para_editar_horario(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=540, title='Aula')])
        self.ir_para_hoje(); p = self.page
        p.click('#tela-hoje .bloco:has-text("Aula")')
        self.folha_aberta()
        self.assertEqual((p.input_value('#bloco-titulo'), p.input_value('#bloco-inicio'), p.input_value('#bloco-fim')), ('Aula', '08:00', '09:00'))
        p.fill('#bloco-fim', '09:45'); p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks[0].end_min === 585")

    def test_excluir_bloco_unico(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=540, title='Aula')])
        self.ir_para_hoje(); p = self.page
        p.click('#tela-hoje .bloco:has-text("Aula")')
        self.folha_aberta()
        p.click('#bloco-excluir')
        p.wait_for_function("window.__memdb.blocks.length === 0")
        self.assertEqual(p.locator('#tela-hoje .bloco').count(), 0)

    def test_bloco_ate_meia_noite_mantem_1440_ao_salvar(self):
        self.preparar(settings=[{'day_end_min': 1440}], blocks=[self.bloco(date=SEG, start_min=1380, end_min=1440, title='Tarde')])
        self.ir_para_hoje(); p = self.page
        p.click('#tela-hoje .bloco:has-text("Tarde")')
        self.folha_aberta()
        self.assertEqual(p.input_value('#bloco-fim'), '23:59')
        p.fill('#bloco-titulo', 'Tarde 2'); p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks[0].title === 'Tarde 2'")
        self.assertEqual(self.db()['blocks'][0]['end_min'], 1440)

    def test_toque_so_arrasta_depois_de_300ms_parado(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=540, title='Aula')])
        self.ir_para_hoje(); p = self.page
        h = p.locator('.fatia[data-inicio="540"]').bounding_box()['y'] - p.locator('.fatia[data-inicio="480"]').bounding_box()['y']
        js = """async ([h, espera]) => {
          const el = document.querySelector('#tela-hoje .bloco'); const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + 12;
          const ev = (tipo, yy) => new PointerEvent(tipo, { bubbles: true, pointerType: 'touch', pointerId: 7, clientX: x, clientY: yy, button: 0 });
          el.dispatchEvent(ev('pointerdown', y));
          await new Promise((ok) => setTimeout(ok, espera));
          document.dispatchEvent(ev('pointermove', y + h));
          document.dispatchEvent(ev('pointerup', y + h));
        }"""
        p.evaluate(js, [h, 100])  # mexeu antes dos 300 ms: era rolagem
        p.wait_for_timeout(200)
        self.assertEqual(self.db()['blocks'][0]['start_min'], 480)
        p.evaluate(js, [h, 400])
        p.wait_for_function("window.__memdb.blocks[0].start_min === 540")


class TestCorrecoes(CalendarioBase):
    def regra_com_blocos(self):
        """Regra seg/qua/sex 09-12 desde 16/11 com blocos gravados: seg (editado), qua (editado), sex (cancelado)."""
        self.preparar(commitments=[{'title': 'Trabalho', 'days': [1, 3, 5], 'start_min': 540, 'end_min': 720, 'valid_from': SEG}])
        rid = self.db()['commitments'][0]['id']
        self.seed('blocks', [
            self.bloco(date=SEG, start_min=600, end_min=720, title='Trabalho', commitment_id=rid),
            self.bloco(date=QUA, start_min=600, end_min=720, title='Trabalho', commitment_id=rid),
            self.bloco(date=SEX, start_min=540, end_min=720, title='Trabalho', commitment_id=rid, cancelled=True)])
        self.page.reload(); self.page.wait_for_selector('#tela-semana .dia', state='visible')

    def test_este_e_os_proximos_apaga_blocos_do_dia_em_diante_e_poe_valid_to(self):
        self.regra_com_blocos(); p = self.page
        p.click(f'.dia[data-data="{QUA}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-excluir'); p.click('[data-escopo="proximos"]')
        p.wait_for_function(f"window.__memdb.commitments[0].valid_to === '{TER}'")
        self.assertEqual([b['date'] for b in self.db()['blocks']], [SEG])

    def test_este_e_os_proximos_no_primeiro_dia_apaga_a_regra_e_os_blocos(self):
        self.regra_com_blocos(); p = self.page
        p.click(f'.dia[data-data="{SEG}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-excluir'); p.click('[data-escopo="proximos"]')
        p.wait_for_function("window.__memdb.commitments.length === 0")
        self.assertEqual(self.db()['blocks'], [])

    def test_este_e_os_proximos_com_falha_na_regra_nao_perde_blocos(self):
        self.regra_com_blocos(); p = self.page
        p.click(f'.dia[data-data="{QUA}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-excluir')
        p.evaluate("window.__memFalhar = 'update'")
        p.click('[data-escopo="proximos"]')
        p.wait_for_function("document.querySelector('#bloco-erro').textContent.length > 0")
        self.assertEqual(p.inner_text('#bloco-erro'), 'Sem conexão. Tente de novo.')
        self.assertEqual(self.db()['commitments'][0]['valid_to'], None)
        self.assertEqual(len(self.db()['blocks']), 3)
        self.assertEqual(p.locator('#folha-bloco:not([hidden])').count(), 1)

    def test_excluir_bloco_ja_marcado_pede_confirmacao(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=540, title='Feito', status='done'),
                              self.bloco(date=TER, start_min=480, end_min=540, title='Plano')])
        p = self.page
        p.click(f'.dia[data-data="{SEG}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-excluir')
        self.assertIn('Este compromisso já foi marcado. Excluir mesmo assim?', p.inner_text('#bloco-escopo'))
        self.assertEqual(len(self.db()['blocks']), 2)
        p.click('[data-escopo-voltar]')
        self.assertEqual(len(self.db()['blocks']), 2)
        p.click('#bloco-excluir'); p.click('[data-escopo="confirmar"]')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        # planejado continua sem confirmação
        p.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-excluir')
        p.wait_for_function("window.__memdb.blocks.length === 0")

    def test_editar_estudo_cujo_card_foi_excluido(self):
        self.preparar(blocks=[self.bloco(date=SEG, start_min=480, end_min=540, title='Cálculo', kind='study', card_id=None)])
        p = self.page
        p.click(f'.dia[data-data="{SEG}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.fill('#bloco-fim', '09:30'); p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks[0].end_min === 570")
        self.assertEqual(p.locator('#folha-bloco:not([hidden])').count(), 0)

    def test_so_este_dia_sem_mudar_nada_nao_grava(self):
        self.preparar(commitments=[{'title': 'Trabalho', 'days': [1], 'start_min': 540, 'end_min': 720, 'valid_from': SEG}])
        p = self.page
        p.click(f'.dia[data-data="{SEG}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-salvar'); p.click('[data-escopo="dia"]')
        p.wait_for_selector('#folha-bloco', state='hidden')
        self.assertEqual(self.db()['blocks'], [])
