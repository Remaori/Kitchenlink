// 04 · Mesas (gerente, hostess, caja): las mesas del salón con su capacidad
// y su zona. «Crear mesa», editar y dar de baja: «Crear y bloquear mesas».
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { contar, sinAcentos } from '../../formato.js';
import { AvisoExito, Encabezado } from '../../componentes/Pagina.jsx';
import { Buscador, Cargando, Explicacion } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada } from '../../componentes/Formulario.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useAccion, useFormulario } from '../../usos.js';

export default function Mesas() {
  const { tienePermiso } = useSesion();
  const administra = tienePermiso('mesa.administrar');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [dialogo, setDialogo] = useState(null);

  const cargar = useCallback(() => api.get('/mesas').then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  const quitarAviso = useCallback(() => setAviso(null), []);
  const listo = (texto) => { setDialogo(null); setAviso(texto); cargar(); };

  const mesas = datos?.mesas ?? [];
  const q = sinAcentos(busqueda.trim());
  const visibles = useMemo(() => mesas.filter((m) => !q || sinAcentos(`mesa ${m.numero} ${m.zona ?? ''}`).includes(q)), [mesas, q]);

  return (
    <>
      <Encabezado titulo="Mesas" subtitulo="Las mesas del salón, su capacidad y su zona">
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

        {datos && (
          <div className="filtros mesas-filtros">
            <div className="filtros-derecha">
              <Buscador valor={busqueda} alCambiar={setBusqueda} texto="Buscar mesa…" className="buscador-chico" />
            </div>
          </div>
        )}

        {datos && (
          <div className="rejilla-mesas">
            {visibles.map((m) => (
              <button key={m.id} type="button" className="tarjeta-mesa" onClick={() => setDialogo({ tipo: 'mesa', mesa: m })} disabled={!administra}>
                <span className="tarjeta-mesa-titulo"><Ic.IconoMesa width={17} height={17} />Mesa {m.numero}</span>
                <span className="tarjeta-mesa-personas"><Ic.IconoPersonas width={16} height={16} />{contar(m.capacidad, 'persona')}</span>
                <span className="tarjeta-mesa-pie">
                  <span>{m.zona ? `Zona: ${m.zona}` : 'Sin zona'}</span>
                  {administra && <small>Toca para editar</small>}
                </span>
              </button>
            ))}
            {!visibles.length && <p className="texto-tenue">Ninguna mesa coincide.</p>}
          </div>
        )}

        {administra && datos?.dadas_de_baja?.length > 0 && (
          <MesasDeBaja mesas={datos.dadas_de_baja} alTerminar={listo} />
        )}
      </div>

      {dialogo?.tipo === 'mesa' && <DialogoMesa mesa={dialogo.mesa} zonas={[...new Set(mesas.map((m) => m.zona).filter(Boolean))]}
        alCerrar={() => setDialogo(null)} alTerminar={listo} />}
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
        <Entrada etiqueta="Número" obligatorio value={f.valores.numero} onChange={f.campo('numero')} error={f.errores.numero} maxLength={3}
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
