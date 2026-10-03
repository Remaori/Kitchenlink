-- =====================================================================
--  KitchenLink · 00 · Crear la base de datos y el usuario de la aplicación
-- =====================================================================
--  LO NORMAL es no usar este archivo: `npm run db:instalar` hace esto
--  y los pasos 01 a 04 de una vez (ver database/README.md).
--
--  Si prefieres hacerlo a mano en pgAdmin:
--    · Conéctate a la base "postgres" con el usuario postgres.
--    · Cambia CAMBIA_ESTA_CONTRASENA por la misma que pusiste en
--      DB_PASSWORD de backend/.env.
--    · Ejecuta CADA sentencia POR SEPARADO (selecciónala y F5):
--      CREATE DATABASE no se puede ejecutar junto con otras sentencias.
-- =====================================================================

-- 1) Usuario con el que se conecta el backend. No es superusuario y no
--    puede crear bases ni roles: solo lo que le da 02_permisos_app.sql.
CREATE ROLE kitchenlink_app LOGIN PASSWORD 'CAMBIA_ESTA_CONTRASENA'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- 2) La base, en UTF8 (acepta cualquier carácter que se escriba en la
--    aplicación: acentos, ñ, símbolos).
CREATE DATABASE kitchenlink ENCODING 'UTF8' TEMPLATE template0;

-- Si ya tenías una base "kitchenlink", revisa su codificación (conectado
-- a ella):  SHOW server_encoding;
-- Si dice WIN1252, conviene recrearla en UTF8:  npm run db:instalar -- --recrear
