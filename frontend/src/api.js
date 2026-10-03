// Cliente de la API. La sesión viaja en una cookie httpOnly: aquí no se
// guarda ni se ve ningún token.
export class ErrorApi extends Error {
  constructor(estado, cuerpo) {
    super(cuerpo?.mensaje || `Error ${estado}`);
    this.estado = estado;
    this.codigo = cuerpo?.codigo;
    this.cuerpo = cuerpo || {};
  }
}

let alTerminarSesion = null;
// El proveedor de sesión se registra aquí para enterarse si el servidor
// dice que la sesión terminó (venció, la cerraron o dieron de baja al usuario).
export const cuandoTermineLaSesion = (fn) => { alTerminarSesion = fn; };

async function pedir(metodo, ruta, cuerpo) {
  let r;
  try {
    r = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(0, { codigo: 'SIN_RED', mensaje: 'No hay conexión con el servidor. Revisa la red del restaurante.' });
  }
  const datos = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (!datos && r.status >= 500) {
      throw new ErrorApi(r.status, { codigo: 'SIN_API', mensaje: 'El servidor de KitchenLink no responde. Avisa al gerente.' });
    }
    if (r.status === 401 && datos?.codigo === 'SESION_TERMINADA' && alTerminarSesion) alTerminarSesion(datos.mensaje);
    throw new ErrorApi(r.status, datos);
  }
  return datos;
}

export const api = {
  get: (ruta) => pedir('GET', ruta),
  post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}),
};
