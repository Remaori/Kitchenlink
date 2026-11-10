// Comandas: las abiertas (4 nov · Gestionar comanda) y el historial del día
// (11 nov · Consultar historial de comandas). El mesero ve las suyas; el
// gerente, todas. La misma lista es "Cuentas abiertas" de la cajera.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { useCambios } from '../../tiempoReal.js';
import { ahora, minutosDesde, useAhora } from '../../reloj.js';
import { contar, diaISO, dinero, hora } from '../../formato.js';
import { Encabezado } from '../../componentes/Pagina.jsx';
import { Cargando, Explicacion, Indicador, Insignia, Pestanas } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { SelectorFecha } from '../recepcion/Reservaciones.jsx';
import { useRecientes } from '../../usos.js';

export default function Comandas({ caja = false }) {
  const { tienePermiso, moduloVisible } = useSesion();
  const navegar = useNavigate();
  const t = useAhora();
  const historial = moduloVisible('historial_comandas');
  const [vista, setVista] = useState('activas');
  const [fecha, setFecha] = useState(() => diaISO(ahora()));
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const todas = caja || tienePermiso('comanda.cancelar') || tienePermiso('reporte.ver');

  const cargar = useCallback(() => api.get(vista === 'historial' ? `/comandas?vista=historial&fecha=${fecha}` : '/comandas')
    .then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), [vista, fecha]);
  useEffect(() => { setDatos(null); cargar(); }, [cargar]);
  useCambios(['comandas', 'produccion', 'caja'], cargar);

  const comandas = datos?.comandas ?? [];
  // La comanda que cambia (cocina avanzó, se pidió la cuenta…) se ilumina un momento
  const reciente = useRecientes(datos?.comandas, (c) => c.id,
    (c) => `${c.estado}|${c.sin_enviar}|${c.en_cocina}|${c.listos}|${c.total}`);
  const abrir = (c) => navegar(caja ? `/cobro?comanda=${c.id}` : `/comandas/${c.id}`);
  const n = (e) => comandas.filter((c) => c.estado === e).length;

  return (
    <>
      <Encabezado titulo={caja ? 'Cuentas abiertas' : 'Comandas'}
        subtitulo={caja ? 'Todas las mesas con comanda: las que pidieron la cuenta se cobran en Cobro'
          : todas ? 'Las comandas de todas las mesas' : 'Tus comandas: toca una para continuarla'}>
        {vista === 'historial' && <SelectorFecha valor={fecha} alCambiar={setFecha} />}
      </Encabezado>
      <div className="contenido">
        {!caja && historial && (
          <Pestanas valor={vista} alCambiar={setVista} opciones={[['activas', 'Abiertas'], ['historial', 'Historial del día']]} />
        )}
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando />}

        {datos && vista === 'historial' && (
          <div className="indicadores cuatro">
            <Indicador titulo="Comandas del día" valor={comandas.length} detalle={todas ? 'De todos los meseros' : 'Que abriste tú'} />
            <Indicador titulo="Cerradas" valor={n('cerrada')} detalle={dinero(comandas.filter((c) => c.estado === 'cerrada').reduce((s, c) => s + Number(c.total), 0))} tono="ok" />
            <Indicador titulo="Abiertas o por cobrar" valor={n('abierta') + n('por_cobrar')} detalle="Todavía en servicio" tono="morado" />
            <Indicador titulo="Canceladas" valor={n('cancelada')} detalle="Con autorización del gerente" tono="bad" />
          </div>
        )}

        {datos && (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Mesa</th><th>Folio</th><th>Personas</th>{todas && <th>Mesero</th>}<th>Abierta</th>
                  {vista === 'historial' && <th>Terminó</th>}<th>Estado</th>{vista === 'activas' && <th>Cocina y barra</th>}
                  <th className="num">Total</th>{vista === 'historial' && <th className="num">Pagado</th>}
                </tr>
              </thead>
              <tbody>
                {comandas.map((c) => (
                  <tr key={c.id} className={`clicable${reciente(c)}`} onClick={() => abrir(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && abrir(c)}>
                    <td><strong>Mesa {c.mesa}</strong></td>
                    <td>{c.folio}</td>
                    <td>{c.numero_personas}</td>
                    {todas && <td>{c.mesero}</td>}
                    <td>{hora(c.abierta_en)}{vista === 'activas' && <span className="texto-gris"> · hace {minutosDesde(c.abierta_en, t)} min</span>}</td>
                    {vista === 'historial' && <td>{c.cerrada_en ? hora(c.cerrada_en) : c.cancelada_en ? hora(c.cancelada_en) : '—'}</td>}
                    <td><Insignia tono={c.estado_tono}>{c.estado_etiqueta}</Insignia>{c.cancelaciones > 0 && c.estado !== 'cancelada' && <small className="motivo">{contar(c.cancelaciones, 'cancelación', 'cancelaciones')}</small>}</td>
                    {vista === 'activas' && <td className="texto-gris"><EnCocina c={c} /></td>}
                    <td className="num">{dinero(c.total)}</td>
                    {vista === 'historial' && <td className="num">{dinero(c.pagado)}</td>}
                  </tr>
                ))}
                {!comandas.length && (
                  <tr><td colSpan={9} className="tabla-vacia">{vista === 'historial' ? 'No hubo comandas ese día.' : 'No hay comandas abiertas.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {vista === 'historial' && <Explicacion>Nada se borra: una comanda cerrada o cancelada se conserva con sus envíos, pagos y cancelaciones. Tócala para ver su detalle y sus movimientos.</Explicacion>}
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
