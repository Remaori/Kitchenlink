// Contraseñas: política de 01b y hash bcrypt (nunca se guarda en claro)
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// Las mismas tres reglas que muestra la pantalla 01b, más el límite de
// bcrypt: solo usa los primeros 72 bytes, así que más largo no se acepta.
export function revisarPolitica(nueva, confirmacion) {
  const n = typeof nueva === 'string' ? nueva : '';
  const reglas = [
    { regla: 'longitud', texto: 'Al menos 8 caracteres', cumple: n.length >= 8 },
    { regla: 'numero', texto: 'Incluye al menos un número', cumple: /\d/.test(n) },
    { regla: 'coinciden', texto: 'Las dos contraseñas coinciden', cumple: n.length > 0 && n === confirmacion },
    { regla: 'maximo', texto: 'Máximo 72 caracteres', cumple: Buffer.byteLength(n, 'utf8') <= 72 },
  ];
  return { valida: reglas.every((r) => r.cumple), reglas };
}

export const hashear = (contrasena) => bcrypt.hash(contrasena, config.bcryptCosto);
export const comparar = (contrasena, hash) => bcrypt.compare(contrasena, hash);

// Hash de relleno: si el usuario no existe se compara contra este, para que
// la respuesta tarde lo mismo y no se pueda adivinar qué usuarios existen.
let hashRelleno;
export async function compararConRelleno(contrasena) {
  hashRelleno ??= await bcrypt.hash(crypto.randomBytes(16).toString('hex'), config.bcryptCosto);
  await bcrypt.compare(contrasena, hashRelleno);
  return false;
}

// Contraseña temporal para restablecer o dar de alta (la cambia al entrar)
export function generarTemporal() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digitos = '23456789';
  const elegir = (abc, n) => Array.from({ length: n }, () => abc[crypto.randomInt(abc.length)]).join('');
  return elegir(letras, 6) + elegir(digitos, 4);
}
