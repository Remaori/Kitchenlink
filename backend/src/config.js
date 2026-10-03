// Configuración del backend. Todo sale de backend/.env (ver .env.example).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const RAIZ_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(RAIZ_BACKEND, '.env'), quiet: true });

const texto = (nombre, defecto) => {
  const v = process.env[nombre];
  return v === undefined || v === '' ? defecto : v;
};
const numero = (nombre, defecto) => {
  const v = texto(nombre);
  if (v === undefined) return defecto;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${nombre} debe ser un número (vale "${v}")`);
  return n;
};
const booleano = (nombre, defecto) => {
  const v = texto(nombre);
  return v === undefined ? defecto : ['1', 'true', 'si', 'sí', 'yes'].includes(v.toLowerCase());
};

export const config = {
  entorno: texto('NODE_ENV', 'development'),
  puerto: numero('PORT', 3000),
  bd: {
    host: texto('DB_HOST', 'localhost'),
    port: numero('DB_PORT', 5432),
    database: texto('DB_NAME', 'kitchenlink'),
    user: texto('DB_USER', 'kitchenlink_app'),
    password: texto('DB_PASSWORD'),
  },
  // Solo para los scripts de instalación (crear base, rol y esquema)
  bdAdmin: {
    host: texto('DB_HOST', 'localhost'),
    port: numero('DB_PORT', 5432),
    user: texto('DB_ADMIN_USER', 'postgres'),
    password: texto('DB_ADMIN_PASSWORD'),
  },
  zonaHoraria: texto('ZONA_HORARIA', 'America/Mexico_City'),
  jwtSecreto: texto('JWT_SECRET'),
  sesionHoras: numero('SESION_HORAS', 12),
  cookieSegura: booleano('COOKIE_SECURE', false),
  bcryptCosto: numero('BCRYPT_COSTO', 12),
  intentos: {
    maxPorUsuario: numero('INTENTOS_MAX', 5),
    maxPorEquipo: numero('INTENTOS_MAX_EQUIPO', 20),
    ventanaMin: numero('INTENTOS_VENTANA_MIN', 15),
  },
};

// Detiene el arranque con un mensaje claro si falta algo
export function validarConfig({ admin = false } = {}) {
  const faltan = [];
  if (!config.bd.password) faltan.push('DB_PASSWORD');
  if (!admin && (!config.jwtSecreto || config.jwtSecreto.length < 32)) {
    faltan.push('JWT_SECRET (mínimo 32 caracteres; `npm run env:crear` genera uno)');
  }
  if (admin && config.bdAdmin.password === undefined) faltan.push('DB_ADMIN_PASSWORD');
  if (faltan.length) {
    throw new Error('Falta configurar en backend/.env: ' + faltan.join(', '));
  }
}
