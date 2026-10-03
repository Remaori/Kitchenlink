-- =====================================================================
--  KitchenLink · 02 · Permisos del usuario de la aplicación
-- =====================================================================
--  Ejecutar en pgAdmin conectado a la base "kitchenlink" como postgres,
--  DESPUÉS de 01_esquema_v3.sql.
--
--  IMPORTANTE: 01 borra y vuelve a crear el esquema, y con él se pierden
--  estos permisos. Cada vez que ejecutes 01, ejecuta también este.
--  (`npm run db:instalar` ya lo hace en orden.)
--
--  Principio: el backend solo puede hacer lo que la operación necesita.
--    · Puede leer todo (tablas y vistas).
--    · Escribe solo donde las pantallas escriben.
--    · NO puede modificar ni borrar la bitácora, los pagos ni las
--      cancelaciones: se registran y no se tocan. Lo impide PostgreSQL
--      antes de llegar a los triggers.
--    · NO puede crear, alterar ni borrar tablas, ni vaciar datos.
-- =====================================================================

SET search_path TO kitchenlink, public;

-- Ajustes de la base: esquema por defecto y zona horaria del restaurante
-- (los reportes por hora y el corte del día dependen de ella).
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET search_path TO kitchenlink, public', current_database());
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Mexico_City');
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO kitchenlink_app', current_database());
END $$;

REVOKE ALL ON SCHEMA kitchenlink FROM PUBLIC;
GRANT USAGE ON SCHEMA kitchenlink TO kitchenlink_app;

-- Lectura: todas las tablas y las 22 vistas (pantallas, tickets y reportes)
GRANT SELECT ON ALL TABLES IN SCHEMA kitchenlink TO kitchenlink_app;

-- Alta y cambios donde la operación los necesita
GRANT INSERT, UPDATE ON rol, usuario, sesion, mesa, categoria, producto,
                        reservacion, lista_espera, comanda, envio,
                        detalle_comanda, corte_caja
      TO kitchenlink_app;

-- Solo alta: lo que se registra y ya no cambia
GRANT INSERT ON rol_permiso, pago, cancelacion, bitacora TO kitchenlink_app;

-- Borrar solo en dos casos del diseño:
--   rol_permiso     · desmarcar una casilla en 02c
--   detalle_comanda · "Quitar" un producto que sigue Sin enviar (05b)
GRANT DELETE ON rol_permiso, detalle_comanda TO kitchenlink_app;

-- Configuración: el gerente cambia valores, no crea ni borra claves
GRANT UPDATE (valor) ON configuracion TO kitchenlink_app;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA kitchenlink TO kitchenlink_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA kitchenlink TO kitchenlink_app;
