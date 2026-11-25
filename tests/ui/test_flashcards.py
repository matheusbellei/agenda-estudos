from harness import UITest

HOJE = '2026-11-16'
BAR = {'id': 'B', 'nome': 'Vocabulário', 'fator': 2.5, 'novos_dia': 20, 'revisoes_dia': 200}


def F(id, frente, verso='', tipo='basico', **kw):
    return dict({'id': id, 'baralho_id': 'B', 'card_id': None, 'tipo': tipo, 'frente': frente, 'verso': verso, 'criado_em': f'2026-11-01T00:00:{len(id):02d}Z'}, **kw)


class FlashBase(UITest):
    def entrar(self, **seeds):
        self.login()
        for t, linhas in seeds.items(): self.seed(t, linhas)
        self.page.reload(); self.page.wait_for_selector('#app', state='visible')

    def abrir_baralho(self, bid='B'):
        p = self.page
        self.ir('flashcards'); p.click(f'.baralho-item[data-baralho="{bid}"] .baralho-nome'); p.wait_for_selector('#baralho-tela')

    def estudar_baralho(self, bid='B'):
        p = self.page
        self.ir('flashcards'); p.click(f'.baralho-item[data-baralho="{bid}"] .baralho-estudar'); p.wait_for_selector('#tela-flash-sessao', state='visible')

    def lados(self):
        return {(l['flashcard_id'], l['lado']): l for l in self.db()['flash_lados']}


class TestBaralhos(FlashBase):
    def test_criar_baralho_e_flashcards_dos_quatro_tipos(self):
        self.entrar(); p = self.page
        self.ir('flashcards')
        p.click('#flash-novo-baralho'); p.fill('#baralho-novo-nome', 'Espanhol'); p.click('#baralho-criar')
        p.wait_for_function("window.__memdb.baralhos.length === 1")
        bid = self.db()['baralhos'][0]['id']
        p.wait_for_selector('#baralho-tela')
        for tipo, frente, verso in [('basico', 'perro', 'cachorro'), ('invertido', 'gato', 'gato'), ('lacuna', 'Yo {{tuve}} un perro', ''), ('digitar', 'cachorro', 'Perro')]:
            p.click('#flash-adicionar'); p.wait_for_selector('#flash-janela')
            p.select_option('#flash-tipo', tipo); p.fill('#flash-frente', frente)
            p.fill('#flash-resposta' if tipo == 'digitar' else '#flash-verso', verso)
            p.click('#flash-salvar'); p.wait_for_selector('#flash-janela', state='detached')
        fs = self.db()['flashcards']
        self.assertEqual(sorted(f['tipo'] for f in fs), ['basico', 'digitar', 'invertido', 'lacuna'])
        self.assertTrue(all(f['baralho_id'] == bid and f['card_id'] is None for f in fs))
        self.assertEqual(p.locator('#baralho-tela .flash-item').count(), 4)
        self.ir('flashcards')
        self.assertIn('5 novos', p.inner_text(f'.baralho-item[data-baralho="{bid}"] .baralho-contagem'))
        self.assertEqual(p.inner_text('#menu-flash-contador'), '5')

    def test_lacuna_sem_marcacao_da_erro(self):
        self.entrar(baralhos=[BAR]); self.abrir_baralho(); p = self.page
        p.click('#flash-adicionar'); p.select_option('#flash-tipo', 'lacuna'); p.fill('#flash-frente', 'sem lacuna'); p.click('#flash-salvar')
        self.assertEqual(p.inner_text('#flash-erro'), 'Marque pelo menos uma lacuna com {{ }}.')

    def test_formulario_sem_texto_de_formatacao_e_previa_so_na_lacuna(self):
        self.entrar(baralhos=[BAR]); self.abrir_baralho(); p = self.page
        p.click('#flash-adicionar'); p.wait_for_selector('#flash-janela')
        self.assertNotIn('Formatação', p.inner_text('#flash-janela'))
        self.assertFalse(p.is_visible('#flash-previa'))
        p.select_option('#flash-tipo', 'lacuna'); p.fill('#flash-frente', 'Yo {{tuve}} un perro')
        self.assertTrue(p.is_visible('#flash-previa'))
        self.assertNotIn('tuve', p.inner_text('#flash-previa').split('\n')[0])

    def test_digitar_usa_caixa_de_uma_linha(self):
        self.entrar(baralhos=[BAR]); self.abrir_baralho(); p = self.page
        p.click('#flash-adicionar'); p.select_option('#flash-tipo', 'digitar')
        self.assertTrue(p.is_visible('#flash-resposta'))
        self.assertFalse(p.is_visible('#flash-verso'))
        self.assertEqual(p.get_attribute('#flash-resposta', 'type'), 'text')
        p.fill('#flash-frente', 'cachorro'); p.fill('#flash-resposta', 'Perro'); p.click('#flash-salvar')
        p.wait_for_function("window.__memdb.flashcards.length === 1")
        self.assertEqual(self.db()['flashcards'][0]['verso'], 'Perro')
        # editar abre com a resposta na caixa certa
        p.click('.flash-item .flash-editar')
        self.assertEqual(p.input_value('#flash-resposta'), 'Perro')

    def test_salvar_ajustes_mostra_que_salvou_e_atualiza_o_nome(self):
        self.entrar(baralhos=[BAR]); self.abrir_baralho(); p = self.page
        p.click('.baralho-ajustes summary')
        p.fill('#baralho-nome', 'Vocabulário 2'); p.fill('#baralho-novos', '7'); p.click('#baralho-salvar')
        p.wait_for_function("window.__memdb.baralhos[0].novos_dia === 7")
        p.wait_for_function("document.querySelector('#baralho-salvo').textContent === 'Ajustes salvos.'")
        self.assertIn('Vocabulário 2', p.inner_text('#baralho-tela h2'))
        self.assertTrue(p.evaluate("document.querySelector('.baralho-ajustes').open"))
        self.assertEqual(p.input_value('#baralho-novos'), '7')
        # mudar de novo apaga o aviso antigo
        p.fill('#baralho-novos', '8')
        self.assertEqual(p.inner_text('#baralho-salvo'), '')

    def test_ajustes_do_baralho_e_excluir(self):
        self.entrar(baralhos=[BAR], flashcards=[F('a', 'x', 'y')]); self.abrir_baralho(); p = self.page
        p.click('.baralho-ajustes summary')
        p.fill('#baralho-fator', '3'); p.fill('#baralho-novos', '5'); p.fill('#baralho-revisoes', '50'); p.click('#baralho-salvar')
        p.wait_for_function("window.__memdb.baralhos[0].novos_dia === 5")
        b = self.db()['baralhos'][0]
        self.assertEqual((float(b['fator']), b['revisoes_dia']), (3.0, 50))
        p.fill('#baralho-fator', '9'); p.click('#baralho-salvar')
        self.assertIn('fator', p.inner_text('#baralho-erro'))
        p.click('#baralho-excluir')
        p.wait_for_function("window.__memdb.baralhos.length === 0 && window.__memdb.flashcards.length === 0")
        self.assertTrue(p.is_visible('#flash-novo-baralho'))

    def test_trocar_invertido_por_basico_apaga_o_lado_do_verso(self):
        self.entrar(baralhos=[BAR], flashcards=[F('i', 'perro', 'cachorro', 'invertido')],
                    flash_lados=[{'id': 'l1', 'flashcard_id': 'i', 'lado': 'frente', 'intervalo': 3, 'vence': '2026-11-20', 'introduzido_em': '2026-11-10'},
                                 {'id': 'l2', 'flashcard_id': 'i', 'lado': 'verso', 'intervalo': 3, 'vence': '2026-11-20', 'introduzido_em': '2026-11-10'}])
        self.abrir_baralho(); p = self.page
        p.click('.flash-item[data-flash="i"] .flash-editar'); p.wait_for_selector('#flash-janela')
        p.select_option('#flash-tipo', 'basico'); p.click('#flash-salvar')
        p.wait_for_function("window.__memdb.flash_lados.length === 1")
        self.assertEqual(self.db()['flash_lados'][0]['lado'], 'frente')
        self.assertEqual(self.db()['flashcards'][0]['tipo'], 'basico')

    def test_link_do_aviso_abre_a_tela(self):
        self.entrar(); p = self.page
        p.goto(self.base + '?tela=flashcards'); p.wait_for_selector('#tela-flashcards', state='visible')


class TestSessao(FlashBase):
    def test_acertar_grava_lado_e_resumo_do_dia(self):
        self.entrar(baralhos=[BAR], flashcards=[F('a', '**perro**', 'cachorro')]); p = self.page
        self.estudar_baralho()
        self.assertEqual(p.inner_text('#sessao-restantes'), '1 restante')
        self.assertEqual(p.inner_html('#sessao-pergunta'), '<p><strong>perro</strong></p>')
        p.click('#sessao-mostrar'); self.assertIn('cachorro', p.inner_text('#sessao-resposta'))
        p.click('#sessao-acertei')
        p.wait_for_selector('#sessao-fim', state='visible')
        self.assertEqual(p.inner_text('#sessao-fim .sessao-resumo'), '1 revisado · 100% de acerto')
        l = self.lados()[('a', 'frente')]
        self.assertEqual((l['intervalo'], l['vence'], l['introduzido_em']), (1, '2026-11-17', HOJE))
        d = self.db()['flash_dias'][0]
        self.assertEqual((d['data'], d['revisados'], d['acertos']), (HOJE, 1, 1))
        self.ir('flashcards'); self.assertTrue(p.is_hidden('#menu-flash-contador'))

    def test_errei_volta_no_fim_e_toque_duplo_conta_uma_vez(self):
        self.entrar(baralhos=[BAR], flashcards=[F('a', 'uno', 'um'), F('bb', 'dos', 'dois')]); p = self.page
        self.estudar_baralho()
        p.click('#sessao-mostrar'); p.dblclick('#sessao-errei')
        self.assertEqual(p.inner_text('#sessao-restantes'), '2 restantes')
        self.assertIn('dos', p.inner_text('#sessao-pergunta'))
        p.click('#sessao-mostrar'); p.click('#sessao-acertei')
        self.assertIn('uno', p.inner_text('#sessao-pergunta'))
        p.click('#sessao-mostrar'); p.click('#sessao-acertei')
        p.wait_for_selector('#sessao-fim', state='visible')
        self.assertEqual(p.inner_text('#sessao-fim .sessao-resumo'), '2 revisados · 50% de acerto')
        d = self.db()['flash_dias'][0]
        self.assertEqual((d['revisados'], d['acertos']), (2, 1))
        self.assertEqual(self.lados()[('a', 'frente')]['intervalo'], 1)

    def test_lacuna_e_digitar(self):
        self.entrar(baralhos=[BAR], flashcards=[F('l', 'Yo {{tuve}} un perro', '', 'lacuna'), F('dd', 'cachorro', 'Perro', 'digitar')]); p = self.page
        self.estudar_baralho()
        self.assertEqual(p.inner_text('#sessao-pergunta'), 'Yo [...] un perro')
        p.click('#sessao-mostrar'); self.assertEqual(p.inner_html('#sessao-resposta .sessao-texto'), '<p>Yo <mark>tuve</mark> un perro</p>')
        p.click('#sessao-acertei')
        self.assertTrue(p.is_visible('#sessao-digitado')); self.assertTrue(p.is_hidden('#sessao-mostrar'))
        p.fill('#sessao-digitado', 'perro'); p.click('#sessao-conferir')
        self.assertIn('Errou', p.inner_text('#sessao-resultado')); self.assertIn('Perro', p.inner_text('#sessao-resultado'))
        p.click('#sessao-continuar')
        p.fill('#sessao-digitado', 'Perro'); p.click('#sessao-conferir')
        self.assertIn('Acertou', p.inner_text('#sessao-resultado'))
        p.click('#sessao-continuar'); p.wait_for_selector('#sessao-fim', state='visible')

    def test_texto_com_html_aparece_literal(self):
        self.entrar(baralhos=[BAR], flashcards=[F('x', '<img src=x onerror="window.__xss=1">', 'y')]); p = self.page
        self.estudar_baralho()
        self.assertEqual(p.locator('#sessao-pergunta img').count(), 0)
        self.assertIn('<img', p.inner_text('#sessao-pergunta'))
        self.assertIsNone(p.evaluate('window.__xss || null'))


class TestFlashNoCard(FlashBase):
    def test_adicionar_estudar_e_apagar_o_card(self):
        self.entrar(lists=[{'id': 'L1', 'name': 'Em andamento', 'position': 1, 'is_active': True}],
                    cards=[{'id': 'K', 'title': 'Curso', 'list_id': 'L1', 'position': 1}]); p = self.page
        self.ir('quadro'); p.click('.cartao-card[data-card="K"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')
        self.assertFalse(p.is_visible('#card-flash-estudar'))
        p.click('#card-flash-adicionar'); p.fill('#flash-frente', 'pergunta'); p.fill('#flash-verso', 'resposta'); p.click('#flash-salvar')
        p.wait_for_function("window.__memdb.flashcards.length === 1")
        f = self.db()['flashcards'][0]
        self.assertEqual((f['card_id'], f['baralho_id']), ('K', None))
        self.assertIn('Estudar (1)', p.inner_text('#card-flash-estudar'))
        self.assertEqual(p.inner_text('#menu-flash-contador'), '1')
        p.click('#card-flash-estudar'); p.wait_for_selector('#tela-flash-sessao', state='visible')
        p.click('#sessao-mostrar'); p.click('#sessao-acertei'); p.wait_for_selector('#sessao-fim', state='visible')
        self.assertEqual(len(self.db()['flash_lados']), 1)
        self.ir('quadro'); p.click('.cartao-card[data-card="K"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')
        p.click('#card-excluir')
        p.wait_for_function("window.__memdb.cards.length === 0")
        self.assertEqual(self.db()['flashcards'], []); self.assertEqual(self.db()['flash_lados'], [])


class TestSessaoRobusta(FlashBase):
    def test_falha_no_resumo_do_dia_nao_trava_nem_dobra_o_intervalo(self):
        self.entrar(baralhos=[BAR], flashcards=[F('a', 'uno', 'um')],
                    flash_lados=[{'id': 'l1', 'flashcard_id': 'a', 'lado': 'frente', 'intervalo': 4, 'vence': HOJE, 'introduzido_em': '2026-11-01'}]); p = self.page
        self.estudar_baralho()
        p.evaluate("window.__memFalharSempre = 'rpc'")
        p.click('#sessao-mostrar'); p.click('#sessao-acertei')
        p.wait_for_selector('#sessao-fim', state='visible')
        self.assertEqual(self.lados()[('a', 'frente')]['intervalo'], 10)

    def test_enter_com_resposta_vazia_nao_conta(self):
        self.entrar(baralhos=[BAR], flashcards=[F('d', 'cachorro', 'Perro', 'digitar')]); p = self.page
        self.estudar_baralho()
        p.press('#sessao-digitado', 'Enter')
        self.assertTrue(p.is_hidden('#sessao-resultado'))
        self.assertEqual(self.db()['flash_lados'], [])

    def test_estudar_pelo_card_volta_para_o_card(self):
        self.entrar(lists=[{'id': 'L1', 'name': 'Em andamento', 'position': 1, 'is_active': True}],
                    cards=[{'id': 'K', 'title': 'Curso', 'list_id': 'L1', 'position': 1}],
                    flashcards=[F('a', 'p', 'r', baralho_id=None, card_id='K')]); p = self.page
        self.ir('quadro'); p.click('.cartao-card[data-card="K"] .cartao-titulo'); p.wait_for_selector('#folha-card', state='visible')
        p.click('#card-flash-estudar'); p.wait_for_selector('#tela-flash-sessao', state='visible')
        p.click('#sessao-sair')
        p.wait_for_selector('#folha-card', state='visible')

    def test_flashcards_de_cards_aparecem_na_tela_e_contador_tem_nome_legivel(self):
        self.entrar(lists=[{'id': 'L1', 'name': 'Em andamento', 'position': 1, 'is_active': True}],
                    cards=[{'id': 'K', 'title': 'Curso de Python', 'list_id': 'L1', 'position': 1}],
                    flashcards=[F('a', 'p', 'r', baralho_id=None, card_id='K')]); p = self.page
        self.ir('flashcards')
        item = p.locator('#flash-dos-cards .flash-card-item[data-card="K"]')
        self.assertIn('Curso de Python', item.inner_text())
        item.locator('.flash-card-estudar').click()
        p.wait_for_selector('#tela-flash-sessao', state='visible')
        self.assertEqual(p.get_attribute('#menu-flash-contador', 'aria-label'), '1 para hoje')


def BG(id, nome, pai=None, grupo=False):
    return {'id': id, 'nome': nome, 'fator': 2.5, 'novos_dia': 20, 'revisoes_dia': 200, 'e_grupo': grupo, 'pai_id': pai}


class TestGrupos(FlashBase):
    def test_criar_grupo_e_colocar_baralho_dentro(self):
        self.entrar(baralhos=[BAR]); p = self.page
        self.ir('flashcards')
        p.click('#flash-novo-grupo'); p.fill('#grupo-nome', 'Idiomas'); p.click('#grupo-salvar')
        p.wait_for_function("window.__memdb.baralhos.some(b => b.e_grupo && b.nome === 'Idiomas')")
        gid = next(b['id'] for b in self.db()['baralhos'] if b['e_grupo'])
        self.abrir_baralho()
        p.click('.baralho-ajustes summary')
        self.assertEqual(p.locator('#baralho-pai option').all_inner_texts(), ['Nenhum', 'Idiomas'])
        p.select_option('#baralho-pai', gid); p.click('#baralho-salvar')
        p.wait_for_function(f"window.__memdb.baralhos.find(b => b.id === 'B').pai_id === '{gid}'")
        self.ir('flashcards')
        self.assertEqual(p.locator(f'.baralho-grupo[data-baralho="{gid}"] .baralho-filhos .baralho-item[data-baralho="B"]').count(), 1)

    def test_grupo_soma_e_estuda_os_baralhos_de_dentro(self):
        self.entrar(baralhos=[BG('G', 'Idiomas', grupo=True), BG('A', 'Alemão', 'G'), BG('X', 'Basco', 'G'), BG('F', 'Fora')],
                    flashcards=[F('a1', 'eins', baralho_id='A'), F('x1', 'bat', baralho_id='X'), F('f1', 'fora', baralho_id='F')]); p = self.page
        self.ir('flashcards')
        self.assertIn('2 novos', p.inner_text('.baralho-grupo[data-baralho="G"] > .baralho-grupo-linha'))
        p.click('.baralho-grupo[data-baralho="G"] > .baralho-grupo-linha .grupo-estudar')
        p.wait_for_selector('#tela-flash-sessao', state='visible')
        vistos = []
        for _ in range(2):
            vistos.append(p.inner_text('#sessao-pergunta'))
            p.click('#sessao-mostrar'); p.click('#sessao-acertei')
        p.wait_for_selector('#sessao-fim', state='visible')
        self.assertEqual(sorted(vistos), ['bat', 'eins'])

    def test_abrir_e_fechar_o_grupo_fica_lembrado(self):
        self.entrar(baralhos=[BG('G', 'Idiomas', grupo=True), BG('A', 'Alemão', 'G')]); p = self.page
        self.ir('flashcards')
        filhos = '.baralho-grupo[data-baralho="G"] .baralho-filhos'
        self.assertTrue(p.is_visible(filhos))
        p.click('.baralho-grupo[data-baralho="G"] .grupo-abrir')
        self.assertFalse(p.is_visible(filhos))
        self.assertTrue(p.evaluate("document.activeElement.matches('.baralho-grupo[data-baralho=\"G\"] .grupo-abrir')"))
        self.assertEqual(p.get_attribute('.baralho-grupo[data-baralho="G"] .grupo-abrir', 'aria-expanded'), 'false')
        p.reload(); p.wait_for_selector('#app', state='visible'); self.ir('flashcards')
        self.assertFalse(p.is_visible(filhos))

    def test_grupo_dentro_de_grupo_e_destinos_sem_ciclo(self):
        self.entrar(baralhos=[BG('G', 'Idiomas', grupo=True), BG('E', 'Espanhol', 'G', grupo=True), BG('V', 'Verbos', 'E')]); p = self.page
        self.ir('flashcards')
        self.assertEqual(p.locator('.baralho-grupo[data-baralho="G"] .baralho-grupo[data-baralho="E"] .baralho-item[data-baralho="V"]').count(), 1)
        p.click('.baralho-grupo[data-baralho="G"] > .baralho-grupo-linha .grupo-nome')
        p.wait_for_selector('#grupo-janela')
        self.assertEqual(p.locator('#grupo-pai option').all_inner_texts(), ['Nenhum'])
        p.fill('#grupo-nome', 'Línguas'); p.click('#grupo-salvar')
        p.wait_for_function("window.__memdb.baralhos.find(b => b.id === 'G').nome === 'Línguas'")

    def test_excluir_grupo_sobe_o_que_estava_dentro(self):
        self.entrar(baralhos=[BG('G', 'Idiomas', grupo=True), BG('E', 'Espanhol', 'G', grupo=True), BG('V', 'Verbos', 'E')]); p = self.page
        self.ir('flashcards')
        p.click('.baralho-grupo[data-baralho="E"] > .baralho-grupo-linha .grupo-nome'); p.wait_for_selector('#grupo-janela')
        p.evaluate("window.confirm = () => true")
        p.click('#grupo-excluir')
        p.wait_for_function("!window.__memdb.baralhos.some(b => b.id === 'E')")
        self.assertEqual(next(b for b in self.db()['baralhos'] if b['id'] == 'V')['pai_id'], 'G')


class TestLimitesDoGrupo(FlashBase):
    def test_novo_baralho_ja_escolhe_o_grupo(self):
        self.entrar(baralhos=[BG('G', 'Idiomas', grupo=True)]); p = self.page
        self.ir('flashcards')
        p.click('#flash-novo-baralho')
        self.assertEqual(p.locator('#baralho-novo-pai option').all_inner_texts(), ['Nenhum', 'Idiomas'])
        p.fill('#baralho-novo-nome', 'Verbos'); p.select_option('#baralho-novo-pai', 'G'); p.click('#baralho-criar')
        p.wait_for_function("window.__memdb.baralhos.some(b => b.nome === 'Verbos' && b.pai_id === 'G')")

    def test_limites_do_grupo_valem_e_travam_o_baralho(self):
        self.entrar(baralhos=[BG('G', 'Idiomas', grupo=True), BG('A', 'Alemão', 'G')],
                    flashcards=[F(f'a{i}', f'p{i}', baralho_id='A') for i in range(1, 6)]); p = self.page
        self.ir('flashcards')
        self.assertIn('5 novos', p.inner_text('.baralho-item[data-baralho="A"] .baralho-contagem'))
        p.click('.baralho-grupo[data-baralho="G"] > .baralho-grupo-linha .grupo-nome'); p.wait_for_selector('#grupo-janela')
        self.assertFalse(p.is_visible('#grupo-novos'))
        p.check('#grupo-limites'); p.fill('#grupo-novos', '2'); p.fill('#grupo-revisoes', '50'); p.click('#grupo-salvar')
        p.wait_for_function("window.__memdb.baralhos.find(b => b.id === 'G').limites_do_grupo === true")
        g = next(b for b in self.db()['baralhos'] if b['id'] == 'G')
        self.assertEqual((g['novos_dia'], g['revisoes_dia']), (2, 50))
        p.wait_for_selector('#grupo-janela', state='detached')
        self.assertIn('2 novos', p.inner_text('.baralho-item[data-baralho="A"] .baralho-contagem'))
        self.abrir_baralho('A')
        p.click('.baralho-ajustes summary')
        self.assertTrue(p.is_disabled('#baralho-novos')); self.assertTrue(p.is_disabled('#baralho-revisoes'))
        self.assertIn('Definido pelo grupo Idiomas: 2 novos e 50 revisões por dia', p.inner_text('#baralho-sobreposto'))
        # salvar o baralho não apaga os números próprios dele
        p.fill('#baralho-fator', '3'); p.click('#baralho-salvar')
        p.wait_for_function("Number(window.__memdb.baralhos.find(b => b.id === 'A').fator) === 3")
        a = next(b for b in self.db()['baralhos'] if b['id'] == 'A')
        self.assertEqual((a['novos_dia'], a['revisoes_dia']), (20, 200))

    def test_baralho_sem_grupo_com_limites_nao_tem_aviso(self):
        self.entrar(baralhos=[BAR]); self.abrir_baralho(); p = self.page
        p.click('.baralho-ajustes summary')
        self.assertFalse(p.is_disabled('#baralho-novos'))
        self.assertEqual(p.locator('#baralho-sobreposto:visible').count(), 0)

    def test_campo_vazio_nao_vira_zero(self):
        self.entrar(baralhos=[BG('G', 'Idiomas', grupo=True)]); p = self.page
        self.ir('flashcards')
        p.click('.baralho-grupo[data-baralho="G"] > .baralho-grupo-linha .grupo-nome'); p.wait_for_selector('#grupo-janela')
        p.check('#grupo-limites'); p.fill('#grupo-novos', ''); p.click('#grupo-salvar')
        self.assertIn('Use de 0 a 999', p.inner_text('#grupo-erro'))
        self.assertFalse(next(b for b in self.db()['baralhos'] if b['id'] == 'G')['limites_do_grupo'])

    def test_grupo_de_dentro_avisa_que_o_de_cima_manda(self):
        g = dict(BG('G', 'Idiomas', grupo=True), limites_do_grupo=True, novos_dia=5)
        self.entrar(baralhos=[g, BG('E', 'Espanhol', 'G', grupo=True)]); p = self.page
        self.ir('flashcards')
        p.click('.baralho-grupo[data-baralho="E"] > .baralho-grupo-linha .grupo-nome'); p.wait_for_selector('#grupo-janela')
        self.assertIn('Os limites do grupo Idiomas valem no lugar destes', p.inner_text('#grupo-janela'))

    def test_trocar_o_grupo_no_baralho_atualiza_a_trava_na_hora(self):
        g = dict(BG('G', 'Idiomas', grupo=True), limites_do_grupo=True, novos_dia=5, revisoes_dia=50)
        self.entrar(baralhos=[g, BG('A', 'Alemão')]); p = self.page
        self.abrir_baralho('A'); p.click('.baralho-ajustes summary')
        self.assertFalse(p.is_disabled('#baralho-novos'))
        p.select_option('#baralho-pai', 'G')
        self.assertTrue(p.is_disabled('#baralho-novos'))
        self.assertIn('Definido pelo grupo Idiomas', p.inner_text('#baralho-sobreposto'))
        self.assertEqual(p.get_attribute('#baralho-novos', 'aria-describedby'), 'baralho-sobreposto')
        p.select_option('#baralho-pai', '')
        self.assertFalse(p.is_disabled('#baralho-novos'))
        self.assertFalse(p.is_visible('#baralho-sobreposto'))
