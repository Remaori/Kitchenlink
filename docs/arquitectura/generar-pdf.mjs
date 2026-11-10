// Genera KitchenLink_Arquitectura.pdf a partir de arquitectura.html con el Edge de Windows
// (el mismo Playwright de las pruebas de pantalla).
//   node docs/arquitectura/generar-pdf.mjs                 (la primera vez: npm install --prefix e2e)
//   node docs/arquitectura/generar-pdf.mjs --capturas DIR  también guarda una imagen por página
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const aqui = import.meta.dirname;
const { chromium } = createRequire(path.join(aqui, '../../e2e/package.json'))('@playwright/test');

const navegador = await chromium.launch({ channel: process.env.E2E_NAVEGADOR || 'msedge' });
const pagina = await navegador.newPage({ viewport: { width: 1056, height: 816 } });
await pagina.emulateMedia({ media: 'print' });
await pagina.goto(pathToFileURL(path.join(aqui, 'arquitectura.html')).href);
await pagina.waitForSelector('body[data-listo="si"]');
const destino = path.join(aqui, 'KitchenLink_Arquitectura.pdf');
await pagina.pdf({ path: destino, preferCSSPageSize: true, printBackground: true });
console.log(`PDF: ${destino}`);

const i = process.argv.indexOf('--capturas');
if (i > 0) {
  const paginas = await pagina.locator('.pagina').all();
  for (const [n, p] of paginas.entries()) await p.screenshot({ path: path.join(process.argv[i + 1], `pagina-${n + 1}.png`) });
  console.log(`${paginas.length} capturas en ${process.argv[i + 1]}`);
}
await navegador.close();
