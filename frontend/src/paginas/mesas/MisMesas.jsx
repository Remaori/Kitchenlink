// 05a · Mis mesas (mesero): el salón desde el mesero; sus mesas primero.
//   Abrir comanda y continuar la que ya tiene. Operaciones de mesas: cambiar de mesa o de personas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { AbrirComanda, Contador } from '../comandas/AbrirComanda.jsx';

const LEYENDA = [['comanda_abierta', 'Comanda abierta'], ['por_cobrar', 'Por cobrar'], ['por_atender', 'Por atender'], ['libre', 'Libre']];

export default function MisMesas() {
  const { datos: sesion } = useSesion();
  const yo = sesion.usuario.id;
  const navegar = useNavigate();
  const t = useAhora();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [elegida, setElegida] = useState(null);
  const [dialogo, setDialogo] = useState(null);

  const cargar = useCallback(() => api.get('/mesas').then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['mesas', 'comandas', 'produccion', 'reservaciones', 'espera'], cargar, { respaldoMs: 5_000 });
  const quitarAviso = useCallback(() => setAviso(null), []);
  const listo = (texto) => { setDialogo(null); setAviso(texto); cargar(); };

  const mesas = datos?.mesas ?? [];
  // La mesa que cambia (cocina la dejó lista, la hostess sentó a alguien…) se ilumina un momento
  const reciente = useRecientes(datos?.mesas, (m) => m.id,
    (m) => `${m.estado}|${m.comanda_id ?? ''}|${m.mesero_usuario_id ?? ''}|${m.platillos_listos}|${m.productos_sin_enviar}|${m.en_preparacion ?? ''}`);
  const mia = (m) => m.mesero_usuario_id === yo;
  const otra = (m) => m.mesero_usuario_id && !mia(m);
  // Primero lo que el mesero trabaja, luego lo que puede abrir, al final lo que no es suyo
  const orden = (m) => (mia(m) ? 0 : m.estado === 'por_atender' ? 1 : m.estado === 'libre' ? 2 : m.estado === 'reservada' ? 3 : m.estado === 'bloqueada' ? 4 : 5);
  const visibles = useMemo(() => mesas
    .filter((m) => (filtro === 'mias' ? mia(m) : filtro === 'libres' ? m.estado === 'libre' : true))
    .sort((a, b) => orden(a) - orden(b) || a.numero.localeCompare(b.numero)), [mesas, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const abribles = mesas.filter((m) => ['libre', 'por_atender'].includes(m.estado));
  const seleccion = abribles.find((m) => m.id === elegida) ?? abribles.find((m) => m.estado === 'por_atender') ?? null;
  const listos = mesas.filter(mia).reduce((s, m) => s + m.platillos_listos, 0);
  const conListos = mesas.filter((m) => mia(m) && m.platillos_listos > 0);

  return (
    <>
      <Encabezado titulo="Mis mesas" subtitulo="Toca una mesa para abrir su comanda o continuar la que ya tiene">
        {listos > 0 ? (
          <button className="aviso-cocina listo" onClick={() => navegar(`/comandas/${conListos[0].comanda_id}`)}>
            <Ic.IconoCampana width={18} height={18} />{contar(listos, 'platillo listo', 'platillos listos')} por entregar · Mesa {conListos.map((m) => m.numero).join(', ')}
          </button>
        ) : (
          <span className="aviso-cocina"><Ic.IconoCampana width={18} height={18} />Sin platillos listos por entregar</span>
        )}
      </Encabezado>

      <div className="contenido">
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando texto="Cargando tus mesas…" />}

        {datos && (
          <div className="mis-mesas">
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
                    elegida={seleccion?.id === m.id}
                    alAbrir={() => setElegida(m.id)}
                    alContinuar={() => navegar(`/comandas/${m.comanda_id}`)}
                    alCambiarMesa={() => setDialogo({ tipo: 'mesa', mesa: m })}
                    alCambiarPersonas={() => setDialogo({ tipo: 'personas', mesa: m })} />
                ))}
              </div>
            </div>

            {seleccion ? (
              <AbrirComanda mesa={seleccion} mesas={mesas} enDialogo={false} alCambiarMesa={setElegida} />
            ) : (
              <section className="tarjeta panel-lateral abrir-comanda">
                <h2>Abrir comanda</h2>
                <p className="tarjeta-sub">Toca una mesa libre o que sentó la hostess para abrir su comanda.</p>
              </section>
            )}
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

function TarjetaMiMesa({ m, t, mia, otra, reciente, elegida, alAbrir, alContinuar, alCambiarMesa, alCambiarPersonas }) {
  const hace = (f) => `hace ${minutosDesde(f, t)} min`;
  let lineas = []; let insignia = m.estado_etiqueta; let boton = null; let aviso = null; let tonoAviso = '';
  if (otra) {
    lineas = [`Atiende: ${m.mesero}`, 'No es tu mesa', 'La atiende otro mesero'];
  } else if (m.estado === 'comanda_abierta') {
    lineas = [`${m.folio} · abierta ${hace(m.abierta_en)} · ${dinero(m.total)}`];
    if (m.platillos_listos > 0) { aviso = `${contar(m.platillos_listos, 'platillo listo', 'platillos listos')} para entregar`; tonoAviso = 'verde'; }
    else if (m.en_preparacion) { aviso = `${m.en_preparacion.replace(/ \d+ g$/, '')} en preparación · ${minutosDesde(m.en_preparacion_desde, t)} min`; tonoAviso = 'ambar'; }
    else if (m.productos_sin_enviar > 0) { aviso = `${contar(m.productos_sin_enviar, 'producto')} sin enviar`; tonoAviso = 'morado'; }
    else aviso = 'Todo enviado a cocina';
    boton = <button className="boton boton-suave ancho" onClick={alContinuar}>Continuar comanda</button>;
  } else if (m.estado === 'por_cobrar') {
    lineas = [`${m.folio} · abierta ${hace(m.abierta_en)}`, `Cuenta pedida ${hora(m.cuenta_pedida_en)} · ${dinero(m.total)}`];
    boton = <button className="boton boton-secundario ancho" onClick={alContinuar}>Ver comanda</button>;
  } else if (m.estado === 'por_atender') {
    lineas = [`Sentado por la hostess ${hace(m.sentada_en)}`, 'Todavía no tiene comanda'];
    boton = <button className="boton boton-morado ancho" onClick={alAbrir}>Abrir comanda</button>;
  } else if (m.estado === 'libre') {
    lineas = [`Libre desde las ${hora(m.libre_desde)}`, m.proxima_reservacion ? `Reservación ${hora(m.proxima_reservacion_hora)}: solo si terminan antes` : 'Para clientes sin reservación'];
    boton = <button className="boton boton-secundario ancho" onClick={alAbrir}>Abrir comanda</button>;
  } else if (m.estado === 'reservada') {
    insignia = `Reservada ${hora(m.proxima_reservacion_hora)}`;
    lineas = [`Esperando a ${m.proxima_reservacion}`, `Se libera a las ${hora(m.se_libera_si_no_llega)} si no llega`, 'No se puede abrir comanda'];
  } else if (m.estado === 'bloqueada') {
    lineas = [m.motivo_bloqueo, 'No se puede abrir comanda'];
  }
  return (
    <article className={`tarjeta-mi-mesa${otra ? ' ajena' : ''}${elegida ? ' elegida' : ''}${reciente}`}>
      <header>
        <span className="tarjeta-mesa-titulo"><Ic.IconoMesa width={17} height={17} />Mesa {m.numero}</span>
        <span className="tarjeta-mesa-personas"><Ic.IconoPersonas width={16} height={16} />{m.numero_personas ?? m.personas_por_atender ?? m.capacidad}</span>
      </header>
      <Insignia tono={m.estado_tono}>{insignia}</Insignia>
      <div className="tarjeta-mi-mesa-texto">
        {lineas.map((l, i) => <p key={l} className={i ? 'tenue' : ''}>{l}</p>)}
        {aviso && <p className={`aviso ${tonoAviso}`}>{aviso}</p>}
      </div>
      {boton}
      {mia && ['comanda_abierta', 'por_cobrar'].includes(m.estado) && (
        <div className="tarjeta-mi-mesa-operaciones">
          <button className="enlace" onClick={alCambiarMesa}><Ic.IconoIntercambio width={15} height={15} />Cambiar mesa</button>
          {m.estado === 'comanda_abierta' && <button className="enlace" onClick={alCambiarPersonas}><Ic.IconoPersonas width={15} height={15} />Personas</button>}
        </div>
      )}
    </article>
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
