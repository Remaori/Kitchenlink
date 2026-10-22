// Pruebas de 03a · Reservaciones y 03b · Lista de espera (Gestión de reservaciones y tiempos de espera)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, bd, mesaId, relojDePantallas } from './ayudantes.js';
import { alMismoTiempo, estados } from './concurrencia.js';

let hostess;
const agenda = async (q = '') => (await hostess.get(`/api/reservaciones${q}`).expect(200)).body;
const espera = async () => (await hostess.get('/api/lista-espera').expect(200)).body;
const reservacionId = async (nombre) => (await bd('SELECT id FROM reservacion WHERE nombre_cliente = $1 ORDER BY id DESC LIMIT 1', [nombre]))[0].id;
const esperaId = async (nombre) => (await bd("SELECT id FROM lista_espera WHERE nombre_cliente = $1 AND estado = 'en_espera'", [nombre]))[0].id;
const estadoMesa = async (numero) => (await bd('SELECT estado::text AS e FROM mesa WHERE numero = $1', [numero]))[0].e;

before(async () => {
  await prepararBase();
  relojDePantallas();
  ({ agente: hostess } = await entrar('alopez'));
});
after(cerrarBase);

describe('03a · Agenda de hoy (19:09)', () => {
  test('"6 reservaciones · 27 personas" y los parámetros de la configuración', async () => {
    const a = await agenda();
    assert.equal(a.fecha, '2026-09-22');
    assert.deepEqual(a.resumen, { reservaciones: 6, personas: 27, en_espera: 3 });
    assert.deepEqual(a.configuracion, { tolerancia_min: 15, duracion_min: 120, apartado_previo_min: 30 });
  });

  test('los estados por hora; "En tolerancia" se calcula con el reloj', async () => {
    const { reservaciones: r } = await agenda();
    assert.deepEqual(r.map((x) => x.estado_etiqueta),
      ['No se presentó', 'Sentada', 'En tolerancia', 'Confirmada', 'Confirmada', 'Por confirmar']);
    const roberto = r.find((x) => x.nombre_cliente === 'Roberto Díaz');
    assert.equal(roberto.minutos_para_liberar, 6);
    assert.equal(r.find((x) => x.nombre_cliente === 'Ana Martínez').mesa_apartada, true);
    assert.equal(r.find((x) => x.nombre_cliente === 'Grupo Oficina Lomas').mesa_apartada, false);
  });

  test('otro día tiene su propia agenda', async () => {
    const a = await agenda('?fecha=2026-09-23');
    assert.equal(a.reservaciones.length, 0);
  });

  test('mesas para el formulario: las que caben y no se empalman, primero', async () => {
    const r = await hostess.get('/api/reservaciones/mesas?fecha=2026-09-22&hora=21:00&personas=4').expect(200);
    const m = Object.fromEntries(r.body.map((x) => [x.numero, x]));
    assert.equal(m['11'].cabe && !m['11'].choca_con, true);
    assert.equal(m['15'].choca_con, 'Grupo Oficina Lomas');
    assert.equal(m['07'].choca_con, 'Luis Herrera');
    assert.equal(m['10'].cabe, false);
    assert.equal(r.body[0].cabe && !r.body[0].choca_con, true);
  });
});

describe('03a · Nueva reservación', () => {
  test('queda Por confirmar, con la ventana que calcula la base', async () => {
    const r = await hostess.post('/api/reservaciones').send({
      fecha: '2026-09-22', hora: '21:00', numero_personas: 4, mesa_id: await mesaId('11'),
      nombre_cliente: 'Jorge Salinas', telefono: '55 2468 1357',
    }).expect(201);
    assert.equal(r.body.estado_etiqueta, 'Por confirmar');
    const hhmm = (f) => new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Mexico_City' });
    assert.deepEqual([hhmm(r.body.apartado_desde), hhmm(r.body.apartado_hasta), hhmm(r.body.tolerancia_hasta)], ['20:30', '23:00', '21:15']);
    assert.equal((await agenda()).resumen.reservaciones, 7);
  });

  test('la base rechaza lo que se empalma, lo que ya pasó y lo que no cabe', async () => {
    const once = await mesaId('11');
    const datos = { fecha: '2026-09-22', numero_personas: 2, mesa_id: once, nombre_cliente: 'Pareja Núñez' };
    const a = await hostess.post('/api/reservaciones').send({ ...datos, hora: '22:00' }).expect(409);
    assert.equal(a.body.mensaje, 'La mesa 11 ya está apartada de 20:30 a 23:00 para Jorge Salinas.');
    const b = await hostess.post('/api/reservaciones').send({ ...datos, hora: '19:05', mesa_id: await mesaId('13') }).expect(409);
    assert.equal(b.body.mensaje, 'Una reservación aparta mesa para una hora futura. Si el cliente ya llegó, va a la lista de espera.');
    const c = await hostess.post('/api/reservaciones').send({ ...datos, hora: '21:00', numero_personas: 6, mesa_id: await mesaId('14') }).expect(409);
    assert.equal(c.body.mensaje, 'La mesa 14 es para 2 personas y la reservación es de 6.');
  });

  test('datos incompletos: cada campo con su mensaje', async () => {
    const r = await hostess.post('/api/reservaciones').send({ fecha: '22/09/2026', hora: '9pm', telefono: 'abc' }).expect(400);
    assert.deepEqual(Object.keys(r.body.campos).sort(), ['fecha', 'hora', 'mesa_id', 'nombre_cliente', 'numero_personas', 'telefono']);
  });

  test('lo que parece dato pero no lo es: nombre con números, teléfono sin dígitos, 31 de febrero, "1e1" personas', async () => {
    const base = { fecha: '2026-09-23', hora: '21:00', numero_personas: 2, mesa_id: await mesaId('11'), nombre_cliente: 'Andrea Gómez' };
    const r = await hostess.post('/api/reservaciones')
      .send({ ...base, nombre_cliente: '12345', telefono: '+++++++', fecha: '2026-02-31', numero_personas: '1e1' }).expect(400);
    assert.deepEqual(r.body.campos, {
      nombre_cliente: 'El nombre: usa solo letras (sin números ni símbolos).',
      telefono: 'El teléfono: 10 dígitos (ej. 55 1234 5678).',
      fecha: 'La fecha no existe en el calendario.',
      numero_personas: 'Las personas debe ser un número entero.',
    });
    // El teléfono se guarda igual aunque se escriba de otra manera
    const ok = await hostess.post('/api/reservaciones').send({ ...base, telefono: '(55) 8765-4321' }).expect(201);
    assert.equal(ok.body.telefono, '55 8765 4321');
    // Pedir la agenda de un día que no existe muestra la de hoy, sin error del servidor
    assert.equal((await agenda('?fecha=2026-02-31')).fecha, '2026-09-22');
    await hostess.get('/api/reservaciones/mesas?fecha=2026-02-30&hora=21:00&personas=2').expect(400);
    // Hasta un año adelante: el 31 de diciembre de 9999 no es una reservación
    const lejos = await hostess.post('/api/reservaciones').send({ ...base, fecha: '9999-12-31' }).expect(400);
    assert.equal(lejos.body.campos.fecha, 'La fecha: las reservaciones se toman hasta con un año de anticipación.');
  });

  test('confirmar y cancelar', async () => {
    const jorge = await reservacionId('Jorge Salinas');
    const c = await hostess.post(`/api/reservaciones/${jorge}/confirmar`).expect(200);
    assert.equal(c.body.estado_etiqueta, 'Confirmada');
    assert.equal(await estadoMesa('11'), 'libre'); // se aparta hasta las 20:30
    const x = await hostess.post(`/api/reservaciones/${await reservacionId('Luis Herrera')}/cancelar`).expect(200);
    assert.equal(x.body.estado_etiqueta, 'Cancelada');
    assert.equal((await agenda()).resumen.reservaciones, 6);
  });

  test('"Marcar llegada": queda Sentada y la mesa Por atender', async () => {
    const r = await hostess.post(`/api/reservaciones/${await reservacionId('Ana Martínez')}/llegada`).expect(200);
    assert.equal(r.body.estado_etiqueta, 'Sentada');
    assert.equal(await estadoMesa('03'), 'por_atender');
    const otra = await hostess.post(`/api/reservaciones/${await reservacionId('Familia Torres')}/llegada`).expect(409);
    assert.equal(otra.body.mensaje, 'La reservación de Familia Torres ya está así.');
  });

  test('solo «Gestionar reservaciones y lista de espera»', async () => {
    const { agente } = await entrar('cruiz');
    await agente.get('/api/reservaciones').expect(403);
    await agente.get('/api/lista-espera').expect(403);
  });
});

describe('03b · Lista de espera (19:09)', () => {
  test('en orden de llegada, con lo que lleva esperando y el estimado', async () => {
    const e = await espera();
    assert.deepEqual(e.espera.map((g) => `${g.posicion} ${g.nombre_cliente} ${g.minutos_esperando} min ~${g.minutos_estimados}`),
      ['1 Rosa Jiménez 15 min ~5', '2 Pedro Salas 10 min ~8', '3 Familia Ortega 4 min ~20']);
    assert.equal(e.espera[1].telefono, 'sin teléfono');
    assert.equal(e.espera[2].nota, 'Necesita mesa de 6');
    assert.equal(e.espera_promedio_hoy_min, 5); // Mariana Soto: llegó 19:02, se sentó 19:07
    assert.equal(e.mesas.length, 18);
  });

  test('agregar: empieza a contar su espera', async () => {
    const r = await hostess.post('/api/lista-espera').send({ nombre_cliente: 'Carlos Peña', numero_personas: '2' }).expect(201);
    assert.equal(r.body.estado_etiqueta, 'En espera');
    const e = await espera();
    assert.equal(e.espera.at(-1).nombre_cliente, 'Carlos Peña');
    assert.equal(e.espera.at(-1).posicion, 4);
    const x = await hostess.post('/api/lista-espera').send({ numero_personas: 0 }).expect(400);
    assert.ok(x.body.campos.nombre_cliente && x.body.campos.numero_personas);
    const y = await hostess.post('/api/lista-espera').send({ nombre_cliente: 'Mesa 4', numero_personas: '+3', telefono: '123' }).expect(400);
    assert.deepEqual(Object.keys(y.body.campos).sort(), ['nombre_cliente', 'numero_personas', 'telefono']);
  });

  test('asignar mesa: la reservación tiene prioridad y la mesa debe ser del tamaño', async () => {
    const rosa = await esperaId('Rosa Jiménez');
    const a = await hostess.post(`/api/lista-espera/${rosa}/asignar`).send({ mesa_id: await mesaId('04') }).expect(409);
    assert.equal(a.body.mensaje, 'La mesa 04 está apartada para Roberto Díaz (19:00): las reservaciones tienen prioridad sobre la lista de espera.');
    const b = await hostess.post(`/api/lista-espera/${rosa}/asignar`).send({ mesa_id: await mesaId('10') }).expect(409);
    assert.equal(b.body.mensaje, 'La mesa 10 es muy pequeña: 2 lugares para 3 personas.');
    const c = await hostess.post(`/api/lista-espera/${rosa}/asignar`).send({ mesa_id: await mesaId('06') }).expect(200);
    assert.deepEqual([c.body.estado_etiqueta, c.body.mesa], ['Sentada', '06']);
    assert.equal(await estadoMesa('06'), 'por_atender');
  });

  test('retirar: sale de la lista', async () => {
    await hostess.post(`/api/lista-espera/${await esperaId('Pedro Salas')}/retirar`).expect(200);
    assert.deepEqual((await espera()).espera.map((g) => g.nombre_cliente), ['Familia Ortega', 'Carlos Peña']);
  });
});

describe('12 · Llegó tarde (19:16)', () => {
  test('ya no se le sienta con su reservación; si quiere mesa, entra a la lista de espera', async () => {
    relojDePantallas('19:16');
    const roberto = await reservacionId('Roberto Díaz');
    const a = await hostess.post(`/api/reservaciones/${roberto}/llegada`).expect(409);
    assert.equal(a.body.mensaje, 'Llegó fuera de la tolerancia (se liberaba a las 19:15): pierde la reservación. Si todavía quiere mesa, entra a la lista de espera.');
    const r = await hostess.post(`/api/reservaciones/${roberto}/lista-espera`).send({ espera_estimada_min: 25 }).expect(201);
    assert.equal(r.body.estado_etiqueta, 'En espera');
    const e = await espera();
    const g = e.espera.find((x) => x.nombre_cliente === 'Roberto Díaz');
    assert.equal(g.venia_con_reservacion, true);
    assert.equal(g.posicion, 3);
    const ag = await agenda();
    assert.equal(ag.reservaciones.find((x) => x.nombre_cliente === 'Roberto Díaz').paso_a_lista, true);
    assert.equal(await estadoMesa('04'), 'libre');
    await hostess.post(`/api/reservaciones/${roberto}/lista-espera`).send({}).expect(409);
  });
});

describe('Al mismo tiempo', () => {
  // Una mesa libre, activa y sin reservaciones por venir
  const mesaLibre = async () => (await bd(
    `SELECT id, numero FROM mesa m WHERE m.activo AND m.estado = 'libre' AND m.capacidad >= 2
       AND NOT EXISTS (SELECT 1 FROM reservacion r WHERE r.mesa_id = m.id AND r.estado IN ('por_confirmar','confirmada'))
     ORDER BY m.numero LIMIT 1`))[0];
  const enEspera = async (nombre) => (await hostess.post('/api/lista-espera').send({ nombre_cliente: nombre, numero_personas: 2 }).expect(201)).body.id;

  test('dos hostess sientan a dos grupos en la misma mesa a la vez: solo se sienta uno', async () => {
    const m = await mesaLibre();
    const grupos = [await enEspera('Grupo Uno'), await enEspera('Grupo Dos')];
    // La mesa retenida: las dos ya revisaron que estaba libre cuando la base las deja seguir
    const r = await alMismoTiempo({
      candado: 'SELECT 1 FROM mesa WHERE id = $1 FOR SHARE', params: [m.id],
      peticiones: grupos.map((g) => () => hostess.post(`/api/lista-espera/${g}/asignar`).send({ mesa_id: m.id })),
    });
    assert.deepEqual(estados(r), [200, 409]);
    assert.equal(r.find((x) => x.status === 409).body.mensaje, `La mesa ${m.numero} no está libre (está: Por atender).`);
    const [n] = await bd("SELECT count(*)::int AS n FROM lista_espera WHERE mesa_id = $1 AND estado = 'sentada'", [m.id]);
    assert.equal(n.n, 1);
  });

  test('reservar una mesa que el gerente está dando de baja: la reservación espera y se rechaza', async () => {
    const { agente: gerente } = await entrar('lsaenz');
    const m = await mesaLibre();
    const r = await alMismoTiempo({
      candado: 'LOCK TABLE bitacora IN EXCLUSIVE MODE', // retiene la baja justo antes de terminar
      enOrden: true,
      peticiones: [
        () => gerente.post(`/api/mesas/${m.id}/dar-de-baja`),
        () => hostess.post('/api/reservaciones').send({ fecha: '2026-09-22', hora: '22:30', numero_personas: 2, mesa_id: m.id, nombre_cliente: 'Cliente Tardío' }),
      ],
    });
    assert.deepEqual(r.map((x) => x.status), [200, 409]);
    assert.equal(r[1].body.campos?.mesa_id, `La Mesa ${m.numero} está dada de baja: elige otra.`);
    const [n] = await bd("SELECT count(*)::int AS n FROM reservacion WHERE nombre_cliente = 'Cliente Tardío'");
    assert.equal(n.n, 0);
  });
});
