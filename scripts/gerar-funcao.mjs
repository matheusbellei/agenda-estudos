// Junta a função "lembretes" (entrada + serviço + web push + regras do app) num arquivo único,
// supabase/functions/lembretes/index.ts, que é o que se cola no editor de Edge Functions do Supabase.
// Uso: npm run gerar-funcao   (o teste tests/funcao/gerada.test.mjs confere que o arquivo está em dia)
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
export async function gerar() {
  const r = await build({
    entryPoints: [`${raiz}supabase/functions/lembretes/entrada.js`], bundle: true, format: 'esm', platform: 'neutral',
    target: 'es2022', write: false, legalComments: 'none', charset: 'utf8',
  });
  const aviso = '// Arquivo gerado por scripts/gerar-funcao.mjs a partir de supabase/functions/lembretes/*.js e js/regras/*.js.\n'
    + '// Para mudar, edite os arquivos de origem e rode: npm run gerar-funcao\n// @ts-nocheck\n';
  return aviso + r.outputFiles[0].text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(`${raiz}supabase/functions/lembretes/index.ts`, await gerar());
  console.log('supabase/functions/lembretes/index.ts atualizado');
}
