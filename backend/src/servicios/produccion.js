// 06 · Panel de cocina y barra
//
// Cada tarjeta es un envío del mesero para un destino (cocina o barra; lo
// decide la categoría del producto). Los botones de la tarjeta mueven todos
// sus productos un paso: Por preparar → En preparación → Listo → Entregado
// (fn_avanzar_envio). Cocina y barra no cierran nada: solo cambian el estado
// de los platillos. "Entregado" también lo marca el mesero (12, paso 6).
import { consulta, conTransaccion } from '../db.js';
import { revisor } from '../validacion.js';
import { noExiste } from './comun.js';

const COLUMNAS = ['por_preparar', 'en_preparacion', 'listo'];
const SIGUIENTE = { por_preparar: 'en_preparacion', en_preparacion: 'listo', listo: 'entregado' };

/** Tarjetas del panel de un destino, por columna, con sus productos */
export async function panel(destino) {
  const [{ rows: tarjetas }, { rows: lineas }] = await Promise.all([
    consulta(
      `SELECT p.envio_id, p.destino::text AS destino, p.mesa, p.envio_numero, p.es_adicional, p.columna, p.estado::text AS estado,
              p.mesero, p.enviado_en, p.minutos_desde_envio, p.minutos_desde_listo, p.piezas::int AS piezas, p.nota_mesa, p.accion,
              e.comanda_id, c.folio,
              (SELECT max(d.listo_en) FROM detalle_comanda d JOIN producto x ON x.id = d.producto_id JOIN categoria k ON k.id = x.categoria_id
                WHERE d.envio_id = p.envio_id AND k.destino = p.destino AND d.estado = 'listo') AS listo_en,
              (SELECT min(d.preparacion_en) FROM detalle_comanda d JOIN producto x ON x.id = d.producto_id JOIN categoria k ON k.id = x.categoria_id
                WHERE d.envio_id = p.envio_id AND k.destino = p.destino AND d.estado = 'en_preparacion') AS preparacion_en
       FROM v_panel_produccion p JOIN envio e ON e.id = p.envio_id JOIN comanda c ON c.id = e.comanda_id
       WHERE p.destino = $1 ORDER BY p.enviado_en, p.envio_id`, [destino]),
    // Todos los productos de los envíos que tienen tarjeta, de los dos destinos:
    // los de este destino van en la tarjeta; los demás explican qué pasó con el resto del envío.
    consulta(
      `SELECT d.id, d.envio_id, d.cantidad, d.nombre_producto, d.tiempo, d.nota, d.estado::text AS estado,
              k.destino::text AS destino, v.detalle_texto
       FROM detalle_comanda d
       JOIN producto x ON x.id = d.producto_id JOIN categoria k ON k.id = x.categoria_id
       JOIN v_comanda_detalle v ON v.id = d.id
       WHERE d.envio_id IN (SELECT envio_id FROM v_panel_produccion WHERE destino = $1)
       ORDER BY d.tiempo, d.id`, [destino]),
  ]);
  const columnas = Object.fromEntries(COLUMNAS.map((c) => [c, []]));
  for (const t of tarjetas) {
    const mias = lineas.filter((l) => l.envio_id === t.envio_id && l.destino === destino);
    const otras = lineas.filter((l) => l.envio_id === t.envio_id && !(l.destino === destino && COLUMNAS.includes(l.estado)));
    columnas[t.estado].push({
      ...t,
      siguiente: SIGUIENTE[t.estado],
      productos: mias.filter((l) => COLUMNAS.includes(l.estado)),
      resto_del_envio: describirResto(otras, destino),
    });
  }
  // Lo listo más reciente arriba (el mesero ya recibió el aviso); lo demás, el más antiguo primero
  columnas.listo.sort((a, b) => new Date(b.listo_en) - new Date(a.listo_en));
  return { destino, columnas };
}

// "De este envío ya se entregó la Pasta Alfredo; la limonada la hizo barra."
function describirResto(lineas, destino) {
  const otro = destino === 'cocina' ? 'barra' : 'cocina';
  const nombres = (ls) => ls.map((l) => `${l.cantidad > 1 ? `${l.cantidad}× ` : ''}${l.nombre_producto}`).join(', ');
  const partes = [];
  const entregadas = lineas.filter((l) => l.destino === destino && l.estado === 'entregado');
  const canceladas = lineas.filter((l) => l.destino === destino && l.estado === 'cancelado');
  const delOtro = lineas.filter((l) => l.destino === otro && l.estado !== 'cancelado');
  if (entregadas.length) partes.push(`ya se entregó: ${nombres(entregadas)}`);
  if (canceladas.length) partes.push(`se canceló: ${nombres(canceladas)}`);
  if (delOtro.length) partes.push(`${nombres(delOtro)} ${delOtro.every((l) => l.estado === 'entregado') ? 'lo hizo' : 'lo hace'} ${otro}`);
  return partes.length ? `De este envío ${partes.join('; ')}.` : null;
}

/** Botón de la tarjeta: "Empezar a preparar", "Marcar como listo" o "Marcar como entregado" */
export async function avanzar(envioId, cuerpo, actorId) {
  const v = revisor();
  const destino = v.opcion('destino', cuerpo?.destino, ['cocina', 'barra'], { etiqueta: 'El destino' });
  const estado = v.opcion('estado', cuerpo?.estado, ['en_preparacion', 'listo', 'entregado'], { etiqueta: 'El estado' });
  v.terminar();
  const n = await conTransaccion(actorId, async (c) => {
    const { rows: [e] } = await c.query('SELECT id FROM envio WHERE id = $1', [envioId]);
    if (!e) throw noExiste('ese envío');
    return (await c.query('SELECT fn_avanzar_envio($1, $2, $3, $4) AS n', [envioId, destino, estado, actorId])).rows[0].n;
  });
  return { envio_id: envioId, destino, estado, productos: n };
}
