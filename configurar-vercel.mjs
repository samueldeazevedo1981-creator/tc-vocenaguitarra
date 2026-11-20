import {writeFile} from 'node:fs/promises';

const configured = process.env.TC_SEPARATOR_URL?.trim();
let endpoint = './api/roformer';
if (configured) {
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/api/roformer' || url.search || url.hash) {
    throw new Error('TC_SEPARATOR_URL precisa ser um endereço HTTPS terminado em /api/roformer.');
  }
  endpoint = url.href;
}
await writeFile(new URL('./dist/separador-config.js',import.meta.url),
  `export const separatorApiUrl = ${JSON.stringify(endpoint)};\n`);
