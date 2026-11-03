// 05a · Panel "Abrir comanda" (también en el detalle de una mesa de 04)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { contar, dinero, hora, iniciales } from '../../formato.js';
import { Explicacion } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';

/** Contador con − y + ("2 personas") */
export function Contador({ valor, alCambiar, min = 1, max = 30, singular = 'persona', plural }) {
  return (
    <div className="contador">
      <button type="button" className="contador-boton" aria-label="Menos" disabled={valor <= min} onClick={() => alCambiar(Math.max(min, valor - 1))}><Ic.IconoMenos /></button>
      <span>{contar(valor, singular, plural)}</span>
      <button type="button" className="contador-boton mas" aria-label="Más" disabled={valor >= max} onClick={() => alCambiar(Math.min(max, valor + 1))}><Ic.IconoMas /></button>
    </div>
  );
}

export function AbrirComanda({ mesa, mesas, enDialogo = true, alCerrar, alCambiarMesa }) {
  const { datos, tienePermiso } = useSesion();
  const navegar = useNavigate();
  const supervisa = tienePermiso('comanda.cancelar');
  const [personas, setPersonas] = useState(Math.min(mesa.personas_por_atender ?? 2, mesa.capacidad));
  const [mesero, setMesero] = useState(String(datos.usuario.id));
  const [meseros, setMeseros] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => { setPersonas(Math.min(mesa.personas_por_atender ?? 2, mesa.capacidad)); setError(null); }, [mesa.id, mesa.personas_por_atender, mesa.capacidad]);
  useEffect(() => { api.get(`/mesas/${mesa.id}`).then(setDetalle).catch(() => setDetalle(null)); }, [mesa.id]);
  useEffect(() => { if (supervisa) api.get('/comandas/meseros').then(setMeseros).catch(() => {}); }, [supervisa]);

  async function abrir() {
    setEnviando(true);
    setError(null);
    try {
      const r = await api.post('/comandas', { mesa_id: mesa.id, numero_personas: personas, mesero_usuario_id: Number(mesero) });
      navegar(`/comandas/${r.comanda.id}`);
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }

  const disponibles = (mesas ?? []).filter((m) => ['libre', 'por_atender'].includes(m.estado));
  const contenido = (
    <>
      <div className="campo-form">
        <span className="etiqueta">Mesa</span>
        {cambiando && alCambiarMesa ? (
          <select className="selector" value={mesa.id} autoFocus onChange={(e) => { alCambiarMesa(Number(e.target.value)); setCambiando(false); }}>
            {disponibles.map((m) => <option key={m.id} value={m.id}>Mesa {m.numero} · {contar(m.capacidad, 'lugar', 'lugares')} · {m.estado_etiqueta}</option>)}
          </select>
        ) : (
          <div className="caja-gris">
            <Ic.IconoMesa width={17} height={17} /><span>Mesa {mesa.numero} · {contar(mesa.capacidad, 'lugar', 'lugares')}</span>
            {alCambiarMesa && <button type="button" className="enlace" onClick={() => setCambiando(true)}>Cambiar</button>}
          </div>
        )}
      </div>

      <div className="campo-form">
        <span className="etiqueta">Número de personas</span>
        <Contador valor={personas} alCambiar={setPersonas} max={mesa.capacidad} />
        <p className="campo-ayuda">{mesa.estado === 'por_atender'
          ? `La hostess registró ${mesa.personas_por_atender}; ajústalo si cambió.`
          : `La mesa es para ${contar(mesa.capacidad, 'persona')}.`}</p>
      </div>

      <div className="campo-form">
        <span className="etiqueta">Mesero asignado</span>
        {supervisa && meseros.length ? (
          <select className="selector" value={mesero} onChange={(e) => setMesero(e.target.value)} aria-label="Mesero asignado">
            {meseros.map((m) => <option key={m.id} value={m.id}>{m.nombre_completo}{m.id === datos.usuario.id ? ' (tú)' : ` · ${m.rol}`}</option>)}
          </select>
        ) : (
          <div className="caja-morada">
            <span className="avatar blanco">{iniciales(datos.usuario.nombre_completo)}</span>
            <div><strong>{datos.usuario.nombre_completo} (tú)</strong><small>Asignado automáticamente</small></div>
          </div>
        )}
        <p className="campo-ayuda">Quien abre la comanda queda como su mesero. Él o el gerente pueden transferirla.</p>
      </div>

      <div className="campo-form">
        <span className="etiqueta">Reservación vinculada</span>
        <div className="caja-gris">
          {mesa.estado === 'por_atender' && mesa.grupo_por_atender
            ? <span>{mesa.grupo_por_atender} · se vincula sola (lo sentó la hostess)</span>
            : <span className="texto-gris">Sin reservación</span>}
        </div>
      </div>

      <Alerta>{error}</Alerta>
      {!enDialogo && (
        <button className="boton boton-primario" onClick={abrir} disabled={enviando}><Ic.IconoMas width={17} height={17} />{enviando ? 'Abriendo…' : 'Abrir comanda'}</button>
      )}

      {detalle?.comandas_de_hoy?.length > 0 && (
        <div className="comandas-de-hoy">
          <h3>Comandas de hoy en esta mesa</h3>
          <ul>
            {detalle.comandas_de_hoy.map((c) => (
              <li key={c.id}>
                <div><strong>{c.folio} · {c.estado_etiqueta.toLowerCase()}</strong>
                  <small>{hora(c.abierta_en)} – {c.terminada_en ? hora(c.terminada_en) : '…'} · {contar(c.numero_personas, 'persona')}</small></div>
                <span>{dinero(c.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Explicacion>Una mesa tiene una sola comanda abierta a la vez. En el día tiene tantas como grupos la ocupen.</Explicacion>
    </>
  );

  if (!enDialogo) {
    return (
      <section className="tarjeta panel-lateral abrir-comanda">
        <h2>Abrir comanda</h2>
        <p className="tarjeta-sub">Mesa {mesa.numero} · {contar(mesa.capacidad, 'lugar', 'lugares')}</p>
        {contenido}
      </section>
    );
  }
  return (
    <Dialogo titulo={`Abrir comanda · Mesa ${mesa.numero}`} alCerrar={alCerrar} ancho={480}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button className="boton boton-primario compacto" onClick={abrir} disabled={enviando} data-foco>{enviando ? 'Abriendo…' : 'Abrir comanda'}</button>
      </>}>
      <div className="abrir-comanda">{contenido}</div>
    </Dialogo>
  );
}
