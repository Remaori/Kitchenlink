// Campos de los formularios de administración (02b, 02c): etiqueta con *,
// texto de ayuda debajo y, si el servidor rechazó el dato, su mensaje en rojo.
import { useId, useState } from 'react';
import { IconoCopiar, IconoLlave, IconoPalomita } from './Iconos.jsx';

function Envoltura({ id, etiqueta, obligatorio, ayuda, error, children }) {
  return (
    <div className={`campo-form${error ? ' con-error' : ''}`}>
      <label htmlFor={id}>{etiqueta}{obligatorio && <span className="obligatorio" aria-hidden="true">*</span>}</label>
      {children}
      {error ? <p className="campo-error" id={`${id}-nota`}>{error}</p>
        : ayuda && <p className="campo-ayuda" id={`${id}-nota`}>{ayuda}</p>}
    </div>
  );
}

export function Entrada({ etiqueta, obligatorio, ayuda, error, icono, ...props }) {
  const id = useId();
  return (
    <Envoltura {...{ id, etiqueta, obligatorio, ayuda, error }}>
      <div className={`entrada${icono ? ' con-icono' : ''}`}>
        <input id={id} aria-invalid={!!error} aria-describedby={error || ayuda ? `${id}-nota` : undefined}
          aria-required={obligatorio || undefined} {...props} />
        {icono && <span className="entrada-icono">{icono}</span>}
      </div>
    </Envoltura>
  );
}

export function Selector({ etiqueta, obligatorio, ayuda, error, children, ...props }) {
  const id = useId();
  return (
    <Envoltura {...{ id, etiqueta, obligatorio, ayuda, error }}>
      <select id={id} className="selector" aria-invalid={!!error} aria-describedby={error || ayuda ? `${id}-nota` : undefined}
        aria-required={obligatorio || undefined} {...props}>
        {children}
      </select>
    </Envoltura>
  );
}

// Copia al portapapeles. En la red local la app puede abrirse por http://IP,
// donde el navegador no da navigator.clipboard: entonces se usa el método viejo.
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = texto;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

/** 02b · Recuadro de la contraseña temporal con "Copiar" (y "Generar otra" al dar de alta) */
export function ContrasenaTemporal({ valor, alGenerar, error }) {
  const [copiado, setCopiado] = useState(false);
  async function alCopiar() {
    setCopiado(await copiar(valor));
    setTimeout(() => setCopiado(false), 2000);
  }
  return (
    <div className={`temporal${error ? ' con-error' : ''}`}>
      <IconoLlave className="temporal-icono" />
      <code className="temporal-valor" aria-label="Contraseña temporal">{valor || '········'}</code>
      <button type="button" className="boton boton-chico boton-secundario" onClick={alCopiar} disabled={!valor}>
        {copiado ? <><IconoPalomita width={15} height={15} />Copiada</> : <><IconoCopiar width={15} height={15} />Copiar</>}
      </button>
      {alGenerar && <button type="button" className="boton boton-chico boton-suave" onClick={alGenerar}>Generar otra</button>}
    </div>
  );
}
