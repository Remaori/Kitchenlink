// 06 · Panel de cocina y de barra (pantalla KDS)
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { useCambios } from '../../tiempoReal.js';
import { minutosDesde, useAhora } from '../../reloj.js';
import { contar, hora } from '../../formato.js';
import { Cargando, Insignia, Segmentos } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import * as Ic from '../../componentes/Iconos.jsx';

const COLUMNAS = [
  ['por_preparar', 'Por preparar', 'Llegaron y nadie los ha empezado', 'gray'],
  ['en_preparacion', 'En preparación', 'Alguien ya los está preparando', 'warn'],
  ['listo', 'Listo para entregar', 'El mesero ya recibió el aviso', 'ok'],
];
const BOTON = {
  por_preparar: ['Empezar a preparar', 'boton-morado'],
  en_preparacion: ['Marcar como listo', 'boton-verde'],
  listo: ['Marcar como entregado', 'boton-suave'],
};
// Semáforo del tiempo en preparación (minutos desde que llegó el envío)
const tonoTiempo = (min) => (min >= 15 ? 'rojo' : min >= 8 ? 'ambar' : '');

// Un "ding" corto cuando llega un envío nuevo (sin archivos externos)
function sonar() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch { /* sin audio: no pasa nada */ }
}

export default function Panel({ destino }) {
  const { tienePermiso } = useSesion();
  const navegar = useNavigate();
  const mueve = tienePermiso('produccion.cambiar_estado');
  const t = useAhora(15_000);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const [moviendo, setMoviendo] = useState(null);
  const vistos = useRef(null);
  const [nuevos, setNuevos] = useState([]);
  const anteriores = useRef([]);

  const cargar = useCallback(() => api.get(`/produccion/${destino}`).then((d) => {
    const ids = d.columnas.por_preparar.map((x) => x.envio_id);
    if (vistos.current === null) vistos.current = new Set(ids); // al abrir la pantalla, lo que ya estaba no es "nuevo"
    const recientes = ids.filter((i) => !vistos.current.has(i));
    if (recientes.some((i) => !anteriores.current.includes(i))) sonar();
    anteriores.current = recientes;
    setNuevos(recientes);
    setDatos(d);
    setError(null);
  }).catch((e) => setError(e.message)), [destino]);
  useEffect(() => { vistos.current = null; anteriores.current = []; setNuevos([]); setDatos(null); cargar(); }, [cargar]);
  useCambios(['produccion', 'comandas'], cargar, { respaldoMs: 5_000 });

  const verNuevos = () => { for (const i of nuevos) vistos.current.add(i); anteriores.current = []; setNuevos([]); };
  async function avanzar(tarjeta) {
    setMoviendo(tarjeta.envio_id);
    setErrorAccion(null);
    vistos.current?.add(tarjeta.envio_id);
    try {
      await api.post(`/produccion/envios/${tarjeta.envio_id}/avanzar`, { destino, estado: tarjeta.siguiente });
      await cargar();
    } catch (e) {
      setErrorAccion(e.message);
    } finally {
      setMoviendo(null);
    }
  }

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Panel de {destino}</h1>
          <p>Cada tarjeta es un envío del mesero. Si una mesa pide más, llega como un envío nuevo.</p>
        </div>
        <div className="encabezado-acciones">
          <button className={`aviso-nuevos${nuevos.length ? ' hay' : ''}`} onClick={verNuevos} disabled={!nuevos.length}>
            <Ic.IconoCampana width={18} height={18} />{nuevos.length ? contar(nuevos.length, 'envío nuevo', 'envíos nuevos') : 'Sin envíos nuevos'}
          </button>
          <Segmentos opciones={[['cocina', 'Cocina'], ['barra', 'Barra']]} valor={destino} alCambiar={(d) => navegar(`/${d}`)} etiqueta="Panel" />
        </div>
      </header>

      <div className="contenido">
        <Alerta>{error || errorAccion}</Alerta>
        {!datos && !error && <Cargando texto="Cargando el panel…" />}
        {datos && (
          <div className="panel-columnas">
            {COLUMNAS.map(([estado, titulo, sub, tono]) => {
              const tarjetas = datos.columnas[estado];
              return (
                <section key={estado} className="panel-columna">
                  <div className="panel-columna-encabezado">
                    <h2>{titulo}</h2><Insignia tono={tono}>{contar(tarjetas.length, 'envío')}</Insignia>
                  </div>
                  <p className="panel-columna-sub">{sub}</p>
                  {tarjetas.map((x) => (
                    <Tarjeta key={`${x.envio_id}-${x.destino}`} x={x} t={t} nueva={nuevos.includes(x.envio_id)} mueve={mueve}
                      moviendo={moviendo === x.envio_id} alAvanzar={() => avanzar(x)} />
                  ))}
                  {!tarjetas.length && <p className="panel-vacio">Sin envíos</p>}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function Tarjeta({ x, t, nueva, mueve, moviendo, alAvanzar }) {
  const minEnvio = minutosDesde(x.enviado_en, t);
  const [texto, clase] = BOTON[x.estado];
  return (
    <article className={`tarjeta-envio ${x.estado}${nueva ? ' nueva' : ''}`}>
      <header>
        <span className="tarjeta-envio-titulo"><Ic.IconoMesa width={17} height={17} /><strong>Mesa {x.mesa}</strong><span> · Envío {x.envio_numero}</span></span>
        {x.estado === 'por_preparar' && <span className="tiempo"><Ic.IconoReloj width={16} height={16} />hace {minEnvio} min</span>}
        {x.estado === 'en_preparacion' && <span className={`tiempo ${tonoTiempo(minEnvio)}`}><Ic.IconoReloj width={16} height={16} />{minEnvio} min</span>}
        {x.estado === 'listo' && <span className="tiempo"><Ic.IconoReloj width={16} height={16} />listo hace {minutosDesde(x.listo_en, t)} min</span>}
      </header>
      <p className="tarjeta-envio-sub">
        {x.es_adicional && <Insignia tono="purple">Adicional</Insignia>}
        {nueva && <Insignia tono="info">Nuevo</Insignia>}
        <span>{x.mesero} · {hora(x.enviado_en)}</span>
      </p>
      <ul className="tarjeta-envio-productos">
        {x.productos.map((p) => (
          <li key={p.id}>
            <span className="cantidad-panel">{p.cantidad}×</span>
            <div><strong>{p.nombre_producto}</strong><small>{p.detalle_texto}</small></div>
          </li>
        ))}
      </ul>
      {x.resto_del_envio && <p className="tarjeta-envio-resto">{x.resto_del_envio}</p>}
      {x.nota_mesa && <p className="alergia"><Ic.IconoAlerta width={16} height={16} />{x.nota_mesa}</p>}
      {x.estado === 'listo' && <p className="se-aviso"><Ic.IconoCampana width={16} height={16} />Se avisó a {x.mesero}</p>}
      {mueve && <button className={`boton ${clase} ancho`} disabled={moviendo} onClick={alAvanzar}>{moviendo ? 'Guardando…' : texto}</button>}
    </article>
  );
}
