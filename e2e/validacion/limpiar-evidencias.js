// Antes de la validación: e2e/evidencias/ vacía, para que solo queden las capturas de esta corrida
import fs from 'node:fs';
import path from 'node:path';

export default function limpiarEvidencias() {
  fs.rmSync(path.join(import.meta.dirname, '..', 'evidencias'), { recursive: true, force: true });
}
