import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
for (const match of [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {
  const js = await readFile(resolve(root, `dist/${match[1].replace(/^\//, '')}`), 'utf8');
  html = html.replace(match[0], `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
}
for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const css = await readFile(resolve(root, `dist/${match[1].replace(/^\//, '')}`), 'utf8');
  html = html.replace(match[0], `<style>${css}</style>`);
}
const favicon = await readFile(resolve(root, 'public/favicon.svg'), 'utf8');
html = html.replace(/href="(?:\.\/|\/)favicon\.svg"/, `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`);
await writeFile(resolve(root, 'EmberProtocol.html'), html);
console.log(`Standalone offline game: EmberProtocol.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} kB)`);
