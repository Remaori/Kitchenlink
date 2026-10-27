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
    // Como texto solo cifras: "1e1", "0x10", "4.0" o "+4" no se aceptan aunque JavaScript
    // los pueda convertir (un campo type="number" del navegador deja escribirlos).
    entero(campo, valor, { etiqueta, obligatorio = false, min, max }) {
      if (valor == null || valor === '') {
        if (obligatorio) this.error(campo, `Escribe ${etiqueta.toLowerCase()}.`);
        return null;
      }
      const t = typeof valor === 'number' ? null : String(valor).trim();
      const n = t === null ? valor : /^-?\d{1,9}$/.test(t) ? Number(t) : NaN;
      if (!Number.isSafeInteger(n)) { this.error(campo, `${etiqueta} debe ser un número entero.`); return null; }
      if (min != null && n < min) this.error(campo, `${etiqueta}: mínimo ${min}.`);
      if (max != null && n > max) this.error(campo, `${etiqueta}: máximo ${max}.`);
      return n;
    },

    // Dinero con hasta 2 decimales. Devuelve TEXTO ("120.50") para que PostgreSQL
    // lo guarde en NUMERIC sin pasar por punto flotante. Acepta "$1,250.5"; la coma solo
    // separa miles ("12,50" no es 12.50 ni 1250: se rechaza).
    dinero(campo, valor, { etiqueta, obligatorio = false, min = 0, mayorQueCero = false }) {
      if (valor == null || valor === '') {
        if (obligatorio) this.error(campo, `Escribe ${etiqueta.toLowerCase()}.`);
        return null;
      }
      const s = String(valor).trim().replace(/^\$\s*/, '');
      if (!/^(\d{1,8}|\d{1,3}(,\d{3}){1,2})(\.\d{1,2})?$/.test(s)) { this.error(campo, `${etiqueta}: escribe una cantidad como 120 o 120.50.`); return null; }
      const t = s.replace(/,/g, '');
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

    // Nombre de una persona (usuario, cliente de una reservación o de la lista de espera): letras,
    // espacios, punto, apóstrofo y guion; al menos 2 letras. "12345" o "@@" no son nombres.
    nombre(campo, valor, { etiqueta, obligatorio = false, min, max = 120 }) {
      const t = this.texto(campo, valor, { etiqueta, obligatorio, min, max });
      if (t && (!/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(t) || (t.match(/\p{L}/gu) ?? []).length < 2)) {
        this.error(campo, `${etiqueta}: usa solo letras (sin números ni símbolos).`);
      }
      return t;
    },

    // Teléfono de México: 10 dígitos, con espacios, guiones o paréntesis si se quiere, y
    // +52 opcional. Se guarda como "55 1234 5678" (o "+52 55 1234 5678"). Vacío -> null.
    telefono(campo, valor, { etiqueta = 'El teléfono', obligatorio = false } = {}) {
      const t = this.texto(campo, valor, { etiqueta, obligatorio, max: 25 });
      if (!t) return null;
      const m = /^(\+52)?([\d\s().-]+)$/.exec(t);
      const d = m ? m[2].replace(/\D/g, '') : '';
      if (!m || d.length !== 10) { this.error(campo, `${etiqueta}: 10 dígitos (ej. 55 1234 5678).`); return null; }
      return `${m[1] ? '+52 ' : ''}${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
    },

    // Fecha AAAA-MM-DD que exista en el calendario (el 31 de febrero no)
    fecha(campo, valor, { etiqueta = 'La fecha' } = {}) {
      const m = typeof valor === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor) : null;
      const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (!m || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
        this.error(campo, !valor ? `Elige ${etiqueta.toLowerCase()}.` : m ? `${etiqueta} no existe en el calendario.` : `${etiqueta}: usa el formato AAAA-MM-DD.`);
        return null;
      }
      return valor;
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
