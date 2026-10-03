// Estado de la sesión para toda la aplicación
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, cuandoTermineLaSesion } from '../api.js';

const Contexto = createContext(null);

export function ProveedorSesion({ children }) {
  // datos = { usuario, permisos, sesion } o null si no hay sesión
  const [estado, setEstado] = useState({ cargando: true, datos: null, aviso: null });

  useEffect(() => {
    cuandoTermineLaSesion((mensaje) => setEstado({ cargando: false, datos: null, aviso: mensaje }));
    api.get('/auth/sesion')
      .then((datos) => setEstado({ cargando: false, datos, aviso: null }))
      .catch(() => setEstado((e) => ({ cargando: false, datos: null, aviso: e.aviso }))); // conserva "Tu sesión terminó…"
  }, []);

  const iniciarSesion = useCallback(async (usuario, contrasena) => {
    const datos = await api.post('/auth/iniciar-sesion', { usuario, contrasena });
    setEstado({ cargando: false, datos, aviso: null });
    return datos;
  }, []);

  const cambiarContrasena = useCallback(async (nueva, confirmacion) => {
    const datos = await api.post('/auth/cambiar-contrasena', { nueva, confirmacion });
    setEstado({ cargando: false, datos, aviso: null });
    return datos;
  }, []);

  const cerrarSesion = useCallback(async (aviso = null) => {
    await api.post('/auth/cerrar-sesion').catch(() => {});
    setEstado({ cargando: false, datos: null, aviso });
  }, []);

  const valor = useMemo(() => ({
    ...estado,
    tienePermiso: (clave) => !!estado.datos?.permisos.some((p) => p.clave === clave),
    iniciarSesion, cambiarContrasena, cerrarSesion,
  }), [estado, iniciarSesion, cambiarContrasena, cerrarSesion]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useSesion = () => useContext(Contexto);
