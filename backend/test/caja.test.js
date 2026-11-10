// Pruebas de 07 · Cobro, 08 · Historial de ventas / cortes Z y 10 · Supervisión y reportes
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { config } from '../src/config.js';
import { prepararBase, cerrarBase, entrar, bd, comandaId, idDe, ultimaBitacora, relojDePantallas } from './ayudantes.js';
import { alMismoTiempo, estados } from './concurrencia.js';

let cajera; let mesero; let gerente;
const estadoMesa = async (numero) => (await bd('SELECT estado::text AS e FROM mesa WHERE numero = $1', [numero]))[0].e;
const pagar = (folio, datos, agente = cajera) => comandaId(folio).then((id) => agente.post(`/api/caja/cuentas/${id}/pagos`).send(datos));

before(async () => {
  await prepararBase();
  relojDePantallas();
  ({ agente: cajera } = await entrar('mdiaz'));
  ({ agente: mesero } = await entrar('cruiz'));
  ({ agente: gerente } = await entrar('lsaenz'));
});
after(async () => {
  config.impresora.host = '';
  await cerrarBase();
});

describe('07 · Lo que ve caja a las 19:09', () => {
  test('caja abierta desde las 12:00, una mesa por cobrar y las abiertas con su total', async () => {
    const r = (await cajera.get('/api/caja').expect(200)).body;
    assert.deepEqual([r.corte.folio, r.corte.turno, r.corte.monto_apertura, r.corte.estado], ['Z-0031', 'Vespertino', '1500.00', 'abierto']);
    assert.deepEqual(r.por_cobrar.map((c) => `Mesa ${c.mesa} · ${c.numero_personas} personas · ${c.mesero} · ${c.total}`), ['Mesa 02 · 4 personas · Carlos Ruiz · 980.20']);
    assert.deepEqual(r.abiertas.map((c) => `Mesa ${c.mesa}: ${c.total}`),
      ['Mesa 08: 1571.80', 'Mesa 09: 336.40', 'Mesa 12: 417.60', 'Mesa 15: 649.60', 'Mesa 17: 0.00', 'Mesa 21: 678.60']);
  });

  test('el pre-ticket se genera de la comanda: renglones, IVA, propina sugerida y lo que sigue en cocina', async () => {
    const t = (await cajera.get(`/api/caja/cuentas/${await comandaId('C-1041')}`).expect(200)).body;
    assert.equal(t.tipo, 'Pre-ticket');
    assert.deepEqual([t.subtotal, t.iva, t.total, t.propina_sugerida, t.falta], ['845.00', '135.20', '980.20', '84.50', '980.20']);
    assert.deepEqual(t.lineas.filter((l) => l.en_cocina).map((l) => l.nombre_producto), ['Pastel de chocolate', 'Flan napolitano']);
  });

  test('solo caja cobra', async () => {
    await mesero.get('/api/caja').expect(403);
    const r = await pagar('C-1041', { metodo: 'efectivo', monto: 10, monto_recibido: 10 }, mesero);
    assert.equal(r.status, 403);
  });
});

describe('07 · Imprimir el pre-ticket (ESC/POS)', () => {
  test('sin impresora configurada, regresa el texto para imprimirlo en el navegador', async () => {
    const r = await cajera.post(`/api/caja/cuentas/${await comandaId('C-1041')}/imprimir`).expect(200);
    assert.equal(r.body.impreso, false);
    assert.ok(r.body.renglones.includes('  PRE-TICKET · NO ES COMPROBANTE DE PAGO'));
    assert.ok(r.body.renglones.some((l) => /^TOTAL +\$980\.20$/.test(l)));
    assert.ok(r.body.renglones.every((l) => l.length <= 42));
  });

  test('con impresora de red, le manda los comandos ESC/POS en página 850', async () => {
    const recibido = [];
    const impresora = net.createServer((s) => s.on('data', (d) => recibido.push(d)));
    await new Promise((ok) => impresora.listen(0, '127.0.0.1', ok));
    config.impresora.host = '127.0.0.1';
    config.impresora.puerto = impresora.address().port;
    try {
      const r = await cajera.post(`/api/caja/cuentas/${await comandaId('C-1041')}/imprimir`).expect(200);
      assert.equal(r.body.impreso, true);
      await new Promise((ok) => setTimeout(ok, 50));
      const b = Buffer.concat(recibido);
      assert.deepEqual([...b.subarray(0, 5)], [0x1b, 0x40, 0x1b, 0x74, 0x02]); // ESC @ · ESC t 2
      assert.ok(b.includes(Buffer.from('C-1041')));
      assert.ok(b.includes(0xfa)); // '·' en la página 850
      assert.deepEqual([...b.subarray(-4)], [0x1d, 0x56, 0x42, 0x00]); // cortar
    } finally {
      config.impresora.host = '';
      impresora.close();
    }
  });
});

describe('07 · Cancelar pre-ticket y cobrar', () => {
  test('cancelar el pre-ticket lo hace caja: la comanda vuelve a Abierta y queda en bitácora', async () => {
    const id = await comandaId('C-1041');
    await mesero.post(`/api/caja/cuentas/${id}/cancelar-pre-ticket`).expect(403);
    const r = await cajera.post(`/api/caja/cuentas/${id}/cancelar-pre-ticket`).expect(200);
    assert.equal(r.body.estado_etiqueta, 'Abierta');
    assert.equal(await estadoMesa('02'), 'comanda_abierta');
    const b = await ultimaBitacora('comanda', id);
    assert.deepEqual([b.accion, b.por], ['cancelar_pre_ticket', 'mdiaz']);
    await mesero.post(`/api/comandas/${id}/pedir-cuenta`).expect(200); // el mesero la vuelve a pedir
  });

  test('la base rechaza pagos de más; caja revisa que el efectivo alcance', async () => {
    const a = await pagar('C-1041', { metodo: 'tarjeta', monto: 1000 });
    assert.equal(a.status, 409);
    assert.equal(a.body.mensaje, 'El pago ($1000.00) excede lo que falta por cobrar de la comanda C-1041 ($980.20).');
    const b = await pagar('C-1041', { metodo: 'efectivo', monto: 980.2, monto_recibido: 900 });
    assert.equal(b.status, 400);
    assert.equal(b.body.campos.monto_recibido, 'El monto recibido no alcanza para este pago.');
    const c = await pagar('C-1041', { metodo: 'cheque', monto: 1 });
    assert.ok(c.body.campos.metodo);
  });

  test('dividir la cuenta: al cubrir el total la comanda se cierra sola y la mesa queda libre', async () => {
    const a = await pagar('C-1041', { metodo: 'tarjeta', monto: 500, referencia: 'AUT 482913' });
    assert.equal(a.status, 201);
    assert.deepEqual([a.body.cerrada, a.body.ticket.falta, a.body.ticket.tipo], [false, '480.20', 'Pre-ticket']);
    const b = await pagar('C-1041', { metodo: 'efectivo', monto: '480.20', monto_recibido: '500' });
    assert.deepEqual([b.body.cerrada, b.body.ticket.tipo, b.body.ticket.metodo, b.body.ticket.falta], [true, 'Ticket', 'Mixto', '0.00']);
    assert.equal(b.body.ticket.pagos.at(-1).cambio, '19.80');
    assert.equal(await estadoMesa('02'), 'libre');
    const x = await pagar('C-1041', { metodo: 'efectivo', monto: 1, monto_recibido: 1 });
    assert.equal(x.body.mensaje, 'Primero el mesero pide la cuenta: solo se cobra una comanda Por cobrar (la C-1041 está cerrada).');
  });

  test('quien cobra necesita su caja abierta', async () => {
    await mesero.post(`/api/comandas/${await comandaId('C-1044')}/pedir-cuenta`).expect(200);
    const r = await pagar('C-1044', { metodo: 'tarjeta', monto: 100 }, gerente);
    assert.equal(r.body.mensaje, 'Abre caja para cobrar: Luis Sáenz Jiménez no tiene un corte abierto.');
    const otra = await cajera.post('/api/caja/abrir').send({ monto_apertura: 500 }).expect(409);
    assert.equal(otra.body.mensaje, 'Ya tienes la caja abierta: el corte Z la cierra.');
  });
});

describe('08 · Historial de ventas y corte Z', () => {
  test('ventas del día, tickets, corte abierto y corte por mesero (todo calculado)', async () => {
    const h = (await cajera.get('/api/ventas').expect(200)).body;
    assert.equal(h.fecha, '2026-09-22');
    assert.deepEqual([h.resumen.ventas, h.resumen.tickets, h.resumen.efectivo, h.resumen.tarjeta], ['1293.40', 2, '793.40', '500.00']);
    assert.deepEqual(h.tickets.map((t) => `${t.folio} · ${t.metodo} · ${t.total} · ${t.pagos_texto}`),
      ['C-1041 · Mixto · 980.20 · 2 pagos', 'C-1038 · Efectivo · 313.20 · 1 pago']);
    const z = h.cortes.find((k) => k.folio === 'Z-0031');
    assert.deepEqual([z.efectivo, z.tarjeta, z.operaciones, z.efectivo_esperado], ['793.40', '500.00', 3, '2293.40']);
    assert.deepEqual(h.meseros.map((m) => `${m.mesero}: ${m.total_cobrado}`), ['Carlos Ruiz: 980.20', 'Ana Ruiz: 313.20']);
  });

  test('con una cuenta cobrada a medias no se hace el corte; luego sí, y es inmutable', async () => {
    const z = (await bd("SELECT id FROM corte_caja WHERE folio = 'Z-0031'"))[0].id;
    await pagar('C-1044', { metodo: 'efectivo', monto: 100, monto_recibido: 100 });
    const a = await cajera.post(`/api/ventas/cortes/${z}/cerrar`).send({ efectivo_declarado: 2393.4 }).expect(409);
    assert.equal(a.body.mensaje, 'Hay cuentas cobradas a medias en el corte Z-0031: termina de cobrarlas antes del corte.');
    await pagar('C-1044', { metodo: 'tarjeta', monto: '317.60' });
    const r = await cajera.post(`/api/ventas/cortes/${z}/cerrar`).send({ efectivo_declarado: '2390.00', observaciones: 'Faltaron monedas' }).expect(200);
    assert.deepEqual([r.body.estado_etiqueta, r.body.efectivo_esperado, r.body.efectivo_declarado, r.body.diferencia],
      ['Cerrado', '2393.40', '2390.00', '-3.40']);
    assert.deepEqual(r.body.meseros.map((m) => `${m.mesero} ${m.cuentas}`), ['Carlos Ruiz 2', 'Ana Ruiz 1']);
    const b = await cajera.post(`/api/ventas/cortes/${z}/cerrar`).send({ efectivo_declarado: 1 }).expect(409);
    assert.equal(b.body.mensaje, 'El corte Z-0031 ya está cerrado: es inmutable.');
  });

  test('después del corte, para cobrar hay que abrir caja otra vez (Z-0032)', async () => {
    const c = (await cajera.get('/api/caja').expect(200)).body;
    assert.equal(c.corte, null);
    const r = await cajera.post('/api/caja/abrir').send({ monto_apertura: '1000', turno: 'Nocturno' }).expect(201);
    assert.deepEqual([r.body.folio, r.body.monto_apertura, r.body.turno], ['Z-0032', '1000.00', 'Nocturno']);
  });

  test('exportar los tickets del día en CSV', async () => {
    const r = await cajera.get('/api/ventas/exportar?fecha=2026-09-22').expect(200);
    assert.match(r.headers['content-type'], /text\/csv/);
    assert.match(r.headers['content-disposition'], /ventas-2026-09-22\.csv/);
    const texto = r.text.replace(/^﻿/, '');
    assert.equal(texto.split('\r\n')[0], 'Folio,Mesa,Mesero,Método,Hora,Total,Pagos');
    assert.equal(texto.split('\r\n').length, 4);
  });

  test('el mesero no ve el historial de ventas', async () => {
    await mesero.get('/api/ventas').expect(403);
  });
});

describe('10 · Supervisión y reportes', () => {
  test('indicadores del día y comparación con ayer', async () => {
    const r = (await gerente.get('/api/reportes?fecha=2026-09-22').expect(200)).body;
    assert.deepEqual([r.hoy.ventas, r.hoy.tickets, r.hoy.comensales, r.hoy.ticket_promedio], ['1711.00', 3, 11, '570.33']);
    assert.equal(r.ayer.tickets, 0);
  });

  test('ventas por hora de 12 a 23 h, top de productos y rotación con su nivel', async () => {
    const r = (await gerente.get('/api/reportes?fecha=2026-09-22').expect(200)).body;
    assert.deepEqual(r.ventas.map((b) => b.etiqueta), [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    assert.equal(r.ventas.find((b) => b.etiqueta === 18).ventas, '313.20');
    assert.equal(r.ventas.find((b) => b.etiqueta === 19).ventas, '1397.80');
    assert.deepEqual(r.productos.slice(0, 2).map((p) => `${p.nombre_producto} ${p.vendidos} ${p.importe}`), ['Pollo al chipotle 2 340.00', 'Arrachera 350 g 1 320.00']);
    assert.deepEqual(r.rotacion.find((x) => x.mesa === '06'), { mesa: '06', servicios: 1, minutos_promedio: 70, nivel: 'Alto' });
  });

  test('periodo semana y mes: una barra por día', async () => {
    const s = (await gerente.get('/api/reportes?fecha=2026-09-22&periodo=semana').expect(200)).body;
    assert.equal(s.ventas.length, 7);
    assert.equal(s.ventas.at(-1).etiqueta, '2026-09-22');
    const m = (await gerente.get('/api/reportes?fecha=2026-09-22&periodo=mes').expect(200)).body;
    assert.equal(m.ventas.length, 22);
  });

  test('solo «Consultar reportes»', async () => {
    await cajera.get('/api/reportes').expect(403);
    const r = await gerente.get('/api/reportes/exportar?fecha=2026-09-22').expect(200);
    assert.match(r.text, /Ventas,1711\.00/);
  });
});

// Al final: cambian las ventas del día que revisan los reportes
describe('Al mismo tiempo en caja', () => {
  // Una comanda abierta con todo enviado; el gerente pide la cuenta
  const porCobrar = async () => {
    const [c] = await bd(`SELECT c.id, c.folio FROM comanda c WHERE c.estado = 'abierta'
       AND NOT EXISTS (SELECT 1 FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado = 'sin_enviar')
       AND EXISTS (SELECT 1 FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado <> 'cancelado') ORDER BY c.id LIMIT 1`);
    await gerente.post(`/api/comandas/${c.id}/pedir-cuenta`).expect(200);
    return { ...c, falta: (await cajera.get(`/api/caja/cuentas/${c.id}`).expect(200)).body.falta };
  };

  test('la misma cuenta cobrada dos veces a la vez: entra un solo pago', async () => {
    const k = await porCobrar();
    const r = await alMismoTiempo({
      candado: 'SELECT 1 FROM comanda WHERE id = $1 FOR SHARE', params: [k.id],
      peticiones: [() => pagar(k.folio, { metodo: 'tarjeta', monto: k.falta }), () => pagar(k.folio, { metodo: 'tarjeta', monto: k.falta })],
    });
    assert.deepEqual(estados(r), [201, 409]);
    assert.equal(r.find((x) => x.status === 409).body.mensaje,
      `Primero el mesero pide la cuenta: solo se cobra una comanda Por cobrar (la ${k.folio} está cerrada).`);
    const [p] = await bd('SELECT count(*)::int AS n, sum(monto)::text AS total FROM pago WHERE comanda_id = $1', [k.id]);
    assert.deepEqual([p.n, p.total], [1, k.falta]);
  });

  test('cobrar justo cuando el gerente cierra el corte: el pago no entra a un corte ya cerrado', async () => {
    const k = await porCobrar();
    const [z] = await bd(`SELECT k.id FROM corte_caja k JOIN usuario u ON u.id = k.cajero_usuario_id
                          WHERE u.nombre_usuario = 'mdiaz' AND k.estado = 'abierto'`);
    const [r] = await alMismoTiempo({
      candado: 'SELECT 1 FROM corte_caja WHERE id = $1 FOR UPDATE', params: [z.id],
      peticiones: [() => pagar(k.folio, { metodo: 'tarjeta', monto: k.falta })],
      // El corte Z, hecho por el gerente mientras el cobro espera
      antesDeSoltar: async (c) => c.query('SELECT fn_cerrar_corte($1, $2, $3)', [z.id, await idDe('lsaenz'), '1000.00']),
    });
    assert.equal(r.status, 409);
    assert.match(r.body.mensaje, /^Abre caja para cobrar/);
    const [p] = await bd('SELECT count(*)::int AS n FROM pago WHERE comanda_id = $1', [k.id]);
    assert.equal(p.n, 0);
  });

  test('"Abrir caja" con doble clic: se abre una y la otra recibe el aviso', async () => {
    const abrir = () => cajera.post('/api/caja/abrir').send({ monto_apertura: 500, turno: 'Nocturno' });
    const r = await alMismoTiempo({ candado: "SELECT pg_advisory_xact_lock(hashtext('kitchenlink:folio:corte_caja'))", peticiones: [abrir, abrir] });
    assert.deepEqual(estados(r), [201, 409]);
    assert.equal(r.find((x) => x.status === 409).body.mensaje, 'Ya tienes la caja abierta: el corte Z la cierra.');
  });
});
