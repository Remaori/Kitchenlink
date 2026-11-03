// 05a · Mis mesas (abrir comanda) · 05b · Comanda
//
// El ciclo de la comanda (pantalla 12) lo hace cumplir la base: una comanda
// abierta por mesa; quien la abre queda como su mesero y solo él (o el
// gerente) la trabaja; lo capturado queda "Sin enviar" hasta presionar Enviar,
// que crea un envío nuevo; el precio y el nombre se congelan al capturar; con
// productos sin enviar no se pide la cuenta; cancelar exige registrar la
// cancelación con motivo y autorización del gerente (tg_comanda_*, tg_envio_*,
// tg_detalle_*, tg_cancelacion_*).
import { consulta, conTransaccion } from '../db.js';
import { revisor } from '../validacion.js';
import { exigirMesaActiva, noExiste, regla, siguienteFolio } from './comun.js';
import { quienAutoriza, tienePermisoEnBase } from './autorizacion.js';

const SQL_LISTA = `
  SELECT c.id, c.folio, c.mesa_id, m.numero AS mesa, c.numero_personas, c.mesero_usuario_id, u.nombre_completo AS mesero,
         c.estado::text AS estado, e.etiqueta AS estado_etiqueta, e.tono AS estado_tono,
         c.abierta_en, c.cuenta_pedida_en, c.cerrada_en, c.cancelada_en, c.nota_general,
         fn_total_comanda(c.id) AS total, fn_pagado_comanda(c.id) AS pagado,
         (SELECT count(*) FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado <> 'cancelado')::int AS productos,
         (SELECT count(*) FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado = 'sin_enviar')::int AS sin_enviar,
         (SELECT COALESCE(sum(d.cantidad), 0) FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado = 'listo')::int AS listos,
         (SELECT count(*) FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado IN ('por_preparar','en_preparacion'))::int AS en_cocina,
         (SELECT count(*) FROM envio v WHERE v.comanda_id = c.id)::int AS envios,
         (SELECT count(*) FROM cancelacion k WHERE k.comanda_id = c.id)::int AS cancelaciones,
         r.nombre_cliente AS reservacion, l.nombre_cliente AS lista_espera
  FROM comanda c
  JOIN mesa m ON m.id = c.mesa_id
  JOIN usuario u ON u.id = c.mesero_usuario_id
  LEFT JOIN etiqueta_estado e ON e.dominio = 'estado_comanda' AND e.valor = c.estado::text
  LEFT JOIN reservacion r ON r.id = c.reservacion_id
  LEFT JOIN lista_espera l ON l.id = c.lista_espera_id`;

/** Comandas abiertas o por cobrar. `meseroId` limita a las de ese mesero (el mesero ve las suyas). */
export async function listar({ meseroId = null }) {
  const { rows } = await consulta(
    `${SQL_LISTA} WHERE c.estado IN ('abierta','por_cobrar') AND ($1::bigint IS NULL OR c.mesero_usuario_id = $1)
     ORDER BY m.numero`, [meseroId]);
  return { comandas: rows };
}

/** 05b · La comanda completa: encabezado, productos por envío y lo "Sin enviar" */
export async function detalle(id, actorId) {
  const { rows: [c] } = await consulta(
    `SELECT r.*, c.mesa_id, c.mesero_usuario_id, c.reservacion_id, c.lista_espera_id, c.cuenta_pedida_en,
            c.cerrada_en, c.cancelada_en, fn_tasa_comanda(c.id) AS tasa_impuesto,
            m.capacidad AS mesa_capacidad, rv.nombre_cliente AS reservacion, l.nombre_cliente AS lista_espera
     FROM v_comanda_resumen r
     JOIN comanda c ON c.id = r.id
     JOIN mesa m ON m.id = c.mesa_id
     LEFT JOIN reservacion rv ON rv.id = c.reservacion_id
     LEFT JOIN lista_espera l ON l.id = c.lista_espera_id
     WHERE r.id = $1`, [id]);
  if (!c) throw noExiste('esa comanda');
  const [{ rows: lineas }, { rows: pagos }, { rows: cancelaciones }, { rows: eventos }, puedeSupervisar] = await Promise.all([
    consulta(
      `SELECT v.id, v.seccion, v.envio_numero, v.enviado_en, v.es_adicional, v.envio_texto, v.cantidad, v.nombre_producto,
              v.importe, v.destino::text AS destino, v.tiempo, v.nota, v.detalle_texto, v.estado::text AS estado, v.estado_etiqueta, v.estado_tono,
              d.producto_id, d.precio_unitario, d.capturado_en, d.listo_en, d.entregado_en, d.cancelado_en
       FROM v_comanda_detalle v JOIN detalle_comanda d ON d.id = v.id
       WHERE v.comanda_id = $1
       ORDER BY (d.envio_id IS NULL), v.envio_numero, d.id`, [id]),
    consulta('SELECT metodo_etiqueta, monto, monto_recibido, cambio, referencia, registrado_en, cobro FROM v_ticket_pagos WHERE comanda_id = $1', [id]),
    consulta('SELECT hora, tipo_etiqueta, producto, cantidad, motivo, monto, solicito, autorizo FROM v_cancelaciones WHERE comanda = $1', [c.folio]),
    consulta(
      `SELECT b.accion, b.detalle, b.registrado_en, u.nombre_completo AS hecho_por,
              CASE b.accion
                WHEN 'cambiar_mesa' THEN 'Cambió de la Mesa ' || (SELECT numero FROM mesa WHERE id = (b.detalle->>'de')::bigint)
                                         || ' a la Mesa ' || (SELECT numero FROM mesa WHERE id = (b.detalle->>'a')::bigint)
                WHEN 'transferir' THEN 'Se transfirió de ' || (SELECT nombre_completo FROM usuario WHERE id = (b.detalle->>'de')::bigint)
                                         || ' a ' || (SELECT nombre_completo FROM usuario WHERE id = (b.detalle->>'a')::bigint)
                WHEN 'cancelar_pre_ticket' THEN 'Caja canceló el pre-ticket: la comanda volvió a Abierta'
                WHEN 'cambiar_personas' THEN 'Personas: ' || (b.detalle->>'de') || ' → ' || (b.detalle->>'a')
                ELSE replace(b.accion, '_', ' ') END AS texto
       FROM bitacora b LEFT JOIN usuario u ON u.id = b.usuario_id
       WHERE b.entidad = 'comanda' AND b.entidad_id = $1 ORDER BY b.registrado_en, b.id`, [id]),
    actorId ? tienePermisoEnBase(actorId, 'comanda.cancelar') : false,
  ]);
  return {
    comanda: c,
    lineas,
    pagos,
    cancelaciones,
    eventos,
    puede: {
      trabajar: c.estado === 'abierta' && (c.mesero_usuario_id === actorId || puedeSupervisar),
      supervisar: puedeSupervisar,
    },
  };
}

const exigirComanda = async (c, id) => {
  const { rows: [x] } = await c.query(
    `SELECT c.id, c.folio, c.estado::text AS estado, c.mesero_usuario_id, c.numero_personas, c.mesa_id, m.numero AS mesa
     FROM comanda c JOIN mesa m ON m.id = c.mesa_id WHERE c.id = $1 FOR UPDATE OF c`, [id]);
  if (!x) throw noExiste('esa comanda');
  return x;
};

// --------------------------------------------------------------- Abrir comanda

/** Quiénes pueden atender comandas (para "Transferir" y para que el gerente abra a nombre de alguien) */
export async function meseros() {
  const { rows } = await consulta(
    `SELECT u.id, u.nombre_completo, r.nombre AS rol FROM usuario u JOIN rol r ON r.id = u.rol_id
     WHERE fn_tiene_permiso(u.id, 'comanda.abrir') ORDER BY (r.es_sistema), u.nombre_completo`);
  return rows;
}

/**
 * 05a · "Abrir comanda": queda a nombre de quien la abre (el gerente puede
 * abrirla a nombre de un mesero). Si la hostess sentó al grupo, la base la
 * vincula sola a su reservación o lista de espera.
 */
export async function abrir(cuerpo, actorId) {
  const v = revisor();
  const mesaId = v.id('mesa_id', cuerpo?.mesa_id, { etiqueta: 'La mesa' });
  const personas = v.entero('numero_personas', cuerpo?.numero_personas, { etiqueta: 'El número de personas', obligatorio: true, min: 1, max: 30 });
  const nota = v.texto('nota_general', cuerpo?.nota_general, { etiqueta: 'La nota de mesa', max: 300 });
  const mesero = cuerpo?.mesero_usuario_id ? v.id('mesero_usuario_id', cuerpo.mesero_usuario_id, { etiqueta: 'El mesero' }) : actorId;
  v.terminar();
  const id = await conTransaccion(actorId, async (c) => {
    const folio = await siguienteFolio(c, { tabla: 'comanda', clavePrefijo: 'folio.comanda.prefijo', prefijoDefecto: 'C-', digitos: 4 });
    await exigirMesaActiva(c, mesaId);
    const { rows: [k] } = await c.query(
      `INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas, nota_general)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`, [folio, mesaId, mesero, personas, nota]);
    return k.id;
  });
  return detalle(id, actorId);
}

// ------------------------------------------------------ Capturar y enviar

function revisarLinea(cuerpo, { nueva }) {
  const v = revisor();
  const d = {
    producto_id: nueva ? v.id('producto_id', cuerpo?.producto_id, { etiqueta: 'El producto' }) : undefined,
    cantidad: v.entero('cantidad', cuerpo?.cantidad ?? 1, { etiqueta: 'La cantidad', min: 1, max: 99 }),
    tiempo: v.entero('tiempo', cuerpo?.tiempo ?? 1, { etiqueta: 'El tiempo', min: 1, max: 3 }),
    nota: v.texto('nota', cuerpo?.nota, { etiqueta: 'La nota', max: 250 }),
  };
  v.terminar();
  return d;
}

/**
 * 05b · Tocar un producto: se agrega a "Sin enviar". Si ya está sin enviar,
 * en el mismo tiempo y sin nota, se suma a esa línea. El nombre y el precio
 * los pone la base desde el menú (no los manda la aplicación).
 */
export async function agregarProducto(id, cuerpo, actorId) {
  const d = revisarLinea(cuerpo, { nueva: true });
  await conTransaccion(actorId, async (c) => {
    await exigirComanda(c, id);
    const { rows: [igual] } = d.nota ? { rows: [] } : await c.query(
      `SELECT id FROM detalle_comanda WHERE comanda_id = $1 AND producto_id = $2 AND tiempo = $3 AND nota IS NULL AND estado = 'sin_enviar'
       ORDER BY id DESC LIMIT 1`, [id, d.producto_id, d.tiempo]);
    if (igual) {
      await c.query('UPDATE detalle_comanda SET cantidad = cantidad + $1 WHERE id = $2', [d.cantidad, igual.id]);
    } else {
      // nombre_producto y precio_unitario los pone tg_detalle_agregar (snapshot del menú)
      await c.query('INSERT INTO detalle_comanda (comanda_id, producto_id, cantidad, tiempo, nota) VALUES ($1, $2, $3, $4, $5)',
        [id, d.producto_id, d.cantidad, d.tiempo, d.nota]);
    }
  });
  return detalle(id, actorId);
}

const exigirLinea = async (c, id, linea) => {
  const { rows: [l] } = await c.query('SELECT id, nombre_producto, estado::text AS estado FROM detalle_comanda WHERE id = $1 AND comanda_id = $2 FOR UPDATE', [linea, id]);
  if (!l) throw noExiste('ese producto en la comanda');
  return l;
};

/** "Nota": cantidad, tiempo y nota de un producto Sin enviar */
export async function editarProducto(id, linea, cuerpo, actorId) {
  const d = revisarLinea(cuerpo, { nueva: false });
  await conTransaccion(actorId, async (c) => {
    await exigirLinea(c, id, linea);
    await c.query('UPDATE detalle_comanda SET cantidad = $1, tiempo = $2, nota = $3 WHERE id = $4', [d.cantidad, d.tiempo, d.nota, linea]);
  });
  return detalle(id, actorId);
}

/** "Quitar": solo lo Sin enviar (lo enviado se cancela con autorización) */
export async function quitarProducto(id, linea, actorId) {
  await conTransaccion(actorId, async (c) => {
    await exigirLinea(c, id, linea);
    await c.query('DELETE FROM detalle_comanda WHERE id = $1', [linea]);
  });
  return detalle(id, actorId);
}

/** "Enviar N productos nuevos": crea el envío; cocina y barra lo ven como tarjetas */
export async function enviar(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    await exigirComanda(c, id);
    await c.query('SELECT fn_enviar_comanda($1, $2)', [id, actorId]);
  });
  return detalle(id, actorId);
}

/** El mesero marca como entregado lo que cocina o barra dejó Listo (12, paso 6) */
export async function entregar(id, cuerpo, actorId) {
  const v = revisor();
  const linea = v.id('linea_id', cuerpo?.linea_id, { etiqueta: 'El producto', obligatorio: false }); // sin linea_id: todo lo listo
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    await exigirComanda(c, id);
    const { rowCount } = await c.query(
      "UPDATE detalle_comanda SET estado = 'entregado' WHERE comanda_id = $1 AND estado = 'listo' AND ($2::bigint IS NULL OR id = $2)", [id, linea]);
    if (!rowCount) throw regla('No hay platillos listos por entregar en esta comanda.');
  });
  return detalle(id, actorId);
}

/** "Pedir la cuenta": la comanda pasa a Por cobrar y caja recibe el aviso; la base congela el IVA */
export async function pedirCuenta(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const k = await exigirComanda(c, id);
    if (k.estado !== 'abierta') throw regla(`La comanda ${k.folio} ya está ${k.estado === 'por_cobrar' ? 'Por cobrar' : k.estado}.`);
    await c.query("UPDATE comanda SET estado = 'por_cobrar', cuenta_pedida_por_usuario_id = $1 WHERE id = $2", [actorId, id]);
  });
  return detalle(id, actorId);
}

/** Nota de mesa (alergias): sale en rojo en la comanda y en cada tarjeta de cocina */
export async function cambiarNota(id, cuerpo, actorId) {
  const v = revisor();
  const nota = v.texto('nota_general', cuerpo?.nota_general, { etiqueta: 'La nota de mesa', max: 300 });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    await exigirComanda(c, id);
    await c.query('UPDATE comanda SET nota_general = $1 WHERE id = $2', [nota, id]);
  });
  return detalle(id, actorId);
}

// ------------------------------------------------------- Operaciones de mesas

/** "Cambiar mesa": solo a una mesa libre; la anterior se libera (y queda en bitácora) */
export async function cambiarMesa(id, cuerpo, actorId) {
  const v = revisor();
  const mesaId = v.id('mesa_id', cuerpo?.mesa_id, { etiqueta: 'La mesa nueva' });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    const k = await exigirComanda(c, id);
    if (k.mesa_id === mesaId) throw regla(`La comanda ${k.folio} ya está en la Mesa ${k.mesa}.`);
    const m = await exigirMesaActiva(c, mesaId);
    // Si no está libre, la base explica por qué (tg_comanda_reglas); si está libre, que quepan
    if (m.estado === 'libre' && k.numero_personas > m.capacidad) {
      throw regla(`La Mesa ${m.numero} es para ${m.capacidad} personas y en la comanda hay ${k.numero_personas}.`);
    }
    await c.query('UPDATE comanda SET mesa_id = $1 WHERE id = $2', [mesaId, id]);
  });
  return detalle(id, actorId);
}

/** "Cambiar personas": se ajusta si llegó o se fue alguien (queda en bitácora) */
export async function cambiarPersonas(id, cuerpo, actorId) {
  const v = revisor();
  const personas = v.entero('numero_personas', cuerpo?.numero_personas, { etiqueta: 'El número de personas', obligatorio: true, min: 1, max: 30 });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    const k = await exigirComanda(c, id);
    if (k.numero_personas === personas) return;
    const { rows: [m] } = await c.query('SELECT numero, capacidad FROM mesa WHERE id = $1', [k.mesa_id]);
    if (personas > m.capacidad) {
      throw regla(`La Mesa ${m.numero} es para ${m.capacidad} personas: para ${personas}, cámbialos a una mesa más grande.`);
    }
    await c.query('UPDATE comanda SET numero_personas = $1 WHERE id = $2', [personas, id]);
    await c.query("SELECT fn_bitacora('comanda', $1, 'cambiar_personas', $2::jsonb)", [id, JSON.stringify({ de: k.numero_personas, a: personas })]);
  });
  return detalle(id, actorId);
}

/** "Transferir": su mesero (cambio de turno) o el gerente la pasan a otro mesero; queda en bitácora */
export async function transferir(id, cuerpo, actorId) {
  const v = revisor();
  const mesero = v.id('mesero_usuario_id', cuerpo?.mesero_usuario_id, { etiqueta: 'El mesero' });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    const k = await exigirComanda(c, id);
    if (k.mesero_usuario_id === mesero) throw regla(`La comanda ${k.folio} ya es de esa persona.`);
    await c.query('UPDATE comanda SET mesero_usuario_id = $1 WHERE id = $2', [mesero, id]);
  });
  return detalle(id, actorId);
}

// ------------------------------------------------------------ Cancelaciones

function revisarCancelacion(cuerpo) {
  const v = revisor();
  const motivo = v.texto('motivo', cuerpo?.motivo, { etiqueta: 'El motivo', obligatorio: true, min: 3, max: 250 });
  v.terminar();
  return motivo;
}

/** Cancelar un producto ya enviado: con motivo y autorización (la base lo cancela al registrar) */
export async function cancelarProducto(id, linea, cuerpo, actorId, ip) {
  const motivo = revisarCancelacion(cuerpo);
  const autoriza = await quienAutoriza(actorId, cuerpo?.autoriza, ip);
  await conTransaccion(actorId, async (c) => {
    await exigirComanda(c, id);
    await exigirLinea(c, id, linea);
    await c.query(
      `INSERT INTO cancelacion (tipo, comanda_id, detalle_comanda_id, motivo, solicitado_por_usuario_id, autorizado_por_usuario_id)
       VALUES ('producto', $1, $2, $3, $4, $5)`, [id, linea, motivo, actorId, autoriza]);
  });
  return detalle(id, actorId);
}

/** "Cancelar comanda · requiere autorización del gerente": la mesa se libera */
export async function cancelarComanda(id, cuerpo, actorId, ip) {
  const motivo = revisarCancelacion(cuerpo);
  const autoriza = await quienAutoriza(actorId, cuerpo?.autoriza, ip);
  await conTransaccion(actorId, async (c) => {
    await exigirComanda(c, id);
    await c.query(
      `INSERT INTO cancelacion (tipo, comanda_id, motivo, solicitado_por_usuario_id, autorizado_por_usuario_id)
       VALUES ('comanda', $1, $2, $3, $4)`, [id, motivo, actorId, autoriza]);
  });
  return detalle(id, actorId);
}
