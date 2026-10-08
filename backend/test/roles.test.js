// Pruebas de 02c · Roles y permisos (Codificación de Administrar roles)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, bd, rolId, ultimaBitacora } from './ayudantes.js';

let gerente; // agente con la sesión de lsaenz (Gerente, 17 permisos)
const roles = async () => (await gerente.get('/api/roles').expect(200)).body;
const rol = async (nombre) => (await roles()).roles.find((r) => r.nombre === nombre);

before(async () => {
  await prepararBase();
  ({ agente: gerente } = await entrar('lsaenz'));
});
after(cerrarBase);

describe('02c · Lista de roles y casillas', () => {
  test('los 6 roles con el texto de la pantalla y las 17 casillas por módulo', async () => {
    const { roles: lista, catalogo } = await roles();
    assert.deepEqual(lista.map((r) => `${r.nombre}: ${r.usuarios_texto}`), [
      'Gerente: 1 usuario', 'Hostess: 1 usuario', 'Mesero: 4 usuarios', 'Jefe de cocina: 1 usuario',
      'Encargado de barra: 1 usuario (dado de baja)', 'Cajera: 1 usuario',
    ]);
    assert.equal(catalogo.length, 17);
    assert.deepEqual([...new Set(catalogo.map((p) => p.modulo))],
      ['Servicio', 'Salón', 'Recepción', 'Cocina y barra', 'Caja', 'Gerencia', 'Seguridad']);
    const mesero = lista.find((r) => r.nombre === 'Mesero');
    assert.deepEqual(mesero.permisos, ['comanda.abrir', 'comanda.pedir_cuenta', 'mesa.ver']);
    assert.equal(mesero.permisos_texto, '3 de 17 permisos activos');
    assert.equal(mesero.se_puede_dar_de_baja, false);
    const g = lista.find((r) => r.nombre === 'Gerente');
    assert.equal(g.es_sistema, true);
    assert.equal(g.permisos.length, 17);
  });

  test('sin el permiso «Administrar roles y permisos» no se ve ni se cambia nada', async () => {
    const { agente } = await entrar('cruiz');
    const r = await agente.get('/api/roles').expect(403);
    assert.equal(r.body.codigo, 'SIN_PERMISO');
    assert.equal(r.body.mensaje, 'Mesero no tiene el permiso «Administrar usuarios» ni «Administrar roles y permisos».');
    await agente.post('/api/roles').send({ nombre: 'Intruso', permisos: [] }).expect(403);
    await agente.put(`/api/roles/${await rolId('Mesero')}`).send({ nombre: 'Mesero', permisos: [] }).expect(403);
  });

  test('sin sesión: 401', async () => {
    const { agente } = await entrar('no_existe', 'x');
    await agente.get('/api/roles').expect(401);
  });
});

describe('02c · Nuevo rol', () => {
  test('crea el rol con sus casillas y queda en la bitácora con quién lo hizo', async () => {
    const r = await gerente.post('/api/roles')
      .send({ nombre: '  Supervisor   de piso ', descripcion: 'Revisa el salón', permisos: ['reporte.ver', 'mesa.ver'] })
      .expect(201);
    assert.equal(r.body.nombre, 'Supervisor de piso');
    assert.deepEqual(r.body.permisos, ['mesa.ver', 'reporte.ver']);
    assert.equal(r.body.permisos_texto, '2 de 17 permisos activos');
    assert.equal(r.body.usuarios_texto, '0 usuarios');
    assert.equal(r.body.se_puede_dar_de_baja, true);
    const b = await ultimaBitacora('rol', r.body.id);
    assert.equal(b.accion, 'crear_rol');
    assert.equal(b.por, 'lsaenz');
  });

  test('el nombre no se repite, aunque cambien las mayúsculas', async () => {
    const r = await gerente.post('/api/roles').send({ nombre: 'MESERO', permisos: [] }).expect(409);
    assert.equal(r.body.codigo, 'DUPLICADO');
    assert.equal(r.body.campos.nombre, 'Ya existe el rol «Mesero».');
  });

  test('datos incompletos o casillas que no existen: 400 con el campo marcado', async () => {
    const a = await gerente.post('/api/roles').send({ nombre: ' ', permisos: [] }).expect(400);
    assert.equal(a.body.codigo, 'DATOS_INVALIDOS');
    assert.ok(a.body.campos.nombre);
    const b = await gerente.post('/api/roles').send({ nombre: 'Rol raro', permisos: ['mesa.ver', 'no.existe'] }).expect(400);
    assert.match(b.body.campos.permisos, /no\.existe/);
    const c = await gerente.post('/api/roles').send({ nombre: 'Rol raro' }).expect(400);
    assert.ok(c.body.campos.permisos);
  });
});

describe('02c · Guardar cambios', () => {
  test('marca y desmarca casillas; la bitácora dice cuáles', async () => {
    const id = await rolId('Hostess');
    const r = await gerente.put(`/api/roles/${id}`).send({
      nombre: 'Hostess', descripcion: 'Recepción del restaurante',
      permisos: ['mesa.ver', 'reservacion.gestionar', 'reporte.ver'], // quita mesa.administrar, agrega reporte.ver
    }).expect(200);
    assert.deepEqual(r.body.permisos, ['mesa.ver', 'reservacion.gestionar', 'reporte.ver']);
    assert.equal(r.body.descripcion, 'Recepción del restaurante');
    const b = await ultimaBitacora('rol', id);
    assert.equal(b.accion, 'editar_rol');
    assert.deepEqual(b.detalle.permisos_agregados, ['reporte.ver']);
    assert.deepEqual(b.detalle.permisos_quitados, ['mesa.administrar']);
  });

  test('los cambios aplican en la siguiente petición del usuario, sin volver a entrar', async () => {
    const { agente: mesero } = await entrar('lmora');
    await mesero.get('/api/usuarios').expect(403);
    const id = await rolId('Mesero');
    const base = ['comanda.abrir', 'comanda.pedir_cuenta', 'mesa.ver'];
    await gerente.put(`/api/roles/${id}`).send({ nombre: 'Mesero', permisos: [...base, 'usuario.administrar'] }).expect(200);
    await mesero.get('/api/usuarios').expect(200);
    const s = await mesero.get('/api/auth/sesion').expect(200);
    assert.ok(s.body.permisos.some((p) => p.clave === 'usuario.administrar'));
    await gerente.put(`/api/roles/${id}`).send({ nombre: 'Mesero', permisos: base }).expect(200);
    await mesero.get('/api/usuarios').expect(403);
  });

  test('sin cambios no escribe en la bitácora', async () => {
    const id = await rolId('Cajera');
    const antes = (await bd('SELECT count(*)::int AS n FROM bitacora WHERE entidad = $1 AND entidad_id = $2', ['rol', id]))[0].n;
    const actual = await rol('Cajera');
    await gerente.put(`/api/roles/${id}`).send({ nombre: actual.nombre, descripcion: actual.descripcion, permisos: actual.permisos }).expect(200);
    const despues = (await bd('SELECT count(*)::int AS n FROM bitacora WHERE entidad = $1 AND entidad_id = $2', ['rol', id]))[0].n;
    assert.equal(despues, antes);
  });

  test('Gerente es del sistema: no se le quitan permisos ni se le cambia el nombre (lo cuida la base)', async () => {
    const id = await rolId('Gerente');
    const g = await rol('Gerente');
    const quitar = await gerente.put(`/api/roles/${id}`).send({ nombre: 'Gerente', permisos: g.permisos.slice(1) }).expect(409);
    assert.equal(quitar.body.codigo, 'REGLA_DE_NEGOCIO');
    assert.match(quitar.body.mensaje, /no se le pueden quitar permisos/);
    const renombrar = await gerente.put(`/api/roles/${id}`).send({ nombre: 'Jefe', permisos: g.permisos }).expect(409);
    assert.match(renombrar.body.mensaje, /su nombre no se cambia/);
    assert.equal((await rol('Gerente')).permisos.length, 17);
  });

  test('un rol que no existe: 404', async () => {
    await gerente.put('/api/roles/999999').send({ nombre: 'X rol', permisos: [] }).expect(404);
    await gerente.put('/api/roles/abc').send({ nombre: 'X rol', permisos: [] }).expect(404);
  });
});

describe('02c · Dar de baja rol', () => {
  test('no se puede mientras tenga usuarios asignados (Mesero)', async () => {
    const r = await gerente.post(`/api/roles/${await rolId('Mesero')}/dar-de-baja`).expect(409);
    assert.equal(r.body.mensaje, 'No se puede dar de baja este rol mientras tenga usuarios asignados.');
  });

  test('el rol Gerente nunca se da de baja', async () => {
    const r = await gerente.post(`/api/roles/${await rolId('Gerente')}/dar-de-baja`).expect(409);
    assert.match(r.body.mensaje, /es del sistema/);
  });

  test('Encargado de barra (su único usuario ya está dado de baja): se da de baja, no se asigna ni se edita, y se reactiva', async () => {
    const id = await rolId('Encargado de barra');
    const r = await gerente.post(`/api/roles/${id}/dar-de-baja`).expect(200);
    assert.equal(r.body.activo, false);
    assert.equal((await ultimaBitacora('rol', id)).accion, 'dar_de_baja_rol');
    const lista = (await roles()).roles;
    assert.equal(lista.at(-1).nombre, 'Encargado de barra', 'los roles dados de baja van al final');

    await gerente.put(`/api/roles/${id}`).send({ nombre: 'Encargado de barra', permisos: [] }).expect(409);
    const alta = await gerente.post('/api/usuarios').send({
      nombre_completo: 'Barman Nuevo', nombre_usuario: 'barman', rol_id: id, contrasena_temporal: 'Temporal2026',
    }).expect(409);
    assert.match(alta.body.campos.rol_id, /dado de baja/);
    await gerente.post(`/api/roles/${id}/dar-de-baja`).expect(409);

    const de_nuevo = await gerente.post(`/api/roles/${id}/reactivar`).expect(200);
    assert.equal(de_nuevo.body.activo, true);
    assert.equal((await ultimaBitacora('rol', id)).accion, 'reactivar_rol');
  });
});
