// Tiempo real (Socket.IO) · pantalla 11: "envía los cambios de estado de
// comandas a cocina, barra y meseros al instante".
//
// El servidor no manda datos por aquí, solo avisa QUÉ cambió ("comandas",
// "mesas", "produccion"…). Cada pantalla abierta que muestra eso vuelve a
// pedirlo a la API, que revisa la sesión y los permisos como siempre. Así un
// aviso nunca entrega información que la persona no podría consultar.
import { Server } from 'socket.io';
import { COOKIE, verificar } from './seguridad/tokens.js';
import { cargarSesion } from './seguridad/servicio.js';
import { ahora } from './reloj.js';

let io = null;

export const TEMAS = ['menu', 'mesas', 'reservaciones', 'espera', 'comandas', 'produccion', 'caja'];

function leerCookie(encabezado = '', nombre) {
  for (const parte of encabezado.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Se conecta al servidor HTTP (server.js). Solo entran dispositivos con sesión. */
export function iniciarTiempoReal(servidorHttp) {
  io = new Server(servidorHttp, { path: '/socket.io', serveClient: false });
  io.use(async (socket, next) => {
    try {
      const datos = verificar(leerCookie(socket.request.headers.cookie, COOKIE) ?? '');
      const s = datos && (await cargarSesion(datos));
      if (!s || s.usuario.requiere_cambio_pw) return next(new Error('SIN_SESION'));
      socket.data.usuarioId = s.usuario.id;
      next();
    } catch (e) {
      next(e);
    }
  });
  io.on('connection', (socket) => socket.join('sesiones'));
  return io;
}

/** Avisa a todas las pantallas abiertas que cambió algo de estos temas. */
export function avisar(...temas) {
  io?.to('sesiones').emit('cambio', { temas, en: ahora().toISOString() });
}

export const cerrarTiempoReal = () => new Promise((listo) => (io ? io.close(() => listo()) : listo()));
