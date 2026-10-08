// Validación de los datos que llegan de los formularios.
// Junta los errores por campo para que la pantalla los muestre debajo de
// cada uno: 400 { codigo: 'DATOS_INVALIDOS', campos: { nombre: '…' } }.
import { ErrorHttp } from './errores.js';

export function revisor() {
  const campos = {};
  return {
    error(campo, mensaje) { campos[campo] ??= mensaje; },

    // Quita espacios de más. Vacío -> null.
    texto(campo, valor, { etiqueta, obligatorio = false, min = 1, max }) {
      if (valor != null && typeof valor !== 'string') { this.error(campo, `${etiqueta} no es válido.`); return null; }
      const t = (valor ?? '').trim().replace(/\s+/g, ' ');
      if (!t) {
        if (obligatorio) this.error(campo, `Escribe ${etiqueta.toLowerCase()}.`);
        return null;
      }
      if (t.length < min) this.error(campo, `${etiqueta}: al menos ${min} caracteres.`);
      if (max && t.length > max) this.error(campo, `${etiqueta}: máximo ${max} caracteres.`);
      return t;
    },

    terminar() {
      if (Object.keys(campos).length) {
        throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Revisa los datos marcados.', { campos });
      }
    },
  };
}

// Id numérico de la ruta (/api/roles/:id). Cualquier otra cosa es "no existe".
export function idDeRuta(valor, que = 'registro') {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErrorHttp(404, 'NO_ENCONTRADO', `No existe ese ${que}.`);
  return id;
}
