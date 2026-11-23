import json
from harness import UITest

TABELAS = ['categories', 'lists', 'cards', 'card_categories', 'items', 'attachments', 'commitments', 'blocks', 'occurrences', 'settings']


class BackupBase(UITest):
    def abrir_com_dados(self):
        self.login(); p = self.page
        self.seed('categories', [{'id': 'cat1', 'name': 'Idiomas'}])
        self.seed('lists', [{'id': 'lis1', 'name': 'Em andamento', 'position': 1, 'is_active': True}])
        self.seed('cards', [
            {'id': 'card1', 'title': 'Gramática', 'list_id': 'lis1', 'notes': 'Anotação **privada**'},
            {'id': 'card2', 'title': 'Flashcards', 'list_id': 'lis1'},
        ])
        self.seed('card_categories', [{'card_id': 'card1', 'category_id': 'cat1'}])
        self.seed('items', [
            {'id': 'it1', 'card_id': 'card1', 'title': 'Capítulo 1'},
            {'id': 'it2', 'card_id': 'card1', 'title': 'Capítulo 2'},
        ])
        self.seed('attachments', [{'id': 'an1', 'card_id': 'card1', 'kind': 'link', 'name': 'Site', 'url': 'https://exemplo.test'}])
        self.seed('commitments', [{'id': 'com1', 'title': 'Aula', 'days': [2], 'start_min': 480, 'end_min': 540, 'valid_from': '2026-11-01'}])
        self.seed('blocks', [{'id': 'blo1', 'date': '2026-11-17', 'start_min': 600, 'end_min': 660, 'kind': 'study', 'card_id': 'card1', 'item_id': 'it1', 'title': 'Gramática'}])
        self.seed('occurrences', [{'id': 'oco1', 'card_id': 'card2', 'date': '2026-11-09', 'status': 'done'}])
        self.seed('settings', [{'day_start_min': 420}])
        p.reload(); p.wait_for_selector('#app', state='visible')
        self.ir('ajustes')
        p.wait_for_selector('#tela-ajustes', state='visible')

    def contagens(self):
        return {t: len(self.db()[t]) for t in TABELAS}

    def exportar(self):
        with self.page.expect_download() as dl:
            self.page.click('#backup-exportar')
        d = dl.value
        return d.suggested_filename, open(d.path(), 'rb').read()

    def restaurar(self, conteudo):
        p = self.page
        p.set_input_files('#backup-arquivo', files=[{'name': 'b.json', 'mimeType': 'application/json', 'buffer': conteudo}])
        p.click('#backup-importar')
        p.wait_for_function("(() => { const t = document.querySelector('#backup-resumo').textContent.trim(); return t !== '' && t !== 'Restaurando…'; })()")
        return p.inner_text('#backup-resumo')


class TestBackup(BackupBase):
    def test_exporta_arquivo_com_as_10_tabelas_e_sem_owner_id(self):
        self.abrir_com_dados()
        nome, bruto = self.exportar()
        self.assertEqual(nome, 'agenda-estudos-2026-11-16.json')
        dados = json.loads(bruto)
        self.assertEqual((dados['app'], dados['versao']), ('agenda-estudos', 1))
        self.assertEqual(sorted(dados['tabelas']), sorted(TABELAS))
        self.assertTrue(all(len(dados['tabelas'][t]) >= 1 for t in TABELAS))
        self.assertNotIn('owner_id', bruto.decode())
        self.assertIn('arquivos anexados', self.page.inner_text('#aj-backup'))

    def test_restaura_card_apagado_sem_duplicar_o_resto(self):
        self.abrir_com_dados(); p = self.page
        antes = self.contagens()
        _, bruto = self.exportar()
        p.evaluate("() => window.__TEST_STORE__.remove('cards', 'card1')")
        self.assertEqual(len(self.db()['cards']), 1)
        resumo = self.restaurar(bruto)
        self.assertIn('Restaurado', resumo)
        self.assertEqual(self.contagens(), antes)
        db = self.db()
        self.assertEqual(sorted(i['title'] for i in db['items']), ['Capítulo 1', 'Capítulo 2'])
        self.assertTrue(all(l['owner_id'] == 'u1' for t in TABELAS for l in db[t]))

    def test_restaurar_de_novo_nao_acrescenta_nada(self):
        self.abrir_com_dados()
        antes = self.contagens()
        _, bruto = self.exportar()
        resumo = self.restaurar(bruto)
        self.assertIn('Nada a restaurar', resumo)
        self.assertEqual(self.contagens(), antes)

    def test_arquivo_que_nao_e_backup_e_recusado_sem_mudar_nada(self):
        self.abrir_com_dados()
        antes = self.contagens()
        _, bruto = self.exportar()
        for conteudo in [b'{"cards": []}', b'isto nao e json', b'[]',
                         json.dumps({'app': 'agenda-estudos', 'versao': 1, 'tabelas': {'cards': {'a': 1}}}).encode(),
                         json.dumps({'app': 'outro', 'versao': 1, 'tabelas': {}}).encode(),
                         json.dumps({'app': 'agenda-estudos', 'versao': 'x', 'tabelas': {}}).encode()]:
            self.assertEqual(self.restaurar(conteudo), 'Este arquivo não é um backup deste app.')
            self.page.evaluate("() => { document.querySelector('#backup-resumo').textContent = ''; }")
        self.assertEqual(self.contagens(), antes)

    def test_linha_malformada_recusa_o_arquivo_inteiro(self):
        self.abrir_com_dados(); p = self.page
        _, bruto = self.exportar()
        dados = json.loads(bruto)
        dados['tabelas']['cards'].append({'title': 'Sem id'})
        p.evaluate("() => window.__TEST_STORE__.remove('cards', 'card1')")
        antes = self.contagens()
        self.assertEqual(self.restaurar(json.dumps(dados).encode()), 'Este arquivo não é um backup deste app.')
        self.assertEqual(self.contagens(), antes)

    def test_edicao_posterior_nao_e_sobrescrita(self):
        self.abrir_com_dados(); p = self.page
        _, bruto = self.exportar()
        p.evaluate("() => window.__TEST_STORE__.update('cards', 'card1', { title: 'Gramática revisada', notes: 'Novo texto' })")
        self.restaurar(bruto)
        card = next(c for c in self.db()['cards'] if c['id'] == 'card1')
        self.assertEqual((card['title'], card['notes']), ('Gramática revisada', 'Novo texto'))

    def test_owner_id_do_arquivo_nunca_e_usado_e_tabela_desconhecida_e_ignorada(self):
        self.abrir_com_dados(); p = self.page
        _, bruto = self.exportar()
        dados = json.loads(bruto)
        dados['tabelas']['cards'][0]['owner_id'] = 'outra-pessoa'
        dados['tabelas']['tabela_nova'] = [{'id': 'x'}]
        p.evaluate("() => window.__TEST_STORE__.remove('cards', 'card1')")
        self.restaurar(json.dumps(dados).encode())
        card = next(c for c in self.db()['cards'] if c['id'] == 'card1')
        self.assertEqual(card['owner_id'], 'u1')
        self.assertNotIn('tabela_nova', self.db())

    def test_ajustes_so_voltam_se_nao_houver_linha(self):
        self.abrir_com_dados(); p = self.page
        _, bruto = self.exportar()
        p.evaluate("() => { window.__memdb.settings.length = 0; }")
        self.restaurar(bruto)
        self.assertEqual([s['day_start_min'] for s in self.db()['settings']], [420])
        p.evaluate("() => window.__TEST_STORE__.update('settings', 'u1', { day_start_min: 300 })")
        self.restaurar(bruto)
        self.assertEqual([s['day_start_min'] for s in self.db()['settings']], [300])

    def test_texto_restaurado_nao_vira_html(self):
        self.abrir_com_dados(); p = self.page
        _, bruto = self.exportar()
        dados = json.loads(bruto)
        dados['tabelas']['cards'].append({'id': 'card9', 'title': '<img src=x onerror="window.__xss=1">', 'list_id': 'lis1', 'notes': '', 'archived': False, 'position': 0, 'is_fixed': False, 'fixed_days': []})
        self.restaurar(json.dumps(dados).encode())
        self.assertNotIn('<img', p.inner_html('#aj-backup'))
        self.ir('quadro')
        p.wait_for_selector('.coluna[data-lista]')
        self.assertIsNone(p.evaluate('window.__xss'))

    def test_falha_no_meio_avisa_e_restaurar_de_novo_completa(self):
        self.abrir_com_dados(); p = self.page
        antes = self.contagens()
        _, bruto = self.exportar()
        p.evaluate("() => window.__TEST_STORE__.remove('cards', 'card1')")
        p.evaluate("() => { window.__memFalhar = 'upsert:items'; }")
        resumo = self.restaurar(bruto)
        self.assertIn('Sem conexão', resumo)
        self.assertIn('Restaurar de novo nesta conta é seguro', resumo)
        self.assertEqual(len([c for c in self.db()['cards'] if c['id'] == 'card1']), 1)
        self.assertEqual(len(self.db()['items']), 0)
        self.restaurar(bruto)
        self.assertEqual(self.contagens(), antes)


RECUSA = 'Este backup não pode ser somado aos dados que já estão nesta conta. Restaure em uma conta vazia, ou na mesma conta de onde o backup saiu.'


class TestRestaurarEmOutraConta(BackupBase):
    def esvaziar(self):
        """Simula uma conta nova: nenhuma linha em nenhuma tabela."""
        self.page.evaluate("(ts) => ts.forEach((t) => { window.__memdb[t].length = 0; })", TABELAS)

    def test_conta_vazia_recebe_tudo(self):
        self.abrir_com_dados()
        antes = self.contagens()
        _, bruto = self.exportar()
        self.esvaziar()
        self.assertTrue(self.restaurar(bruto).startswith('Restaurado:'))
        self.assertEqual(self.contagens(), antes)

    def test_restaura_backup_antigo_sem_parent_id_e_com_subtag(self):
        self.abrir_com_dados()
        self.seed('categories', [{'id': 'sub1', 'name': 'Vocabulário', 'parent_id': 'cat1', 'icon': 'language'}])
        _, bruto = self.exportar()
        self.esvaziar()
        self.assertTrue(self.restaurar(bruto).startswith('Restaurado:'))
        cats = {c['id']: c for c in self.db()['categories']}
        self.assertEqual(cats['sub1']['parent_id'], 'cat1')
        self.assertEqual(cats['sub1']['icon'], 'language')
        self.assertIsNone(cats['cat1'].get('parent_id'))

    def test_lista_ativa_diferente_recusa_sem_gravar_nada(self):
        self.abrir_com_dados()
        _, bruto = self.exportar()
        self.esvaziar()
        self.seed('lists', [{'id': 'outra', 'name': 'Fazendo', 'position': 1, 'is_active': True}])
        antes = self.contagens()
        self.assertEqual(self.restaurar(bruto), RECUSA)
        self.assertEqual(self.contagens(), antes)

    def test_trello_id_ja_importado_recusa(self):
        self.abrir_com_dados()
        _, bruto = self.exportar()
        dados = json.loads(bruto)
        dados['tabelas']['cards'][0]['trello_id'] = 't-card1'
        self.esvaziar()
        self.seed('cards', [{'id': 'importado', 'title': 'Gramática', 'trello_id': 't-card1'}])
        antes = self.contagens()
        self.assertEqual(self.restaurar(json.dumps(dados).encode()), RECUSA)
        self.assertEqual(self.contagens(), antes)

    def test_ocorrencia_do_mesmo_dia_com_outro_id_recusa(self):
        self.abrir_com_dados(); p = self.page
        _, bruto = self.exportar()
        # Na mesma conta, a ocorrência foi apagada e outra foi gravada para o mesmo card e dia.
        p.evaluate("() => window.__TEST_STORE__.remove('occurrences', 'oco1')")
        self.seed('occurrences', [{'id': 'oco2', 'card_id': 'card2', 'date': '2026-11-09', 'status': 'missed'}])
        p.evaluate("() => window.__TEST_STORE__.remove('cards', 'card1')")
        antes = self.contagens()
        self.assertEqual(self.restaurar(bruto), RECUSA)
        self.assertEqual(self.contagens(), antes)

    def test_bloco_do_mesmo_compromisso_e_dia_com_outro_id_recusa(self):
        self.abrir_com_dados(); p = self.page
        self.seed('blocks', [{'id': 'blo2', 'date': '2026-11-17', 'start_min': 480, 'end_min': 540, 'kind': 'commitment', 'commitment_id': 'com1', 'status': 'done'}])
        _, bruto = self.exportar()
        p.evaluate("() => window.__TEST_STORE__.remove('blocks', 'blo2')")
        self.seed('blocks', [{'id': 'blo3', 'date': '2026-11-17', 'start_min': 480, 'end_min': 540, 'kind': 'commitment', 'commitment_id': 'com1', 'status': 'missed'}])
        antes = self.contagens()
        self.assertEqual(self.restaurar(bruto), RECUSA)
        self.assertEqual(self.contagens(), antes)

    def test_texto_do_cartao_backup(self):
        self.abrir_com_dados()
        texto = self.page.inner_text('#aj-backup')
        self.assertIn('Restaure em uma conta vazia ou na mesma conta de onde o backup saiu', texto)
        self.assertIn('antes de importar o Trello', texto)
        self.assertNotIn('Nada é apagado nem alterado', texto)
