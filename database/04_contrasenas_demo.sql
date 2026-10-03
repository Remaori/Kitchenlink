-- =====================================================================
--  KitchenLink · 04 · Contraseñas de demostración
-- =====================================================================
--  03_prueba_coherencia_v3.sql crea al personal de las pantallas con
--  hashes de mentira ('bcrypt:temporal', 'bcrypt:propia') porque solo
--  prueba reglas. Este archivo les pone hashes bcrypt REALES para poder
--  entrar a la aplicación en la demostración:
--
--      Activos y dado de baja ...... Kitchen2026
--      Pendiente (smendez) ......... Temporal2026  (le pide crear la suya)
--
--  Solo toca usuarios que todavía tienen un hash de mentira: si hay
--  usuarios reales con contraseña propia, no les pasa nada.
--  NO usar en producción: ahí el primer gerente se crea con
--      npm run usuario:gerente
-- =====================================================================

SET search_path TO kitchenlink, public;
RESET kitchenlink.ahora;

UPDATE usuario
SET    contrasena_hash = '$2b$12$FXy8y2jQGGbCVu26G1YPw.grUlO2pwdODPRlKy8ww7qvPT7X/l096'   -- Kitchen2026
WHERE  contrasena_hash LIKE 'bcrypt:%' AND estado IN ('activo', 'dado_de_baja');

UPDATE usuario
SET    contrasena_hash = '$2b$12$B/O2aUq1vrldZo8R/5CjUeAZSHGL6n62TAPf9Umrulh6kedGU0FKq'   -- Temporal2026
WHERE  contrasena_hash LIKE 'bcrypt:%' AND estado = 'pendiente';

SELECT  nombre_usuario AS usuario, rol, estado_etiqueta AS estado,
        CASE WHEN estado = 'pendiente' THEN 'Temporal2026 (pide crear una nueva)'
             WHEN estado = 'dado_de_baja' THEN 'Kitchen2026 (no lo deja entrar)'
             ELSE 'Kitchen2026' END AS contrasena_demo
FROM    v_usuarios;
