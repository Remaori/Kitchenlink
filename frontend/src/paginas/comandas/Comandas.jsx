// Comandas: las que están abiertas o por cobrar. El mesero ve las suyas; el gerente, todas.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { useCambios } from '../../tiempoReal.js';
import { minutosDesde, useAhora } from '../../reloj.js';
import { contar, dinero, hora } from '../../formato.js';
import { Encabezado } from '../../componentes/Pagina.jsx';
import { Cargando, Insignia } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { useRecientes } from '../../usos.js';

export default function Comandas() {
  const { tienePermiso } = useSesion();
  const navegar = useNavigate();
  const t = useAhora();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const todas = tienePermiso('comanda.cancelar') || tienePermiso('reporte.ver');

  const cargar = useCallback(() => api.get('/comandas').then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['comandas', 'produccion'], cargar);

  const comandas = datos?.comandas ?? [];
  // La comanda que cambia (cocina avanzó, se pidió la cuenta…) se ilumina un momento
  const reciente = useRecientes(datos?.comandas, (c) => c.id,
    (c) => `${c.estado}|${c.sin_enviar}|${c.en_cocina}|${c.listos}|${c.total}`);
  const abrir = (c) => navegar(`/comandas/${c.id}`);

  return (
    <>
      <Encabezado titulo="Comandas" subtitulo={todas ? 'Las comandas de todas las mesas' : 'Tus comandas: toca una para continuarla'} />
      <div className="contenido">
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando />}

        {datos && (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Mesa</th><th>Folio</th><th>Personas</th>{todas && <th>Mesero</th>}<th>Abierta</th>
                  <th>Estado</th><th>Cocina y barra</th><th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {comandas.map((c) => (
                  <tr key={c.id} className={`clicable${reciente(c)}`} onClick={() => abrir(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && abrir(c)}>
                    <td><strong>Mesa {c.mesa}</strong></td>
                    <td>{c.folio}</td>
                    <td>{c.numero_personas}</td>
                    {todas && <td>{c.mesero}</td>}
                    <td>{hora(c.abierta_en)}<span className="texto-gris"> · hace {minutosDesde(c.abierta_en, t)} min</span></td>
                    <td><Insignia tono={c.estado_tono}>{c.estado_etiqueta}</Insignia>{c.cancelaciones > 0 && <small className="motivo">{contar(c.cancelaciones, 'cancelación', 'cancelaciones')}</small>}</td>
                    <td className="texto-gris"><EnCocina c={c} /></td>
                    <td className="num">{dinero(c.total)}</td>
                  </tr>
                ))}
                {!comandas.length && <tr><td colSpan={8} className="tabla-vacia">No hay comandas abiertas.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** "2 listos · 1 en cocina · 3 sin enviar" */
function EnCocina({ c }) {
  const partes = [];
  if (c.listos) partes.push(<span key="l" className="texto-ok">{c.listos} {c.listos === 1 ? 'listo' : 'listos'}</span>);
  if (c.en_cocina) partes.push(`${c.en_cocina} en cocina`);
  if (c.sin_enviar) partes.push(`${c.sin_enviar} sin enviar`);
  if (!partes.length) return c.productos ? 'Todo entregado' : 'Sin productos';
  return partes.flatMap((x, i) => (i ? [' · ', x] : [x]));
}
