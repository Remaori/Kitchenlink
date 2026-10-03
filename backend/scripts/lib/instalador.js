// Crea la base, el usuario de la aplicación y aplica los scripts de /database.
// Lo usan `npm run db:instalar` y las pruebas automáticas (base kitchenlink_pruebas).
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { config, RAIZ_BACKEND } from '../../src/config.js';

export const CARPETA_SQL = path.resolve(RAIZ_BACKEND, '..', 'database');
export const ROL_APP = 'kitchenlink_app';

async function leerSql(nombre) {
  const texto = await fs.readFile(path.join(CARPETA_SQL, nombre), 'utf8');
  return texto.replace(/^﻿/, '');
}

async function conectarAdmin(database) {
  const cliente = new pg.Client({
    ...config.bdAdmin,
    database,
    application_name: 'kitchenlink-instalador',
    connectionTimeoutMillis: 8000,
  });
  await cliente.connect();
  return cliente;
}

async function ejecutarArchivo(database, archivo) {
  const cliente = await conectarAdmin(database);
  try {
    const r = await cliente.query(await leerSql(archivo));
    return Array.isArray(r) ? r : [r];
  } finally {
    await cliente.end();
  }
}

/**
 * @param {object} op
 * @param {string}  op.nombre    base a crear/usar
 * @param {boolean} op.recrear   borrar la base y crearla de nuevo (UTF8)
 * @param {boolean} op.demo      cargar los datos de las pantallas + contraseñas demo
 * @param {(msg:string)=>void} op.log
 */
export async function instalarBase({ nombre = config.bd.database, recrear = false, demo = true, log = () => {} } = {}) {
  if (config.bd.user !== ROL_APP) {
    throw new Error(`DB_USER debe ser "${ROL_APP}" (es el rol al que 02_permisos_app.sql da permisos).`);
  }
  const resumen = { base: nombre, pasos: [] };
  const paso = (t) => { resumen.pasos.push(t); log('  ✓ ' + t); };

  // 1) Rol y base (conectado a "postgres")
  const admin = await conectarAdmin('postgres');
  try {
    const v = await admin.query('SHOW server_version');
    resumen.versionServidor = v.rows[0].server_version;
    const existeRol = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROL_APP])).rowCount > 0;
    const pass = admin.escapeLiteral(config.bd.password);
    if (existeRol) {
      await admin.query(`ALTER ROLE ${ROL_APP} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${pass}`);
      paso(`Rol ${ROL_APP}: ya existía, contraseña sincronizada con .env`);
    } else {
      await admin.query(`CREATE ROLE ${ROL_APP} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${pass}`);
      paso(`Rol ${ROL_APP} creado (sin privilegios de administrador)`);
    }

    const ident = admin.escapeIdentifier(nombre);
    let existe = (await admin.query('SELECT pg_encoding_to_char(encoding) AS cod FROM pg_database WHERE datname = $1', [nombre])).rows[0];
    if (existe && recrear) {
      await admin.query(`DROP DATABASE ${ident} WITH (FORCE)`);
      paso(`Base ${nombre} borrada (--recrear)`);
      existe = undefined;
    }
    if (!existe) {
      await admin.query(`CREATE DATABASE ${ident} ENCODING 'UTF8' TEMPLATE template0`);
      paso(`Base ${nombre} creada en UTF8`);
      resumen.codificacion = 'UTF8';
    } else {
      resumen.codificacion = existe.cod;
      paso(`Base ${nombre}: ya existía (${existe.cod})`);
      if (existe.cod !== 'UTF8') {
        resumen.aviso = `La base está en ${existe.cod}. Recomendado: npm run db:instalar -- --recrear (la deja en UTF8).`;
      }
    }
  } finally {
    await admin.end();
  }

  // 2) Esquema v3 y permisos del rol de la aplicación
  await ejecutarArchivo(nombre, '01_esquema_v3.sql');
  paso('01_esquema_v3.sql · 19 tablas, 22 vistas, reglas del negocio');
  await ejecutarArchivo(nombre, '02_permisos_app.sql');
  paso('02_permisos_app.sql · permisos mínimos para kitchenlink_app');

  // 3) Datos de las pantallas (prueba de coherencia) y contraseñas demo
  if (demo) {
    const r = await ejecutarArchivo(nombre, '03_prueba_coherencia_v3.sql');
    const filas = r[r.length - 1].rows;
    const total = filas[0];
    resumen.prueba = { resultado: total.Resultado, detalle: total['Obtenido (base)'] };
    resumen.fallas = filas.filter((f) => f.Resultado === 'FALLA');
    paso(`03_prueba_coherencia_v3.sql · ${total['Esperado (pantalla)']} → ${total.Resultado}`);
    const d = await ejecutarArchivo(nombre, '04_contrasenas_demo.sql');
    resumen.usuariosDemo = d[d.length - 1].rows;
    paso('04_contrasenas_demo.sql · contraseñas de demostración');
  }
  return resumen;
}
