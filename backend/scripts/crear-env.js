// npm run env:crear · crea backend/.env a partir de .env.example con
// JWT_SECRET y DB_PASSWORD generados al azar. No sobrescribe un .env existente.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, '.env');
if (fs.existsSync(destino)) {
  console.log('backend/.env ya existe; no lo toqué. Si quieres empezar de cero, bórralo y vuelve a ejecutar.');
  process.exit(0);
}
const azar = (n) => crypto.randomBytes(n).toString('base64url');
const texto = fs.readFileSync(path.join(raiz, '.env.example'), 'utf8')
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${azar(48)}`)
  .replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${azar(18)}`);
fs.writeFileSync(destino, texto);
console.log('Listo: backend/.env creado con JWT_SECRET y DB_PASSWORD al azar.');
console.log('Falta un dato: abre backend/.env y escribe en DB_ADMIN_PASSWORD la contraseña del usuario postgres.');
