// 04 · Mesas (gerente, hostess, caja)
//   21 oct · Crear mesa: el catálogo de mesas (número, capacidad, zona)
//   28 oct · Operaciones: bloquear y desbloquear
//   11 nov · Monitoreo: estado en tiempo real, contadores, filtros y detalle de cada tarjeta
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { useCambios } from '../../tiempoReal.js';
import { minutosDesde, useAhora } from '../../reloj.js';
import { contar, dinero, hora, sinAcentos } from '../../formato.js';
import { AvisoExito, Encabezado } from '../../componentes/Pagina.jsx';
import { Buscador, Cargando, Explicacion, Fichas, Indicador, Insignia } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada } from '../../componentes/Formulario.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useAccion, useFormulario, useRecientes } from '../../usos.js';
import { AbrirComanda } from '../comandas/AbrirComanda.jsx';

export const LEYENDA = [['libre', 'Libre'], ['reservada', 'Reservada'], ['por_atender', 'Por atender'],
  ['comanda_abierta', 'Comanda abierta'], ['por_cobrar', 'Por cobrar'], ['bloqueada', 'Bloqueada']];
const FILTROS = {
  todas: () => true,
  libres: (m) => m.estado === 'libre',
  ocupadas: (m) => ['por_atender', 'comanda_abierta', 'por_cobrar'].includes(m.estado),
  reservadas: (m) => m.estado === 'reservada',
  bloqueadas: (m) => m.estado === 'bloqueada',
};

/** Las dos líneas de abajo de cada tarjeta de 04, según su estado (como en el diseño) */
export function lineasTarjeta(m, t) {
  const hace = (f) => `hace ${minutosDesde(f, t)} min`;
  switch (m.estado) {
    case 'libre':
      if (m.libre_porque_no_llego) return [`${m.libre_porque_no_llego} no se presentó`, `Libre desde las ${hora(m.libre_desde)}`];
      if (m.proxima_reservacion) {
        return [`Reservación ${hora(m.proxima_reservacion_hora)}`,
          `${m.proxima_reservacion_estado === 'por_confirmar' ? 'Por confirmar' : `Se aparta a las ${hora(m.proxima_reservacion_apartado)}`} · libre`];
      }
      return ['Sin mesero asignado', `Libre desde las ${hora(m.libre_desde)}`];
    case 'reservada': {
      const llego = new Date(m.proxima_reservacion_hora) <= t;
      return [`${m.proxima_reservacion} · ${hora(m.proxima_reservacion_hora)}`,
        llego ? `Se libera ${hora(m.se_libera_si_no_llega)} si no llega` : `Apartada desde las ${hora(m.proxima_reservacion_apartado)}`, llego ? 'ambar' : ''];
    }
    case 'por_atender':
      return ['Sentado por la hostess', `${hace(m.sentada_en).replace(/^h/, 'H')} · sin comanda`];
    case 'comanda_abierta':
      if (m.proxima_reservacion) return [`Mesero: ${m.mesero}`, `Reservación ${hora(m.proxima_reservacion_hora)}`, 'ambar'];
      if (m.grupo_de_reservacion) return [`Mesero: ${m.mesero}`, `${m.grupo_de_reservacion} · ${hace(m.abierta_en)}`];
      return [`Mesero: ${m.mesero}`, `Abierta ${hace(m.abierta_en)}`];
    case 'por_cobrar':
      return [`Mesero: ${m.mesero}`, `Pre-ticket de ${dinero(m.total)}`];
    case 'bloqueada':
      return [m.motivo_bloqueo, `Bloqueada por ${m.bloqueada_por ?? 'el gerente'}`];
    default:
      return ['', ''];
  }
}

export default function Mesas() {
  const { tienePermiso, moduloVisible } = useSesion();
  const administra = tienePermiso('mesa.administrar');
  const monitoreo = moduloVisible('monitoreo');
  const operaciones = moduloVisible('operaciones_mesas') && administra;
  const t = useAhora();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [dialogo, setDialogo] = useState(null);

  const cargar = useCallback(() => api.get('/mesas').then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['mesas', 'comandas', 'reservaciones', 'espera', 'produccion', 'caja'], cargar);
  const quitarAviso = useCallback(() => setAviso(null), []);
  const listo = (texto) => { setDialogo(null); setAviso(texto); cargar(); };
  // La mesa que cambia de estado (o de mesero) se ilumina un momento
  const reciente = useRecientes(datos?.mesas, (m) => m.id, (m) => `${m.estado}|${m.comanda_id ?? ''}|${m.mesero_usuario_id ?? ''}`);

  const mesas = datos?.mesas ?? [];
  const q = sinAcentos(busqueda.trim());
  const visibles = useMemo(() => mesas.filter((m) => (monitoreo ? FILTROS[filtro](m) : true)
    && (!q || sinAcentos(`mesa ${m.numero} ${m.zona ?? ''} ${m.mesero ?? ''}`).includes(q))), [mesas, filtro, q, monitoreo]);
  const r = datos?.resumen;

  return (
    <>
      <Encabezado titulo="Mesas" subtitulo={monitoreo ? `Estado en tiempo real del salón · Ahora: ${hora(t)}` : 'Las mesas del salón, su capacidad y su zona'}>
        {administra && (
          <button className="boton boton-primario compacto" onClick={() => setDialogo({ tipo: 'mesa' })}>
            <Ic.IconoMas width={17} height={17} />Crear mesa
          </button>
        )}
      </Encabezado>

      <div className="contenido">
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando texto="Cargando el salón…" />}

        {datos && monitoreo && (
          <div className="indicadores">
            <Indicador titulo="Total de mesas" valor={r.total} detalle="En el salón" />
            <Indicador titulo="Libres" valor={r.libres} detalle="Listas para sentar" tono="ok" />
            <Indicador titulo="Ocupadas" valor={r.ocupadas} detalle="Con un grupo sentado" tono="morado" />
            <Indicador titulo="Reservadas" valor={r.reservadas} detalle="Apartadas por reservación" tono="info" />
            <Indicador titulo="Bloqueadas" valor={r.bloqueadas} detalle="Con motivo registrado" tono="bad" />
          </div>
        )}

        {datos && (
          <div className="filtros mesas-filtros">
            {monitoreo && (
              <Fichas valor={filtro} alCambiar={setFiltro} etiqueta="Filtrar mesas"
                opciones={[['todas', 'Todas'], ['libres', 'Libres'], ['ocupadas', 'Ocupadas'], ['reservadas', 'Reservadas'], ['bloqueadas', 'Bloqueadas']]} />
            )}
            <div className="filtros-derecha">
              <Buscador valor={busqueda} alCambiar={setBusqueda} texto="Buscar mesa…" className="buscador-chico" />
              {operaciones && (
                <button className="boton boton-secundario" onClick={() => setDialogo({ tipo: 'bloqueo' })}>
                  <Ic.IconoCandado width={17} height={17} />Bloquear / desbloquear
                </button>
              )}
            </div>
          </div>
        )}

        {datos && monitoreo && (
          <div className="leyenda-estados">
            {LEYENDA.map(([e, texto]) => <span key={e} className={`punto-estado ${e}`}>{texto}</span>)}
          </div>
        )}

        {datos && (
          <div className="rejilla-mesas">
            {visibles.map((m) => {
              // Con las operaciones (antes del monitoreo) la tarjeta ya dice si está bloqueada y por qué
              const bloqueada = m.estado === 'bloqueada' && (monitoreo || operaciones);
              const [uno, dos, tonoDos] = monitoreo || bloqueada ? lineasTarjeta(m, t)
                : [m.zona ? `Zona: ${m.zona}` : 'Sin zona', administra ? 'Toca para editar' : ''];
              return (
                <button key={m.id} type="button" className={`tarjeta-mesa${bloqueada ? ' bloqueada' : ''}${reciente(m)}`}
                  onClick={() => setDialogo({ tipo: monitoreo || operaciones ? 'detalle' : 'mesa', mesa: m })}
                  disabled={!monitoreo && !operaciones && !administra}>
                  <span className="tarjeta-mesa-titulo">
                    <Ic.IconoMesa width={17} height={17} />Mesa {m.numero}
                    {monitoreo && <span className={`punto-estado solo ${m.estado}`} aria-hidden="true" />}
                  </span>
                  <span className="tarjeta-mesa-personas"><Ic.IconoPersonas width={16} height={16} />{contar(m.capacidad, 'persona')}</span>
                  {(monitoreo || bloqueada) && <Insignia tono={m.estado_tono}>{m.estado_etiqueta}</Insignia>}
                  <span className="tarjeta-mesa-pie">
                    <span>{uno}</span>
                    <small className={tonoDos}>{dos}</small>
                  </span>
                </button>
              );
            })}
            {!visibles.length && <p className="texto-tenue">Ninguna mesa coincide.</p>}
          </div>
        )}

        {monitoreo && (
          <Explicacion>Ocupadas = Por atender + Comanda abierta + Por cobrar. Solo «Bloqueada» se pone a mano (con motivo); los demás estados los cambia el sistema con las comandas y reservaciones.</Explicacion>
        )}

        {administra && datos?.dadas_de_baja?.length > 0 && (
          <MesasDeBaja mesas={datos.dadas_de_baja} alTerminar={listo} />
        )}
      </div>

      {dialogo?.tipo === 'mesa' && <DialogoMesa mesa={dialogo.mesa} zonas={[...new Set(mesas.map((m) => m.zona).filter(Boolean))]}
        alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === 'detalle' && (
        <DialogoDetalle mesa={dialogo.mesa} monitoreo={monitoreo} operaciones={operaciones} administra={administra}
          alEditar={() => setDialogo({ tipo: 'mesa', mesa: dialogo.mesa })} alCerrar={() => setDialogo(null)} alTerminar={listo} />
      )}
      {dialogo?.tipo === 'bloqueo' && <DialogoBloqueo mesas={mesas} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
    </>
  );
}

function MesasDeBaja({ mesas, alTerminar }) {
  const accion = useAccion(alTerminar);
  return (
    <section className="tarjeta mesas-baja">
      <h2>Mesas dadas de baja</h2>
      <p className="tarjeta-sub">No salen en el salón ni se pueden reservar. Su historial se conserva.</p>
      <ul>
        {mesas.map((m) => (
          <li key={m.id}>
            <span>Mesa {m.numero} · {contar(m.capacidad, 'persona')}{m.zona ? ` · ${m.zona}` : ''}</span>
            <button className="enlace" disabled={accion.enviando}
              onClick={() => accion.hacer(() => api.post(`/mesas/${m.id}/reactivar`), `La Mesa ${m.numero} regresó al salón.`)}>Reactivar</button>
          </li>
        ))}
      </ul>
      <Alerta>{accion.error}</Alerta>
    </section>
  );
}

/** "Crear mesa" y editar: número, capacidad y zona */
function DialogoMesa({ mesa, zonas, alCerrar, alTerminar }) {
  const nueva = !mesa;
  const f = useFormulario({ numero: mesa?.numero ?? '', capacidad: mesa?.capacidad ?? 4, zona: mesa?.zona ?? '' },
    (v) => (nueva ? api.post('/mesas', v) : api.put(`/mesas/${mesa.id}`, v)),
    (m) => alTerminar(nueva ? `Se creó la Mesa ${m.numero}: ya aparece en el salón como Libre.` : `Se guardaron los cambios de la Mesa ${m.numero}.`));
  const [baja, setBaja] = useState(false);
  const accion = useAccion(alTerminar);
  const capacidad = Number(f.valores.capacidad) || 0;
  return (
    <Dialogo titulo={nueva ? 'Crear mesa' : `Editar Mesa ${mesa.numero}`} alCerrar={alCerrar} ancho={500}
      acciones={<>
        {!nueva && !baja && <button type="button" className="boton boton-peligro" onClick={() => setBaja(true)}>Dar de baja</button>}
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-mesa" className="boton boton-primario compacto" disabled={f.enviando}>
          {f.enviando ? 'Guardando…' : nueva ? 'Crear mesa' : 'Guardar cambios'}
        </button>
      </>}>
      <form id="form-mesa" className="rejilla-campos sin-margen" onSubmit={f.guardar} noValidate>
        {/* Solo deja escribir dígitos (revisión del 11 nov): letras, signos y punto ni siquiera entran */}
        <Entrada etiqueta="Número" obligatorio value={f.valores.numero} onChange={(e) => f.campo('numero')(e.target.value.replace(/\D/g, ''))}
          error={f.errores.numero} maxLength={3}
          inputMode="numeric" placeholder="Ej. 22" autoFocus data-foco ayuda="Solo números enteros: «7» será la Mesa 07." />
        <div className="campo-form">
          <span className="etiqueta">Capacidad<span className="obligatorio" aria-hidden="true">*</span></span>
          <div className="contador">
            <button type="button" className="contador-boton" aria-label="Una persona menos" disabled={capacidad <= 1}
              onClick={() => f.campo('capacidad')(Math.max(1, capacidad - 1))}><Ic.IconoMenos /></button>
            <span>{contar(capacidad, 'persona')}</span>
            <button type="button" className="contador-boton" aria-label="Una persona más" disabled={capacidad >= 30}
              onClick={() => f.campo('capacidad')(Math.min(30, capacidad + 1))}><Ic.IconoMas /></button>
          </div>
          {f.errores.capacidad && <p className="campo-error">{f.errores.capacidad}</p>}
        </div>
        <div className="ancho-completo">
          <Entrada etiqueta="Zona" value={f.valores.zona} onChange={f.campo('zona')} error={f.errores.zona} maxLength={60}
            list="zonas" placeholder="Ej. Salón, Terraza, Ventana" />
          <datalist id="zonas">{zonas.map((z) => <option key={z} value={z} />)}</datalist>
        </div>
      </form>
      {nueva && <Explicacion>La mesa empieza Libre. Su estado lo cambian después las reservaciones y las comandas; solo «Bloqueada» se pone a mano.</Explicacion>}
      {baja && (
        <div className="confirmacion">
          <p>¿Dar de baja la <strong>Mesa {mesa.numero}</strong>? Ya no saldrá en el salón ni se podrá reservar. Solo se puede si está libre (o bloqueada) y sin reservaciones por venir.</p>
          <div className="botones">
            <button className="boton boton-secundario boton-chico" onClick={() => setBaja(false)}>No</button>
            <button className="boton boton-peligro-lleno boton-chico" disabled={accion.enviando}
              onClick={() => accion.hacer(() => api.post(`/mesas/${mesa.id}/dar-de-baja`), `La Mesa ${mesa.numero} quedó dada de baja.`)}>Sí, dar de baja</button>
          </div>
        </div>
      )}
      <Alerta>{f.error || accion.error}</Alerta>
    </Dialogo>
  );
}

/** Detalle de una tarjeta: qué tiene y lo que se puede hacer con ella */
function DialogoDetalle({ mesa: m, monitoreo, operaciones, administra, alEditar, alCerrar, alTerminar }) {
  const { tienePermiso, moduloVisible } = useSesion();
  const t = useAhora();
  const accion = useAccion(alTerminar);
  const [motivo, setMotivo] = useState('');
  const [abrir, setAbrir] = useState(false);
  const comandas = moduloVisible('comandas') && tienePermiso('comanda.abrir');
  const [uno, dos] = lineasTarjeta(m, t);
  if (abrir) return <AbrirComanda mesa={m} alCerrar={alCerrar} />;
  return (
    <Dialogo titulo={`Mesa ${m.numero} · ${contar(m.capacidad, 'lugar', 'lugares')}`} alCerrar={alCerrar} ancho={520}
      acciones={<>
        {administra && <button className="boton boton-secundario" onClick={alEditar}><Ic.IconoLapiz width={16} height={16} />Editar mesa</button>}
        <button className="boton boton-primario compacto" onClick={alCerrar} data-foco>Listo</button>
      </>}>
      {monitoreo && (
        <div className="detalle-mesa">
          <Insignia tono={m.estado_tono}>{m.estado_etiqueta}</Insignia>
          <p><strong>{uno}</strong><br /><span className="texto-gris">{dos}</span></p>
          {m.folio && <p className="texto-gris">Comanda {m.folio} · {contar(m.numero_personas, 'persona')} · {dinero(m.total)}</p>}
          {m.zona && <p className="texto-gris">Zona: {m.zona}</p>}
        </div>
      )}
      {comandas && m.comanda_id && (
        <Link className="boton boton-secundario ancho" to={`/comandas/${m.comanda_id}`}><Ic.IconoLista width={16} height={16} />Ver comanda {m.folio}</Link>
      )}
      {comandas && ['libre', 'por_atender'].includes(m.estado) && (
        <button className="boton boton-suave ancho" onClick={() => setAbrir(true)}><Ic.IconoMas width={16} height={16} />Abrir comanda</button>
      )}
      {operaciones && m.estado === 'libre' && (
        <form className="bloqueo" onSubmit={(e) => {
          e.preventDefault();
          accion.hacer(() => api.post(`/mesas/${m.id}/bloquear`, { motivo }), `La Mesa ${m.numero} quedó bloqueada.`);
        }}>
          <Entrada etiqueta="Bloquear la mesa" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={160} placeholder="Motivo: en limpieza, reparación…" />
          <button className="boton boton-secundario" disabled={accion.enviando || motivo.trim().length < 3}><Ic.IconoCandado width={16} height={16} />Bloquear</button>
        </form>
      )}
      {operaciones && m.estado === 'bloqueada' && (
        <button className="boton boton-secundario ancho" disabled={accion.enviando}
          onClick={() => accion.hacer(() => api.post(`/mesas/${m.id}/desbloquear`), `La Mesa ${m.numero} se desbloqueó.`)}>
          Desbloquear: queda lista para sentar</button>
      )}
      <Alerta>{accion.error}</Alerta>
    </Dialogo>
  );
}

/** "Bloquear / desbloquear": elegir la mesa sin buscar su tarjeta */
function DialogoBloqueo({ mesas, alCerrar, alTerminar }) {
  const libres = mesas.filter((m) => m.estado === 'libre');
  const bloqueadas = mesas.filter((m) => m.estado === 'bloqueada');
  const [mesaId, setMesaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const accion = useAccion(alTerminar);
  const m = mesas.find((x) => String(x.id) === mesaId);
  return (
    <Dialogo titulo="Bloquear o desbloquear una mesa" alCerrar={alCerrar} ancho={500}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        {m?.estado === 'bloqueada' ? (
          <button className="boton boton-primario compacto" disabled={accion.enviando}
            onClick={() => accion.hacer(() => api.post(`/mesas/${m.id}/desbloquear`), `La Mesa ${m.numero} se desbloqueó.`)}>Desbloquear</button>
        ) : (
          <button className="boton boton-primario compacto" disabled={!m || accion.enviando || motivo.trim().length < 3}
            onClick={() => accion.hacer(() => api.post(`/mesas/${m.id}/bloquear`, { motivo }), `La Mesa ${m.numero} quedó bloqueada.`)}>Bloquear</button>
        )}
      </>}>
      <div className="campo-form">
        <label htmlFor="mesa-bloqueo">Mesa</label>
        <select id="mesa-bloqueo" className="selector" value={mesaId} onChange={(e) => setMesaId(e.target.value)} data-foco>
          <option value="">Elige una mesa…</option>
          <optgroup label="Libres (se pueden bloquear)">{libres.map((x) => <option key={x.id} value={x.id}>Mesa {x.numero}</option>)}</optgroup>
          <optgroup label="Bloqueadas">{bloqueadas.map((x) => <option key={x.id} value={x.id}>Mesa {x.numero} · {x.motivo_bloqueo}</option>)}</optgroup>
        </select>
      </div>
      {m?.estado !== 'bloqueada' && (
        <div style={{ marginTop: 16 }}>
          <Entrada etiqueta="Motivo" obligatorio value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={160} placeholder="Ej. En limpieza" />
        </div>
      )}
      <Explicacion>Solo una mesa libre se bloquea. Una mesa ocupada, reservada o por cobrar la mueve el sistema.</Explicacion>
      <Alerta>{accion.error}</Alerta>
    </Dialogo>
  );
}
