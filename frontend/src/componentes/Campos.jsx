import { useId, useState } from 'react';
import { IconoAlerta, IconoOjo, IconoOjoTachado } from './Iconos.jsx';

export function Logo({ tam = 46 }) {
  return <div className="logo" style={{ width: tam, height: tam, fontSize: tam * 0.43 }} aria-hidden="true">K</div>;
}

// Campo de texto con ícono a la derecha
export function Campo({ etiqueta, icono, ...props }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="entrada">
        <input id={id} {...props} />
        {icono && <span className="entrada-icono">{icono}</span>}
      </div>
    </div>
  );
}

// Campo de contraseña con botón para mostrarla (ojo)
export function CampoContrasena({ etiqueta, ...props }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="entrada">
        <input id={id} type={visible ? 'text' : 'password'} {...props} />
        <button type="button" className="entrada-boton" onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={visible ? 'Ocultar' : 'Mostrar'}>
          {visible ? <IconoOjoTachado /> : <IconoOjo />}
        </button>
      </div>
    </div>
  );
}

export function Alerta({ children }) {
  if (!children) return null;
  return (
    <div className="alerta" role="alert">
      <IconoAlerta width={17} height={17} />
      <span>{children}</span>
    </div>
  );
}
