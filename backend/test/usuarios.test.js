// Pruebas de 02a · Usuarios y 02b · Nuevo usuario (Codificación de Administrar usuarios)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, activar, bd, idDe, rolId, ultimaBitacora, DEMO, TEMPORAL } from './ayudantes.js';

let gerente; // agente con la sesión de lsaenz
const alta = (datos) => gerente.post('/api/usuarios').send(datos);
const temporal = async () => (await gerente.get('/api/usuarios/contrasena-temporal').expect(200)).body.temporal;

before(async () => {
  await prepararBase();
  ({ agente: gerente } = await entrar('lsaenz'));
});
after(cerrarBase);

describe('02a · Lista de usuarios', () => {
  test('los 9 usuarios de la pantalla, el Pendiente al final y sin datos de contraseña', async () => {
    const r = await gerente.get('/api/usuarios').expect(200);
    assert.equal(r.body.length, 9);
    assert.deepEqual(r.body.map((u) => u.nombre_usuario),
      ['lsaenz', 'alopez', 'cruiz', 'dbenitez', 'mdiaz', 'lmora', 'aruiz', 'jvega', 'smendez']);
    const s = r.body.at(-1);
    assert.equal(s.estado_etiqueta, 'Pendiente');
    assert.equal(s.ultimo_acceso, null);
    assert.ok(r.body.every((u) => !('contrasena_hash' in u)));
  });

  test('un rol sin «Administrar usuarios» recibe 403 en todas las acciones', async () => {
    const { agente } = await entrar('mdiaz');
    const id = await idDe('cruiz');
    for (const [metodo, ruta] of [['get', '/api/usuarios'], ['get', `/api/usuarios/${id}`], ['post', '/api/usuarios'],
      ['put', `/api/usuarios/${id}`], ['post', `/api/usuarios/${id}/restablecer-contrasena`], ['post', `/api/usuarios/${id}/dar-de-baja`]]) {
      const r = await agente[metodo](ruta).send({});
      assert.equal(r.status, 403, `${metodo} ${ruta}`);
      assert.equal(r.body.codigo, 'SIN_PERMISO');
    }
  });
});

describe('02b · Nuevo usuario', () => {
  test('"Generar otra" da una temporal nueva que no se guarda en caché', async () => {
    const r = await gerente.get('/api/usuarios/contrasena-temporal').expect(200);
    assert.match(r.body.temporal, /^[A-Za-z]{6}\d{4}$/);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.notEqual(r.body.temporal, await temporal());
  });

  test('crea al usuario Pendiente; con su temporal entra, crea su contraseña y queda Activo con los permisos del rol', async () => {
    const t = await temporal();
    const r = await alta({
      nombre_completo: '  Pedro   Salas ', telefono: '55 1122 3344', correo: 'Pedro@Correo.com',
      nombre_usuario: ' PSalas ', rol_id: await rolId('Mesero'), contrasena_temporal: t,
    }).expect(201);
    assert.equal(r.body.nombre_completo, 'Pedro Salas');
    assert.equal(r.body.nombre_usuario, 'psalas', 'el usuario se guarda en minúsculas');
    assert.equal(r.body.correo, 'pedro@correo.com');
    assert.equal(r.body.estado_etiqueta, 'Pendiente');
    assert.equal(r.body.requiere_cambio_pw, true);
    const [h] = await bd('SELECT contrasena_hash FROM usuario WHERE id = $1', [r.body.id]);
    assert.match(h.contrasena_hash, /^\$2[aby]\$/, 'se guarda el hash bcrypt, no la temporal');
    const b = await ultimaBitacora('usuario', r.body.id);
    assert.equal(b.accion, 'crear_usuario');
    assert.equal(b.por, 'lsaenz');

    const { sesion } = await activar('PSALAS', t);
    assert.equal(sesion.usuario.estado, 'activo');
    assert.deepEqual(sesion.permisos.map((p) => p.clave), ['comanda.abrir', 'comanda.pedir_cuenta', 'mesa.ver']);
  });

  test('el nombre de usuario es único sin importar mayúsculas; el correo también', async () => {
    const r = await alta({ nombre_completo: 'Carlos Otro', nombre_usuario: 'CRUIZ', correo: 'pedro@correo.com',
      rol_id: await rolId('Mesero'), contrasena_temporal: await temporal() }).expect(409);
    assert.equal(r.body.codigo, 'DUPLICADO');
    assert.ok(r.body.campos.nombre_usuario);
    assert.ok(r.body.campos.correo);
  });

  test('datos incompletos o con formato inválido: 400 con cada campo marcado', async () => {
    const r = await alta({ nombre_completo: '', nombre_usuario: 'josé ñ', telefono: 'abc', correo: 'sin-arroba', contrasena_temporal: 'corta' }).expect(400);
    assert.equal(r.body.codigo, 'DATOS_INVALIDOS');
    assert.deepEqual(Object.keys(r.body.campos).sort(),
      ['contrasena_temporal', 'correo', 'nombre_completo', 'nombre_usuario', 'rol_id', 'telefono']);
    const x = await alta({ nombre_completo: 'Rol Fantasma', nombre_usuario: 'fantasma', rol_id: 999999, contrasena_temporal: await temporal() }).expect(400);
    assert.equal(x.body.campos.rol_id, 'Ese rol no existe.');
  });
});

describe('02a · Editar', () => {
  test('cambia datos de contacto y rol; la bitácora registra ambos y los permisos aplican de inmediato', async () => {
    const id = await idDe('psalas');
    const { agente: pedro } = await entrar('psalas', 'Nueva2026x');
    await pedro.get('/api/auth/sesion').expect(200);
    const r = await gerente.put(`/api/usuarios/${id}`).send({
      nombre_completo: 'Pedro Salas Ruiz', telefono: '', correo: 'pedro@correo.com', rol_id: await rolId('Hostess'),
    }).expect(200);
    assert.equal(r.body.rol, 'Hostess');
    assert.equal(r.body.telefono, null);
    const acciones = (await bd("SELECT accion FROM bitacora WHERE entidad = 'usuario' AND entidad_id = $1 ORDER BY id", [id])).map((x) => x.accion);
    assert.ok(acciones.includes('cambiar_rol'));
    assert.ok(acciones.includes('editar_datos'));
    const s = await pedro.get('/api/auth/sesion').expect(200);
    assert.equal(s.body.usuario.rol, 'Hostess');
    assert.ok(s.body.permisos.some((p) => p.clave === 'reservacion.gestionar'));
  });

  test('el nombre de usuario no se cambia al editar', async () => {
    const id = await idDe('psalas');
    const r = await gerente.put(`/api/usuarios/${id}`).send({
      nombre_completo: 'Pedro Salas Ruiz', nombre_usuario: 'otro', rol_id: await rolId('Hostess'),
    }).expect(200);
    assert.equal(r.body.nombre_usuario, 'psalas');
  });

  test('un usuario que no existe: 404', async () => {
    await gerente.get('/api/usuarios/999999').expect(404);
    await gerente.put('/api/usuarios/no-es-id').send({}).expect(404);
  });
});

describe('Protecciones del gerente', () => {
  test('no puede cambiar su propio rol, darse de baja ni restablecer su contraseña', async () => {
    const yo = await idDe('lsaenz');
    const a = await gerente.put(`/api/usuarios/${yo}`).send({ nombre_completo: 'Luis Sáenz Jiménez', rol_id: await rolId('Mesero') }).expect(409);
    assert.match(a.body.mensaje, /propio rol/);
    const b = await gerente.post(`/api/usuarios/${yo}/dar-de-baja`).expect(409);
    assert.match(b.body.mensaje, /a ti mismo/);
    const c = await gerente.post(`/api/usuarios/${yo}/restablecer-contrasena`).expect(409);
    assert.match(c.body.mensaje, /otro gerente/);
  });

  test('nadie puede dejar al sistema sin un Gerente activo', async () => {
    // Un rol con «Administrar usuarios» que no es Gerente
    const sup = await gerente.post('/api/roles').send({ nombre: 'Supervisor', permisos: ['usuario.administrar'] }).expect(201);
    const t = await temporal();
    await alta({ nombre_completo: 'Sara Supervisora', nombre_usuario: 'ssup', rol_id: sup.body.id, contrasena_temporal: t }).expect(201);
    const { agente: supervisora } = await activar('ssup', t);
    const lsaenz = await idDe('lsaenz');
    const baja = await supervisora.post(`/api/usuarios/${lsaenz}/dar-de-baja`).expect(409);
    assert.equal(baja.body.mensaje, 'Luis Sáenz Jiménez es el único Gerente activo: no se puede darlo de baja. Primero da de alta a otro Gerente.');
    const rol = await supervisora.put(`/api/usuarios/${lsaenz}`).send({ nombre_completo: 'Luis Sáenz Jiménez', rol_id: await rolId('Cajera') }).expect(409);
    assert.match(rol.body.mensaje, /único Gerente activo/);
  });
});

describe('02a · Restablecer contraseña', () => {
  test('da una temporal nueva, cierra sus sesiones y le pide crear la suya (01b)', async () => {
    const id = await idDe('cruiz');
    const { agente: carlos } = await entrar('cruiz');
    const r = await gerente.post(`/api/usuarios/${id}/restablecer-contrasena`).expect(200);
    assert.match(r.body.temporal, /^[A-Za-z]{6}\d{4}$/);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.body.usuario.requiere_cambio_pw, true);
    const b = await ultimaBitacora('usuario', id);
    assert.equal(b.accion, 'restablecer_contrasena');
    assert.equal(b.por, 'lsaenz');
    await carlos.get('/api/auth/sesion').expect(401);
    assert.equal((await entrar('cruiz', DEMO)).r.status, 401, 'la contraseña anterior ya no sirve');
    const { r: con } = await entrar('cruiz', r.body.temporal);
    assert.equal(con.body.usuario.requiere_cambio_pw, true);
  });

  test('a un Pendiente que perdió su temporal también se le restablece, y queda registrado', async () => {
    const id = await idDe('smendez');
    const r = await gerente.post(`/api/usuarios/${id}/restablecer-contrasena`).expect(200);
    assert.equal(r.body.usuario.estado, 'pendiente');
    assert.equal((await ultimaBitacora('usuario', id)).accion, 'restablecer_contrasena');
    assert.equal((await entrar('smendez', TEMPORAL)).r.status, 401);
    assert.equal((await entrar('smendez', r.body.temporal)).r.status, 200);
  });
});

describe('Dar de baja y reactivar', () => {
  test('dar de baja corta su sesión al instante y ya no puede entrar; no se edita ni se restablece', async () => {
    const id = await idDe('alopez');
    const { agente: ana } = await entrar('alopez');
    const r = await gerente.post(`/api/usuarios/${id}/dar-de-baja`).expect(200);
    assert.equal(r.body.estado_etiqueta, 'Dado de baja');
    await ana.get('/api/auth/sesion').expect(401);
    assert.equal((await entrar('alopez')).r.body.codigo, 'CUENTA_DADA_DE_BAJA');
    await gerente.put(`/api/usuarios/${id}`).send({ nombre_completo: 'Ana López', rol_id: await rolId('Hostess') }).expect(409);
    await gerente.post(`/api/usuarios/${id}/restablecer-contrasena`).expect(409);
    await gerente.post(`/api/usuarios/${id}/dar-de-baja`).expect(409);
    const b = await ultimaBitacora('usuario', id);
    assert.equal(b.accion, 'cambiar_estado');
    assert.equal(b.por, 'lsaenz');
  });

  test('reactivar: vuelve a Activo si ya había entrado, y puede entrar con su contraseña', async () => {
    const id = await idDe('alopez');
    const r = await gerente.post(`/api/usuarios/${id}/reactivar`).expect(200);
    assert.equal(r.body.estado, 'activo');
    assert.equal((await entrar('alopez')).r.status, 200);
    await gerente.post(`/api/usuarios/${id}/reactivar`).expect(409);
  });

  test('reactivar a quien nunca entró lo regresa a Pendiente', async () => {
    const r = await alta({ nombre_completo: 'Nunca Entró', nombre_usuario: 'nentro', rol_id: await rolId('Cajera'), contrasena_temporal: await temporal() }).expect(201);
    await gerente.post(`/api/usuarios/${r.body.id}/dar-de-baja`).expect(200);
    const x = await gerente.post(`/api/usuarios/${r.body.id}/reactivar`).expect(200);
    assert.equal(x.body.estado, 'pendiente');
  });

  test('si su rol está dado de baja, primero hay que reactivar el rol (jvega, Encargado de barra)', async () => {
    const rol = await rolId('Encargado de barra');
    const id = await idDe('jvega');
    await gerente.post(`/api/roles/${rol}/dar-de-baja`).expect(200);
    const r = await gerente.post(`/api/usuarios/${id}/reactivar`).expect(409);
    assert.equal(r.body.mensaje, 'El rol Encargado de barra está dado de baja: reactívalo primero en Roles y permisos.');
    await gerente.post(`/api/roles/${rol}/reactivar`).expect(200);
    const ok = await gerente.post(`/api/usuarios/${id}/reactivar`).expect(200);
    assert.equal(ok.body.estado, 'activo');
  });
});

describe('02a · Ver historial', () => {
  test('la bitácora de la cuenta en texto, con quién lo hizo, y lo que se conserva (comandas, cobros)', async () => {
    const r = await gerente.get(`/api/usuarios/${await idDe('alopez')}/historial`).expect(200);
    const textos = r.body.eventos.map((e) => e.texto);
    assert.equal(textos[0], 'Estado de la cuenta: Dado de baja → Activo');
    assert.ok(textos.includes('Estado de la cuenta: Activo → Dado de baja'));
    assert.ok(textos.includes('Alta en el sistema como Hostess'));
    assert.equal(r.body.eventos[0].hecho_por, 'Luis Sáenz Jiménez');
    const carlos = await gerente.get(`/api/usuarios/${await idDe('cruiz')}/historial`).expect(200);
    assert.ok(carlos.body.conservado.comandas > 0, 'sus comandas siguen ahí');
    const pedro = await gerente.get(`/api/usuarios/${await idDe('psalas')}/historial`).expect(200);
    assert.ok(pedro.body.eventos.some((e) => e.texto === 'Rol: Mesero → Hostess'));
    assert.ok(pedro.body.eventos.some((e) => e.texto === 'Datos editados: nombre, teléfono'));
  });
});
