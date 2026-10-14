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

    // Número entero (llega como número o como texto de un campo). Vacío -> null.
    entero(campo, valor, { etiqueta, obligatorio = false, min, max }) {
      if (valor == null || valor === '') {
        if (obligatorio) this.error(campo, `Escribe ${etiqueta.toLowerCase()}.`);
        return null;
      }
      const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
      if (!Number.isInteger(n)) { this.error(campo, `${etiqueta} debe ser un número entero.`); return null; }
      if (min != null && n < min) this.error(campo, `${etiqueta}: mínimo ${min}.`);
      if (max != null && n > max) this.error(campo, `${etiqueta}: máximo ${max}.`);
      return n;
    },

    // Dinero con hasta 2 decimales. Devuelve TEXTO ("120.50") para que PostgreSQL
    // lo guarde en NUMERIC sin pasar por punto flotante. Acepta "$1,250.5".
    dinero(campo, valor, { etiqueta, obligatorio = false, min = 0, mayorQueCero = false }) {
      if (valor == null || valor === '') {
        if (obligatorio) this.error(campo, `Escribe ${etiqueta.toLowerCase()}.`);
        return null;
      }
      const t = String(valor).trim().replace(/[$,\s]/g, '');
      if (!/^\d{1,8}(\.\d{1,2})?$/.test(t)) { this.error(campo, `${etiqueta}: escribe una cantidad como 120 o 120.50.`); return null; }
      const n = Number(t);
      if (mayorQueCero && n <= 0) this.error(campo, `${etiqueta} debe ser mayor que cero.`);
      else if (n < min) this.error(campo, `${etiqueta}: mínimo $${min}.`);
      return n.toFixed(2);
    },

    // Uno de una lista de valores (ej. destino 'cocina' | 'barra')
    opcion(campo, valor, opciones, { etiqueta, obligatorio = true }) {
      if (valor == null || valor === '') {
        if (obligatorio) this.error(campo, `Elige ${etiqueta.toLowerCase()}.`);
        return null;
      }
      if (!opciones.includes(valor)) { this.error(campo, `${etiqueta} no es válido.`); return null; }
      return valor;
    },

    // Id de otra tabla elegido en un selector
    id(campo, valor, { etiqueta, obligatorio = true }) {
      if (valor == null || valor === '') {
        if (obligatorio) this.error(campo, `Elige ${etiqueta.toLowerCase()}.`);
        return null;
      }
      const n = Number(valor);
      if (!Number.isSafeInteger(n) || n <= 0) { this.error(campo, `${etiqueta} no es válido.`); return null; }
      return n;
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
