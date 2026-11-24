from test_calendario import CalendarioBase, SEG, TER, QUA, SEX

COR = '#C68B59'
ID_AULA = {n: f'i{n}' for n in (1, 2, 3)}


class PlanejarBase(CalendarioBase):
    def semear(self, concluido=True, blocos=(), **mais):
        """Lista ativa com a trilha T (Aula 1 feita, Aula 2, Aula 3) e o avulso A."""
        listas = [dict(id='L1', name='Em andamento', position=1, is_active=True)]
        if concluido:
            listas.append(dict(id='L2', name='Concluído', position=2, is_done=True))
        self.preparar(
            categories=[dict(id='cat1', name='Matemática', color=COR)],
            lists=listas,
            cards=[dict(id='cT', title='T', list_id='L1', position=1), dict(id='cA', title='A', list_id='L1', position=2)],
            card_categories=[dict(card_id='cT', category_id='cat1')],
            items=[dict(id='i1', card_id='cT', title='Aula 1', position=1, done=True),
                   dict(id='i2', card_id='cT', title='Aula 2', position=2),
                   dict(id='i3', card_id='cT', title='Aula 3', position=3)],
            blocks=list(blocos), **mais)

    def estudo(self, **kw):
        return dict(kind='study', title='T · Aula 2', card_id='cT', item_id='i2', date=TER, start_min=1080, end_min=1140, **kw)

    def item_fila(self, card, tela='semana'):
        return self.page.locator(f'#fila-{tela} .fila-item[data-card="{card}"]')

    def abrir_bloco_de_terca(self):
        self.page.click(f'.dia[data-data="{TER}"] .bloco .bloco-cabeca')
        self.folha_aberta()

    def folha_fechada(self):
        self.page.wait_for_function("document.querySelector('#folha-bloco').hidden")


class TestFila(PlanejarBase):
    def test_fila_da_semana(self):
        self.semear()
        p = self.page
        self.assertEqual(p.locator('#fila-semana .fila-item').count(), 2)
        t = self.item_fila('cT')
        self.assertIn('T', t.inner_text()); self.assertIn('Aula 2', t.inner_text())
        self.assertNotIn('Aula 1', t.inner_text())
        self.assertEqual(t.get_attribute('data-item'), 'i2')
        self.assertEqual(self.item_fila('cA').get_attribute('data-item'), '')
        self.assertEqual(p.eval_on_selector('#fila-semana .fila-item[data-card="cT"]', 'e => getComputedStyle(e).borderLeftColor'), 'rgb(198, 139, 89)')
        self.assertEqual(t.locator('.fila-etiqueta').count(), 0)

    def test_textos_digitados_viram_texto(self):
        self.semear()
        self.seed('cards', [dict(id='cX', title='<i>x</i>', list_id='L1', position=3)])
        self.page.reload(); self.page.wait_for_selector('#tela-semana', state='visible')
        self.assertEqual(self.item_fila('cX').locator('.fila-card').inner_text(), '<i>x</i>')

    def test_agendar_por_toque_na_semana(self):
        self.semear()
        p = self.page
        self.item_fila('cT').click()
        p.wait_for_selector('#escolha-faixa:not([hidden])')
        self.assertIn('Escolha um horário', p.inner_text('#escolha-faixa'))
        self.assertIn('selecionado', self.item_fila('cT').get_attribute('class'))
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="1080"]')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b['date'], b['start_min'], b['end_min'], b['title'], b['card_id'], b['item_id']),
                         ('study', TER, 1080, 1140, 'T · Aula 2', 'cT', 'i2'))
        self.assertEqual(b['category_id'], 'cat1')
        p.wait_for_selector(f'.dia[data-data="{TER}"] .bloco:has-text("T · Aula 2")')
        self.assertEqual(self.item_fila('cT').count(), 0)
        self.assertEqual(p.locator('#escolha-faixa:not([hidden])').count(), 0)

    def test_tocar_de_novo_desfaz_a_selecao(self):
        self.semear()
        p = self.page
        self.item_fila('cT').click()
        p.wait_for_selector('#escolha-faixa:not([hidden])')
        self.item_fila('cT').click()
        p.wait_for_selector('#escolha-faixa', state='hidden')
        self.assertNotIn('selecionado', self.item_fila('cT').get_attribute('class'))

    def test_cancelar_volta_ao_bloco_novo_comum(self):
        self.semear()
        p = self.page
        self.item_fila('cT').click()
        p.click('#escolha-cancelar')
        p.wait_for_selector('#escolha-faixa', state='hidden')
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="1080"]')
        self.folha_aberta()
        self.assertEqual(p.input_value('#bloco-titulo'), '')
        self.assertEqual(p.locator('#bloco-card-escolhido:not([hidden])').count(), 0)
        self.assertEqual(self.db()['blocks'], [])

    def test_semana_comeca_no_trecho_livre_da_faixa(self):
        self.semear(blocos=[dict(kind='commitment', title='Aula', date=TER, start_min=1080, end_min=1110)])
        p = self.page
        self.item_fila('cA').click()
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="1080"] .livre')
        p.wait_for_function("window.__memdb.blocks.length === 2")
        b = [x for x in self.db()['blocks'] if x['kind'] == 'study'][0]
        self.assertEqual((b['start_min'], b['end_min'], b['title'], b['item_id']), (1110, 1170, 'A', None))

    def test_agendar_por_toque_no_hoje_corta_no_proximo_bloco(self):
        self.semear(blocos=[dict(kind='commitment', title='Aula', date=SEG, start_min=600, end_min=660)])
        p = self.page
        self.ir_para_hoje()
        self.item_fila('cT', 'hoje').click()
        p.click('.fatia[data-inicio="540"]')
        p.wait_for_function("window.__memdb.blocks.length === 2")
        b = [x for x in self.db()['blocks'] if x['kind'] == 'study'][0]
        self.assertEqual((b['date'], b['start_min'], b['end_min']), (SEG, 540, 600))

    def test_agendar_por_arrasto_no_hoje(self):
        self.semear()
        p = self.page
        p.set_viewport_size({'width': 1280, 'height': 800})
        self.ir_para_hoje()
        item = self.item_fila('cT', 'hoje').bounding_box()
        alvo = p.locator('.fatia[data-inicio="600"]').bounding_box()
        x0, y0 = item['x'] + item['width'] / 2, item['y'] + item['height'] / 2
        p.mouse.move(x0, y0); p.mouse.down()
        p.mouse.move(x0 - 40, y0 + 10, steps=4)
        p.mouse.move(alvo['x'] + 200, alvo['y'] + 4, steps=8)
        p.mouse.up()
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b['date'], b['start_min'], b['end_min'], b['title'], b['item_id']), ('study', SEG, 600, 660, 'T · Aula 2', 'i2'))
        self.assertEqual(p.locator('.fila-fantasma').count(), 0)

    def test_agendar_por_arrasto_na_semana(self):
        self.semear()
        p = self.page
        p.set_viewport_size({'width': 1280, 'height': 800})
        item = self.item_fila('cA').bounding_box()
        alvo = p.locator(f'.dia[data-data="{QUA}"] .faixa[data-inicio="480"]').bounding_box()
        x0, y0 = item['x'] + item['width'] / 2, item['y'] + item['height'] / 2
        p.mouse.move(x0, y0); p.mouse.down()
        p.mouse.move(x0 - 30, y0 + 10, steps=4)
        p.mouse.move(alvo['x'] + alvo['width'] / 2, alvo['y'] + alvo['height'] / 2, steps=8)
        p.mouse.up()
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['date'], b['start_min'], b['end_min'], b['title']), (QUA, 480, 540, 'A'))

    def test_agendar_pelo_card(self):
        self.semear()
        p = self.page
        self.ir('quadro')
        p.click('.cartao-card[data-card="cT"]')
        p.click('#card-sessao')
        self.folha_aberta()
        self.assertEqual(p.inner_text('.card-escolhido-nome'), 'T')
        self.assertEqual(p.input_value('#bloco-item'), 'i2')
        self.assertIn('Aula 2', p.inner_text('#bloco-item'))
        self.assertEqual(p.input_value('#bloco-titulo'), 'T · Aula 2')
        p.click('#bloco-salvar')
        p.wait_for_function("window.__memdb.blocks.length === 1")
        b = self.db()['blocks'][0]
        self.assertEqual((b['kind'], b['card_id'], b['item_id'], b['title']), ('study', 'cT', 'i2', 'T · Aula 2'))

    def test_blocos_colados_nao_deixam_o_novo_entrar_no_segundo(self):
        self.semear(blocos=[dict(kind='commitment', title='A', date=SEG, start_min=600, end_min=660),
                            dict(kind='commitment', title='B', date=SEG, start_min=660, end_min=720)])
        p = self.page
        self.ir_para_hoje()
        self.item_fila('cA', 'hoje').click()
        p.click('.fatia[data-inicio="600"]', position={'x': 5, 'y': 3}, force=True)
        p.wait_for_function("window.__memdb.blocks.length === 3")
        b = [x for x in self.db()['blocks'] if x['kind'] == 'study'][0]
        self.assertEqual((b['start_min'], b['end_min']), (720, 780))

    def test_faixa_sem_espaco_avisa_na_faixa_de_escolha(self):
        self.semear(blocos=[dict(kind='commitment', title='Aula', date=TER, start_min=1080, end_min=1200)])
        p = self.page
        self.item_fila('cA').click()
        # a peça do bloco cobre a faixa inteira; o toque cai na borda da faixa, fora dela
        p.click(f'.dia[data-data="{TER}"] .faixa[data-inicio="1080"]', position={'x': 1, 'y': 2})
        p.wait_for_function("document.querySelector('#escolha-erro').textContent.length > 0")
        self.assertEqual(p.inner_text('#escolha-erro'), 'Sem espaço livre nesta faixa.')
        self.assertEqual(self.db()['blocks'][0]['title'], 'Aula')
        self.assertEqual(len(self.db()['blocks']), 1)
        self.assertEqual(p.locator('#escolha-faixa:not([hidden])').count(), 1)


class TestEstado(PlanejarBase):
    def test_cumprido_marca_o_item_e_avanca_a_fila(self):
        self.semear(blocos=[self.estudo()])
        p = self.page
        self.assertEqual(self.item_fila('cT').count(), 0)
        self.abrir_bloco_de_terca()
        p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok')
        self.folha_fechada()
        p.wait_for_selector(f'.dia[data-data="{TER}"] .bloco.bloco-cumprido[data-status="done"]')
        db = self.db()
        self.assertTrue([i for i in db['items'] if i['id'] == 'i2'][0]['done'])
        self.assertIsNotNone([i for i in db['items'] if i['id'] == 'i2'][0]['done_at'])
        self.assertEqual(db['blocks'][0]['status'], 'done')
        self.assertIn('Aula 3', self.item_fila('cT').inner_text())

    def test_voltar_a_planejado_desmarca_o_item(self):
        self.semear(blocos=[self.estudo()])
        p = self.page
        self.abrir_bloco_de_terca(); p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok'); self.folha_fechada()
        self.abrir_bloco_de_terca(); p.click('#bloco-planejado'); self.folha_fechada()
        p.wait_for_selector(f'.dia[data-data="{TER}"] .bloco[data-status="planned"]')
        item = [i for i in self.db()['items'] if i['id'] == 'i2'][0]
        self.assertFalse(item['done']); self.assertIsNone(item['done_at'])
        self.assertEqual(self.db()['blocks'][0]['status'], 'planned')

    def test_nao_feito_com_o_que_fiz_no_lugar(self):
        self.semear(blocos=[self.estudo()])
        p = self.page
        self.abrir_bloco_de_terca()
        self.assertEqual(p.locator('#bloco-no-lugar:visible').count(), 0)
        p.click('#bloco-nao-feito')
        p.fill('#bloco-no-lugar', 'Revisei outra matéria <b>x</b>')
        p.click('#bloco-nao-feito-ok')
        self.folha_fechada()
        p.wait_for_selector(f'.dia[data-data="{TER}"] .bloco.bloco-nao-feito')
        b = self.db()['blocks'][0]
        self.assertEqual((b['status'], b['instead_note']), ('missed', 'Revisei outra matéria <b>x</b>'))
        self.assertFalse([i for i in self.db()['items'] if i['id'] == 'i2'][0]['done'])
        self.assertEqual(self.item_fila('cT').locator('.fila-etiqueta').inner_text(), 'Reagendar')
        self.assertEqual(self.page.locator(f'.dia[data-data="{TER}"] .bloco .bloco-nota').count(), 1)
        p.click(f'.dia[data-data="{TER}"] .dia-nome')
        p.wait_for_selector('#tela-hoje .linha-do-tempo', state='visible')
        self.assertEqual(p.inner_text('#tela-hoje .bloco-nao-feito .bloco-no-lugar'), 'Revisei outra matéria <b>x</b>')

    def test_nao_feito_depois_de_cumprido_desmarca_o_item(self):
        self.semear(blocos=[self.estudo()])
        p = self.page
        self.abrir_bloco_de_terca(); p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok'); self.folha_fechada()
        self.abrir_bloco_de_terca(); p.click('#bloco-nao-feito'); p.click('#bloco-nao-feito-ok'); self.folha_fechada()
        self.assertFalse([i for i in self.db()['items'] if i['id'] == 'i2'][0]['done'])
        self.assertEqual(self.db()['blocks'][0]['status'], 'missed')

    def test_avulso_cumprido_pergunta_se_conclui_o_card(self):
        self.semear(blocos=[dict(kind='study', title='A', card_id='cA', date=TER, start_min=1080, end_min=1140)])
        p = self.page
        self.abrir_bloco_de_terca()
        p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok')
        p.wait_for_selector('#bloco-escopo:not([hidden])')
        self.assertIn('Concluir este card?', p.inner_text('#bloco-escopo'))
        self.assertEqual(self.db()['blocks'][0]['status'], 'done')
        p.click('[data-escopo="sim"]')
        self.folha_fechada()
        card = [c for c in self.db()['cards'] if c['id'] == 'cA'][0]
        self.assertEqual(card['list_id'], 'L2')
        self.assertIsNotNone(card['completed_at'])

    def test_avulso_agora_nao_mantem_o_card(self):
        self.semear(blocos=[dict(kind='study', title='A', card_id='cA', date=TER, start_min=1080, end_min=1140)])
        p = self.page
        self.abrir_bloco_de_terca(); p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok'); p.click('[data-escopo="nao"]')
        self.folha_fechada()
        card = [c for c in self.db()['cards'] if c['id'] == 'cA'][0]
        self.assertEqual(card['list_id'], 'L1'); self.assertIsNone(card['completed_at'])

    def test_cumprido_de_novo_nao_pergunta_outra_vez(self):
        self.semear(blocos=[dict(kind='study', title='A', card_id='cA', date=TER, start_min=1080, end_min=1140, status='done')])
        p = self.page
        self.abrir_bloco_de_terca(); p.click('#bloco-cumprido')
        self.folha_fechada()
        self.assertEqual(self.db()['blocks'][0]['status'], 'done')

    def test_sem_lista_de_conclusao_nao_pergunta(self):
        self.semear(concluido=False, blocos=[dict(kind='study', title='A', card_id='cA', date=TER, start_min=1080, end_min=1140)])
        p = self.page
        self.abrir_bloco_de_terca(); p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok')
        self.folha_fechada()
        self.assertEqual(self.db()['blocks'][0]['status'], 'done')

    def test_ocorrencia_de_compromisso_repetido(self):
        self.semear(commitments=[dict(title='Trabalho', days=[1, 3, 5], start_min=540, end_min=720, valid_from=SEG)])
        p = self.page
        p.click(f'.dia[data-data="{QUA}"] .bloco .bloco-cabeca')
        self.folha_aberta()
        p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok')
        self.folha_fechada()
        p.wait_for_selector(f'.dia[data-data="{QUA}"] .bloco.bloco-cumprido')
        blocos = self.db()['blocks']
        self.assertEqual([(b['status'], b['date'], b['commitment_id'] is not None) for b in blocos], [('done', QUA, True)])
        for dia in (SEG, SEX):
            self.assertEqual(p.locator(f'.dia[data-data="{dia}"] .bloco:not([data-status="planned"])').count(), 0)
            self.assertEqual(len(self.ids_na_coluna(dia)), 1)

    def test_falha_na_gravacao_mantem_a_folha_e_nao_marca_nada(self):
        self.semear(blocos=[self.estudo()])
        p = self.page
        self.abrir_bloco_de_terca()
        p.evaluate("window.__memFalhar = 'update'")
        p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok')
        p.wait_for_function("document.querySelector('#bloco-erro').textContent.length > 0")
        self.assertFalse(p.evaluate("document.querySelector('#folha-bloco').hidden"))
        self.assertIn('Sem conexão', p.inner_text('#bloco-erro'))
        self.assertEqual(self.db()['blocks'][0]['status'], 'planned')
        self.assertFalse([i for i in self.db()['items'] if i['id'] == 'i2'][0]['done'])

    def test_texto_do_que_fiz_no_lugar_nao_e_apagado_por_mudanca_de_estado(self):
        self.semear(blocos=[self.estudo(status='missed', instead_note='Revisei outra matéria')])
        p = self.page
        self.abrir_bloco_de_terca(); p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok'); self.folha_fechada()
        self.assertEqual(self.db()['blocks'][0]['instead_note'], 'Revisei outra matéria')
        self.assertEqual(p.locator(f'.dia[data-data="{TER}"] .bloco-nota').count(), 0)
        self.abrir_bloco_de_terca(); p.click('#bloco-planejado'); self.folha_fechada()
        self.assertEqual(self.db()['blocks'][0]['instead_note'], 'Revisei outra matéria')
        self.abrir_bloco_de_terca(); p.click('#bloco-nao-feito')
        self.assertEqual(p.input_value('#bloco-no-lugar'), 'Revisei outra matéria')

    def test_falha_so_no_bloco_desfaz_o_item(self):
        self.semear(blocos=[self.estudo()])
        p = self.page
        self.abrir_bloco_de_terca()
        p.evaluate("window.__memFalhar = 'update:blocks'")
        p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok')
        p.wait_for_function("document.querySelector('#bloco-erro').textContent.length > 0")
        self.assertFalse(p.evaluate("document.querySelector('#folha-bloco').hidden"))
        self.assertIn('Sem conexão', p.inner_text('#bloco-erro'))
        self.assertEqual(self.db()['blocks'][0]['status'], 'planned')
        item = [i for i in self.db()['items'] if i['id'] == 'i2'][0]
        self.assertFalse(item['done']); self.assertIsNone(item['done_at'])

    def test_falha_no_bloco_e_no_desfazer_avisa_que_o_item_ficou_marcado(self):
        self.semear(blocos=[self.estudo()])
        p = self.page
        self.abrir_bloco_de_terca()
        p.evaluate("window.__memFalhar = ['update:blocks', 'update:items']")
        p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok')
        p.wait_for_function("document.querySelector('#bloco-erro').textContent.length > 0")
        self.assertFalse(p.evaluate("document.querySelector('#folha-bloco').hidden"))
        self.assertEqual(p.inner_text('#bloco-erro'), 'Não foi possível salvar o compromisso, e o item ficou marcado como feito no card. Desmarque-o no card.')
        self.assertEqual(self.db()['blocks'][0]['status'], 'planned')
        self.assertTrue([i for i in self.db()['items'] if i['id'] == 'i2'][0]['done'])

    def test_falha_ao_concluir_o_card_diz_que_o_bloco_ficou_cumprido(self):
        self.semear(blocos=[dict(kind='study', title='A', card_id='cA', date=TER, start_min=1080, end_min=1140)])
        p = self.page
        self.abrir_bloco_de_terca(); p.click('#bloco-cumprido'); p.click('#bloco-cumprido-ok')
        p.wait_for_selector('#bloco-escopo:not([hidden])')
        p.evaluate("window.__memFalhar = 'update:cards'")
        p.click('[data-escopo="sim"]')
        p.wait_for_function("document.querySelector('#bloco-erro').textContent.length > 0")
        self.assertEqual(p.inner_text('#bloco-erro'), 'O compromisso ficou como cumprido, mas não foi possível concluir o card. Mova o card para a lista de concluídos.')
        self.assertFalse(p.evaluate("document.querySelector('#folha-bloco').hidden"))
        self.assertEqual(self.db()['blocks'][0]['status'], 'done')
        self.assertEqual([c for c in self.db()['cards'] if c['id'] == 'cA'][0]['list_id'], 'L1')

    def test_bloco_curto_no_hoje_mostra_o_icone_de_nota(self):
        self.semear(blocos=[dict(kind='commitment', title='Aula', date=SEG, start_min=600, end_min=620, status='missed', instead_note='Faltei')])
        self.ir_para_hoje()
        self.assertTrue(self.page.is_visible('#tela-hoje .bloco-curto .bloco-nota'))
        self.assertFalse(self.page.is_visible('#tela-hoje .bloco-curto .bloco-no-lugar'))
