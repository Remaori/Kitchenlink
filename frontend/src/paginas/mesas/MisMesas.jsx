// 05a · Mis mesas (mesero): el salón desde el mesero; sus mesas primero.
//   Operaciones de mesas: cambiar de mesa o de personas una comanda abierta.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { useCambios } from '../../tiempoReal.js';
import { minutosDesde, useAhora } from '../../reloj.js';
import { contar, dinero, hora } from '../../formato.js';
import { AvisoExito, Encabezado } from '../../componentes/Pagina.jsx';
import { Cargando, Fichas, Insignia } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useAccion, useRecientes } from '../../usos.js';

const LEYENDA = [['comanda_abierta', 'Comanda abierta'], ['por_cobrar', 'Por cobrar'], ['por_atender', 'Por atender'], ['libre', 'Libre']];

export default function MisMesas() {
  const { datos: sesion } = useSesion();
  const yo = sesion.usuario.id;
  const t = useAhora();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [dialogo, setDialogo] = useState(null);

  const cargar = useCallback(() => api.get('/mesas').then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['mesas', 'comandas', 'reservaciones', 'espera'], cargar);
  const quitarAviso = useCallback(() => setAviso(null), []);
  const listo = (texto) => { setDialogo(null); setAviso(texto); cargar(); };

  const mesas = datos?.mesas ?? [];
  // La mesa que cambia (la hostess sentó a alguien, se cambió de mesa…) se ilumina un momento
  const reciente = useRecientes(datos?.mesas, (m) => m.id, (m) => `${m.estado}|${m.comanda_id ?? ''}|${m.mesero_usuario_id ?? ''}|${m.numero_personas ?? ''}`);
  const mia = (m) => m.mesero_usuario_id === yo;
  const otra = (m) => m.mesero_usuario_id && !mia(m);
  // Primero lo que el mesero trabaja, luego lo libre o por atender, al final lo que no es suyo
  const orden = (m) => (mia(m) ? 0 : m.estado === 'por_atender' ? 1 : m.estado === 'libre' ? 2 : m.estado === 'reservada' ? 3 : m.estado === 'bloqueada' ? 4 : 5);
  const visibles = useMemo(() => mesas
    .filter((m) => (filtro === 'mias' ? mia(m) : filtro === 'libres' ? m.estado === 'libre' : true))
    .sort((a, b) => orden(a) - orden(b) || a.numero.localeCompare(b.numero)), [mesas, filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Encabezado titulo="Mis mesas" subtitulo="Tus mesas y el salón en este momento" />

      <div className="contenido">
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando texto="Cargando tus mesas…" />}

        {datos && (
          <div className="mis-mesas sin-panel">
            <div>
              <div className="filtros">
                <Fichas valor={filtro} alCambiar={setFiltro} etiqueta="Filtrar mesas" opciones={[
                  ['todas', `Todas (${mesas.length})`], ['mias', `Mis mesas (${mesas.filter(mia).length})`],
                  ['libres', `Libres (${mesas.filter((m) => m.estado === 'libre').length})`]]} />
                <div className="leyenda-estados derecha">
                  {LEYENDA.map(([e, texto]) => <span key={e} className={`punto-estado ${e}`}>{texto}</span>)}
                </div>
              </div>
              <div className="rejilla-mis-mesas">
                {visibles.map((m) => (
                  <TarjetaMiMesa key={m.id} m={m} t={t} mia={mia(m)} otra={otra(m)} reciente={reciente(m)}
                    alCambiarMesa={() => setDialogo({ tipo: 'mesa', mesa: m })}
                    alCambiarPersonas={() => setDialogo({ tipo: 'personas', mesa: m })} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {dialogo?.tipo === 'mesa' && <DialogoCambiarMesa comanda={{ id: dialogo.mesa.comanda_id, folio: dialogo.mesa.folio, mesa: dialogo.mesa.numero, numero_personas: dialogo.mesa.numero_personas }}
        mesas={mesas} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === 'personas' && <DialogoCambiarPersonas comanda={{ id: dialogo.mesa.comanda_id, folio: dialogo.mesa.folio, mesa: dialogo.mesa.numero, numero_personas: dialogo.mesa.numero_personas }}
        capacidad={dialogo.mesa.capacidad} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
    </>
  );
}

function TarjetaMiMesa({ m, t, mia, otra, reciente, alCambiarMesa, alCambiarPersonas }) {
  const hace = (f) => `hace ${minutosDesde(f, t)} min`;
  let lineas = []; let insignia = m.estado_etiqueta;
  if (otra) {
    lineas = [`Atiende: ${m.mesero}`, 'No es tu mesa', 'La atiende otro mesero'];
  } else if (m.estado === 'comanda_abierta') {
    lineas = [`${m.folio} · abierta ${hace(m.abierta_en)} · ${dinero(m.total)}`];
  } else if (m.estado === 'por_cobrar') {
    lineas = [`${m.folio} · abierta ${hace(m.abierta_en)}`, `Cuenta pedida ${hora(m.cuenta_pedida_en)} · ${dinero(m.total)}`];
  } else if (m.estado === 'por_atender') {
    lineas = [`Sentado por la hostess ${hace(m.sentada_en)}`, 'Todavía no tiene comanda'];
  } else if (m.estado === 'libre') {
    lineas = [`Libre desde las ${hora(m.libre_desde)}`, m.proxima_reservacion ? `Reservación ${hora(m.proxima_reservacion_hora)}: solo si terminan antes` : 'Para clientes sin reservación'];
  } else if (m.estado === 'reservada') {
    insignia = `Reservada ${hora(m.proxima_reservacion_hora)}`;
    lineas = [`Esperando a ${m.proxima_reservacion}`, `Se libera a las ${hora(m.se_libera_si_no_llega)} si no llega`];
  } else if (m.estado === 'bloqueada') {
    lineas = [m.motivo_bloqueo, `Bloqueada por ${m.bloqueada_por ?? 'el gerente'}`];
  }
  return (
    <article className={`tarjeta-mi-mesa${otra ? ' ajena' : ''}${reciente}`}>
      <header>
        <span className="tarjeta-mesa-titulo"><Ic.IconoMesa width={17} height={17} />Mesa {m.numero}</span>
        <span className="tarjeta-mesa-personas"><Ic.IconoPersonas width={16} height={16} />{m.numero_personas ?? m.personas_por_atender ?? m.capacidad}</span>
      </header>
      <Insignia tono={m.estado_tono}>{insignia}</Insignia>
      <div className="tarjeta-mi-mesa-texto">
        {lineas.map((l, i) => <p key={l} className={i ? 'tenue' : ''}>{l}</p>)}
      </div>
      {mia && ['comanda_abierta', 'por_cobrar'].includes(m.estado) && (
        <div className="tarjeta-mi-mesa-operaciones">
          <button className="enlace" onClick={alCambiarMesa}><Ic.IconoIntercambio width={15} height={15} />Cambiar mesa</button>
          {m.estado === 'comanda_abierta' && <button className="enlace" onClick={alCambiarPersonas}><Ic.IconoPersonas width={15} height={15} />Personas</button>}
        </div>
      )}
    </article>
  );
}

/** Más o menos personas, entre `min` y `max` */
function Contador({ valor, alCambiar, min = 1, max = 30, singular = 'persona', plural }) {
  return (
    <div className="contador">
      <button type="button" className="contador-boton" aria-label="Menos" disabled={valor <= min} onClick={() => alCambiar(Math.max(min, valor - 1))}><Ic.IconoMenos /></button>
      <span>{contar(valor, singular, plural)}</span>
      <button type="button" className="contador-boton" aria-label="Más" disabled={valor >= max} onClick={() => alCambiar(Math.min(max, valor + 1))}><Ic.IconoMas /></button>
    </div>
  );
}

/** "Cambiar mesa": a una mesa libre donde quepan (la anterior se libera) */
export function DialogoCambiarMesa({ comanda, mesas, alCerrar, alTerminar }) {
  const libres = mesas.filter((m) => m.estado === 'libre');
  const [mesaId, setMesaId] = useState('');
  const accion = useAccion(alTerminar);
  const destino = libres.find((m) => String(m.id) === mesaId);
  return (
    <Dialogo titulo={`Cambiar de mesa la comanda ${comanda.folio}`} alCerrar={alCerrar}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button className="boton boton-primario compacto" disabled={!destino || accion.enviando}
          onClick={() => accion.hacer(() => api.put(`/comandas/${comanda.id}/mesa`, { mesa_id: destino.id }),
            `La comanda ${comanda.folio} pasó de la Mesa ${comanda.mesa} a la Mesa ${destino.numero}.`)}>Cambiar a la Mesa {destino?.numero ?? '…'}</button>
      </>}>
      <p>Está en la <strong>Mesa {comanda.mesa}</strong> con {contar(comanda.numero_personas, 'persona')}. Solo se cambia a una mesa libre donde quepan; la anterior queda libre y el cambio queda en la bitácora.</p>
      <div className="opciones-mesa">
        {libres.map((m) => {
          const cabe = m.capacidad >= comanda.numero_personas;
          return (
            <button key={m.id} type="button" disabled={!cabe} className={String(m.id) === mesaId ? 'elegida' : ''} onClick={() => setMesaId(String(m.id))}>
              <strong>Mesa {m.numero}</strong><small>{cabe ? contar(m.capacidad, 'lugar', 'lugares') : `Solo ${m.capacidad} lugares`}{m.proxima_reservacion ? ` · reservación ${hora(m.proxima_reservacion_hora)}` : ''}</small>
            </button>
          );
        })}
        {!libres.length && <p className="texto-tenue">No hay mesas libres ahora.</p>}
      </div>
      <Alerta>{accion.error}</Alerta>
    </Dialogo>
  );
}

/** "Personas": se ajusta si llegó o se fue alguien */
export function DialogoCambiarPersonas({ comanda, capacidad, alCerrar, alTerminar }) {
  const [personas, setPersonas] = useState(comanda.numero_personas);
  const accion = useAccion(alTerminar);
  return (
    <Dialogo titulo={`Personas en la Mesa ${comanda.mesa}`} alCerrar={alCerrar}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button className="boton boton-primario compacto" disabled={accion.enviando || personas === comanda.numero_personas}
          onClick={() => accion.hacer(() => api.put(`/comandas/${comanda.id}/personas`, { numero_personas: personas }),
            `La Mesa ${comanda.mesa} ahora es de ${contar(personas, 'persona')}.`)}>Guardar</button>
      </>}>
      <p>Si llegó alguien más o se fue alguien, ajústalo para la cuenta y los reportes. La mesa es para {contar(capacidad, 'persona')}.</p>
      <Contador valor={personas} alCambiar={setPersonas} max={capacidad} />
      <Alerta>{accion.error}</Alerta>
    </Dialogo>
  );
}
