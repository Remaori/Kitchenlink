-- =====================================================================
--  KitchenLink · Prueba de coherencia v3  (PANTALLAS <> BASE DE DATOS)
--  Para pgAdmin: abre el Query Tool sobre la base "kitchenlink" y
--  ejecuta este archivo COMPLETO (F5). No usa comandos de psql.
-- =====================================================================
--  QUÉ HACE
--    Parte A · Reproduce el día que dibujan las pantallas, en orden de
--              hora, usando solo las reglas de la base (nada de escribir
--              estados a mano). Al llegar a las 19:09 —la hora de las
--              pantallas— compara lo que dice la base contra lo que se
--              ve en las pantallas 02a a 10 (PDF de diseño de interfaces).
--              Al final lista lo que hay que ajustar en Figma.
--    Parte B · Sigue la operación: enviar, pedir la cuenta, pre-ticket,
--              cobro en varios pagos, cancelaciones, reservaciones
--              vencidas, la mesa de otro mesero (transferir), usuarios y
--              corte Z. Incluye intentos que la base DEBE rechazar.
--              Al terminar, todo lo de la Parte B se deshace.
--    Parte C · Inventario del esquema (lo que verás en el ERD).
--
--  RESULTADOS POSIBLES
--    PASA              la base coincide con la pantalla.
--    AJUSTAR PANTALLA  la base sigue la regla acordada y la pantalla dice
--                      otra cosa (o dos pantallas se contradicen). Se
--                      corrige en Figma; la columna "Pantalla" dice cuál.
--    FALLA             error de la base. No debería aparecer ninguno.
--
--  AL TERMINAR
--    · La base queda con los datos de las pantallas (martes 22 de
--      septiembre, 19:09). Puedes consultar las vistas, por ejemplo:
--          SELECT * FROM v_mapa_mesas;
--          SELECT * FROM v_panel_produccion;
--    · En ESTA pestaña el reloj queda fijo a las 19:09 para que las
--      vistas se vean como las pantallas. En una pestaña nueva el reloj
--      vuelve a ser el real.
--    · Se puede ejecutar las veces que quieras: al inicio vacía los datos
--      (no toca roles, permisos ni configuración).
-- =====================================================================

SET search_path TO kitchenlink, public;
SET TIME ZONE 'America/Mexico_City';
SET kitchenlink.usuario_id = '';

TRUNCATE usuario, sesion, mesa, categoria, producto, reservacion, lista_espera,
         comanda, envio, detalle_comanda, corte_caja, pago, cancelacion, bitacora
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------
-- Ayudantes (funciones temporales: desaparecen al cerrar la pestaña)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS resultado_prueba;
CREATE TEMP TABLE resultado_prueba (orden int, pantalla text, verificacion text, esperado text, obtenido text, estado text);

-- Mueve el reloj del sistema a una hora del martes 22 de septiembre
CREATE OR REPLACE FUNCTION pg_temp.reloj(p_hora text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('kitchenlink.ahora', CASE WHEN length(p_hora) > 5 THEN p_hora ELSE '2026-09-22 ' || p_hora END || ':00-06', false); END $$;
-- Quién opera (para la bitácora)
CREATE OR REPLACE FUNCTION pg_temp.actor(p_usuario text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('kitchenlink.usuario_id', (SELECT id FROM kitchenlink.usuario WHERE nombre_usuario = p_usuario)::text, false); END $$;

CREATE OR REPLACE FUNCTION pg_temp.u(text) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT id FROM kitchenlink.usuario  WHERE nombre_usuario = $1 $$;
CREATE OR REPLACE FUNCTION pg_temp.m(text) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT id FROM kitchenlink.mesa     WHERE numero = $1 $$;
CREATE OR REPLACE FUNCTION pg_temp.p(text) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT id FROM kitchenlink.producto WHERE nombre = $1 $$;
CREATE OR REPLACE FUNCTION pg_temp.c(text) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT id FROM kitchenlink.comanda  WHERE folio = $1 $$;
CREATE OR REPLACE FUNCTION pg_temp.linea(p_folio text, p_producto text) RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT id FROM kitchenlink.detalle_comanda WHERE comanda_id = pg_temp.c(p_folio) AND nombre_producto = p_producto ORDER BY id DESC LIMIT 1 $$;

-- 05b · Tocar un producto del catálogo (queda "Sin enviar"). La nota lleva
--       término, guarnición y peticiones especiales.
CREATE OR REPLACE FUNCTION pg_temp.agregar(p_folio text, p_producto text, p_cantidad int, p_tiempo int,
                                           p_nota text DEFAULT NULL) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
    INSERT INTO kitchenlink.detalle_comanda (comanda_id, producto_id, cantidad, tiempo, nota)
    VALUES (pg_temp.c(p_folio), pg_temp.p(p_producto), p_cantidad, p_tiempo, p_nota) RETURNING id INTO v;
    RETURN v;
END $$;
-- 05b · Botón "Enviar"
CREATE OR REPLACE FUNCTION pg_temp.enviar(p_folio text, p_usuario text) RETURNS bigint LANGUAGE sql AS $$
    SELECT kitchenlink.fn_enviar_comanda(pg_temp.c(p_folio), pg_temp.u(p_usuario)) $$;
-- 06 · Botones de la tarjeta (envío + destino)
CREATE OR REPLACE FUNCTION pg_temp.avanzar(p_folio text, p_envio int, p_destino text, p_estado text, p_usuario text DEFAULT 'dbenitez') RETURNS integer LANGUAGE sql AS $$
    SELECT kitchenlink.fn_avanzar_envio((SELECT id FROM kitchenlink.envio WHERE comanda_id = pg_temp.c(p_folio) AND numero = p_envio),
                                        p_destino::kitchenlink.destino_produccion, p_estado::kitchenlink.estado_linea, pg_temp.u(p_usuario)) $$;

-- Registra una verificación
CREATE OR REPLACE FUNCTION pg_temp.r(p_orden int, p_pantalla text, p_verif text, p_esperado text, p_obtenido text,
                                     p_ajuste boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO resultado_prueba VALUES (p_orden, p_pantalla, p_verif, p_esperado, COALESCE(p_obtenido, '(vacío)'),
        CASE WHEN p_obtenido = p_esperado OR (p_esperado = 'rechazado' AND p_obtenido LIKE 'rechazado:%') THEN 'PASA'
             WHEN p_ajuste THEN 'AJUSTAR PANTALLA'
             ELSE 'FALLA' END);
END $$;
-- Ejecuta algo que la base DEBE rechazar; nunca deja cambios
CREATE OR REPLACE FUNCTION pg_temp.rechaza(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        RAISE EXCEPTION USING ERRCODE = 'KLOK1';
    EXCEPTION
        WHEN SQLSTATE 'KLOK1' THEN RETURN 'ACEPTADO (la base debía rechazarlo)';
        WHEN OTHERS THEN RETURN 'rechazado: ' || SQLERRM;
    END;
END $$;


-- =====================================================================
--  PARTE A · El día de las pantallas, hasta las 19:09
-- =====================================================================

-- 15 de agosto · El gerente da de alta al personal de 02a: todos nacen Pendientes.
-- (Luis Mora y Ana Ruiz no están en 02a, pero 05a, 06, 07 y 08 los usan como meseros.)
SELECT pg_temp.reloj('2026-08-15 10:00');
INSERT INTO usuario (rol_id, nombre_completo, nombre_usuario, telefono, contrasena_hash)
SELECT r.id, v.nombre, v.usuario, v.tel, 'bcrypt:temporal'
FROM (VALUES (1,'Gerente','Luis Sáenz Jiménez','lsaenz','55 1000 0001'),
             (2,'Hostess','Ana López','alopez','55 1000 0002'),
             (3,'Mesero','Carlos Ruiz','cruiz','55 1000 0003'),
             (4,'Jefe de cocina','Diego Benítez','dbenitez','55 1000 0004'),
             (5,'Cajera','Marta Díaz','mdiaz','55 1000 0005'),
             (6,'Encargado de barra','Jorge Vega','jvega','55 1000 0006'),
             (7,'Mesero','Luis Mora','lmora','55 1000 0007'),
             (8,'Mesero','Ana Ruiz','aruiz','55 1000 0008')) v(n, rol, nombre, usuario, tel)
JOIN rol r ON r.nombre = v.rol
ORDER BY v.n;
-- Primer inicio de sesión: cada quien crea su contraseña > pasa a Activo
UPDATE usuario SET contrasena_hash = 'bcrypt:propia', requiere_cambio_pw = FALSE;
-- 1 de septiembre · Último turno de Jorge Vega y se da de baja ("hace 3 semanas" en 02a)
SELECT pg_temp.reloj('2026-09-01 17:00');
INSERT INTO sesion (usuario_id, token_hash, dispositivo, expira_en) VALUES (pg_temp.u('jvega'), 'tkn-jvega', 'Tablet barra', '2026-09-02 02:00-06');
SELECT pg_temp.reloj('2026-09-01 18:00');
SELECT pg_temp.actor('lsaenz');
UPDATE usuario SET estado = 'dado_de_baja' WHERE nombre_usuario = 'jvega';
-- 22 de septiembre, 12:00 · Alta de Sofía Méndez Ortega (02b): queda Pendiente. Se abre caja (07: "desde las 12:00")
SELECT pg_temp.reloj('12:00');
INSERT INTO usuario (rol_id, nombre_completo, nombre_usuario, telefono, contrasena_hash)
VALUES ((SELECT id FROM rol WHERE nombre = 'Mesero'), 'Sofía Méndez Ortega', 'smendez', '55 1234 5678', 'bcrypt:temporal');
INSERT INTO corte_caja (folio, cajero_usuario_id, turno, monto_apertura) VALUES ('Z-0031', pg_temp.u('mdiaz'), 'Vespertino', 1500.00);

-- 16:00 · Mesas y menú
SELECT pg_temp.reloj('16:00');
INSERT INTO mesa (numero, capacidad, zona) VALUES
    ('01',2,'Salón'),('02',4,'Salón'),('03',6,'Salón'),('04',4,'Salón'),('05',2,'Ventana'),('06',4,'Salón'),
    ('07',8,'Terraza'),('08',6,'Salón'),('09',4,'Salón'),('10',2,'Ventana'),('11',4,'Salón'),('12',4,'Salón'),
    ('13',4,'Terraza'),('14',2,'Ventana'),('15',8,'Terraza'),('16',4,'Terraza'),('17',6,'Salón'),('21',6,'Privado');
SELECT pg_temp.actor('alopez');                                        -- 04: "Bloqueada por Hostess"
UPDATE mesa SET estado = 'bloqueada', motivo_bloqueo = 'En limpieza' WHERE numero = '16';
SELECT pg_temp.actor('lsaenz');

-- 09 · La categoría decide dónde se prepara: Bebidas y Bar en barra; lo demás en cocina
INSERT INTO categoria (nombre, destino, orden) VALUES
    ('Entradas','cocina',1),('Platos fuertes','cocina',2),('Bebidas','barra',3),('Postres','cocina',4),('Bar','barra',5);
INSERT INTO producto (categoria_id, nombre, descripcion, precio)
SELECT c.id, v.nombre, v.descr, v.precio
FROM (SELECT x.*, row_number() OVER () AS n FROM (VALUES ('Entradas','Sopa de tortilla',NULL,95),
             ('Entradas','Guacamole','Con totopos',110),
             ('Platos fuertes','Arrachera 350 g','Corte de res a la parrilla',320),
             ('Platos fuertes','Salmón a la parrilla','Con verduras al vapor',290),
             ('Platos fuertes','Pasta Alfredo','Salsa cremosa de la casa',210),
             ('Platos fuertes','Tacos de camarón','Orden de 4 piezas',185),
             ('Platos fuertes','Costillas BBQ','Media hora de preparación',340),
             ('Platos fuertes','Risotto de hongos','Opción vegetariana',225),
             ('Platos fuertes','Hamburguesa KL','Con papas a la francesa',180),
             ('Platos fuertes','Pollo al chipotle',NULL,170),
             ('Bebidas','Limonada natural',NULL,45),
             ('Bebidas','Café de olla','Con piloncillo y canela',45),
             ('Postres','Flan napolitano','Casero',95),
             ('Postres','Pastel de chocolate','Rebanada',120),
             ('Postres','Helado de vainilla','Dos bolas',85),
             ('Postres','Churros con cajeta','Orden de 4',90),
             ('Postres','Pay de limón',NULL,95),
             ('Postres','Arroz con leche','Con canela',65),
             ('Bar','Margarita',NULL,120)) x(cat, nombre, descr, precio)) v
JOIN categoria c ON c.nombre = v.cat
ORDER BY v.n;                                         -- el orden de alta es el orden en pantalla
UPDATE producto SET disponible = FALSE, motivo_no_disponible = 'Se terminó el limón amarillo' WHERE nombre = 'Pay de limón';
UPDATE producto SET disponible = FALSE, motivo_no_disponible = 'No llegaron los hongos'        WHERE nombre = 'Risotto de hongos';

-- 16:05 · La hostess registra las reservaciones del día (por teléfono)
SELECT pg_temp.reloj('16:05');
INSERT INTO reservacion (nombre_cliente, telefono, numero_personas, fecha_hora, mesa_id, solicitudes_especiales, registrada_por_usuario_id)
SELECT v.nombre, v.tel, v.personas, ('2026-09-22 ' || v.hora || ':00-06')::timestamptz, pg_temp.m(v.mesa), v.nota, pg_temp.u('alopez')
FROM (VALUES ('Paola Ruiz','55 1111 2222',2,'17:45','10',NULL),
             ('Familia Torres','55 1234 5678',5,'18:30','21',NULL),
             ('Roberto Díaz','55 3333 4444',2,'19:00','04',NULL),
             ('Ana Martínez','55 5555 6666',6,'19:30','03','cumpleaños'),
             ('Grupo Oficina Lomas','55 7777 8888',8,'20:00','15',NULL),
             ('Luis Herrera','55 8765 4321',4,'20:30','07',NULL)) v(nombre, tel, personas, hora, mesa, nota);
UPDATE reservacion SET estado = 'confirmada' WHERE nombre_cliente <> 'Luis Herrera';

-- 17:00 · Llega el turno: inician sesión
SELECT pg_temp.reloj('17:00');
INSERT INTO sesion (usuario_id, token_hash, dispositivo, expira_en)
SELECT id, 'tkn-' || nombre_usuario, 'Tablet', '2026-09-23 02:00-06' FROM usuario WHERE estado = 'activo';

-- 17:20 · Proceso de cada minuto: aparta la Mesa 10 para Paola (17:45)
SELECT pg_temp.reloj('17:20'); SELECT fn_revisar_reservaciones();

-- 17:30 · Mesa 06: un grupo sin reservación (servicio completo de principio a fin)
SELECT pg_temp.reloj('17:30'); INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-1038', pg_temp.m('06'), pg_temp.u('aruiz'), 3);
SELECT pg_temp.reloj('17:32'); SELECT pg_temp.agregar('C-1038','Hamburguesa KL',1,2,'término medio'); SELECT pg_temp.agregar('C-1038','Limonada natural',2,1);
SELECT pg_temp.reloj('17:33'); SELECT pg_temp.enviar('C-1038','aruiz');
SELECT pg_temp.reloj('17:35'); SELECT pg_temp.avanzar('C-1038',1,'barra','en_preparacion');
SELECT pg_temp.reloj('17:36'); SELECT pg_temp.avanzar('C-1038',1,'cocina','en_preparacion');
SELECT pg_temp.reloj('17:38'); SELECT pg_temp.avanzar('C-1038',1,'barra','listo');
SELECT pg_temp.reloj('17:40'); SELECT pg_temp.avanzar('C-1038',1,'barra','entregado');
SELECT pg_temp.reloj('17:50'); SELECT pg_temp.avanzar('C-1038',1,'cocina','listo');
SELECT pg_temp.reloj('17:52'); SELECT pg_temp.avanzar('C-1038',1,'cocina','entregado');

-- 18:01 · Paola no llegó (tolerancia 18:00): No se presentó y la Mesa 10 se libera.
--         La Mesa 21 queda apartada para la Familia Torres (18:30).
SELECT pg_temp.reloj('18:01'); SELECT fn_revisar_reservaciones();

-- 18:10 · Mesa 15 (Luis Mora)
SELECT pg_temp.reloj('18:10'); INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-1039', pg_temp.m('15'), pg_temp.u('lmora'), 6);
SELECT pg_temp.reloj('18:12'); SELECT pg_temp.agregar('C-1039','Guacamole',2,1);
SELECT pg_temp.reloj('18:15'); SELECT pg_temp.enviar('C-1039','lmora');
SELECT pg_temp.reloj('18:16'); SELECT pg_temp.avanzar('C-1039',1,'cocina','en_preparacion');

-- 18:20 · Mesa 09 (Luis Mora)
SELECT pg_temp.reloj('18:20'); INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-1040', pg_temp.m('09'), pg_temp.u('lmora'), 2);

-- 18:24 · Mesa 02 (Carlos Ruiz)
SELECT pg_temp.reloj('18:24'); INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-1041', pg_temp.m('02'), pg_temp.u('cruiz'), 4);
SELECT pg_temp.reloj('18:26'); SELECT pg_temp.agregar('C-1041','Sopa de tortilla',1,1); SELECT pg_temp.agregar('C-1041','Limonada natural',1,1);
SELECT pg_temp.reloj('18:27'); SELECT pg_temp.enviar('C-1041','cruiz');
SELECT pg_temp.reloj('18:28'); SELECT pg_temp.avanzar('C-1041',1,'barra','en_preparacion');
SELECT pg_temp.reloj('18:29'); SELECT pg_temp.avanzar('C-1041',1,'cocina','en_preparacion');
SELECT pg_temp.reloj('18:30'); SELECT pg_temp.avanzar('C-1041',1,'barra','listo'); SELECT pg_temp.avanzar('C-1039',1,'cocina','listo');
-- 18:30 · Mesa 06 pide la cuenta. Proceso de cada minuto: aparta la Mesa 04 para Roberto (19:00)
UPDATE comanda SET estado = 'por_cobrar' WHERE folio = 'C-1038';
SELECT fn_revisar_reservaciones();
SELECT pg_temp.reloj('18:31'); SELECT pg_temp.avanzar('C-1041',1,'barra','entregado');
-- 18:32 · La cajera imprime el pre-ticket de la Mesa 06 (se genera con v_ticket: no se guarda)
-- 18:34 · Llega la Familia Torres: la hostess la sienta en la Mesa 21
SELECT pg_temp.reloj('18:34'); UPDATE reservacion SET estado = 'sentada' WHERE nombre_cliente = 'Familia Torres';
SELECT pg_temp.reloj('18:35'); SELECT pg_temp.avanzar('C-1039',1,'cocina','entregado');
SELECT pg_temp.agregar('C-1041','Arrachera 350 g',1,2,'término medio, papas a la francesa'); SELECT pg_temp.agregar('C-1041','Pollo al chipotle',1,2);
SELECT pg_temp.reloj('18:36'); SELECT pg_temp.enviar('C-1041','cruiz');
SELECT pg_temp.reloj('18:37'); SELECT pg_temp.avanzar('C-1041',2,'cocina','en_preparacion');
SELECT pg_temp.reloj('18:38'); SELECT pg_temp.avanzar('C-1041',1,'cocina','listo');
-- 18:40 · Caja cobra la Mesa 06 en efectivo: el pago cubre el total, la comanda
--         se cierra sola y la Mesa 06 queda libre
SELECT pg_temp.reloj('18:40');
INSERT INTO pago (comanda_id, metodo, monto, monto_recibido, registrado_por_usuario_id) VALUES (pg_temp.c('C-1038'), 'efectivo', 313.20, 500.00, pg_temp.u('mdiaz'));
SELECT pg_temp.avanzar('C-1041',1,'cocina','entregado');

-- 18:45 · Mesa 08 (Carlos Ruiz) · la comanda de la pantalla 05b
SELECT pg_temp.reloj('18:45');
INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas, nota_general)
VALUES ('C-1042', pg_temp.m('08'), pg_temp.u('cruiz'), 6, 'Un comensal es alérgico al cacahuate');
SELECT pg_temp.reloj('18:50');
SELECT pg_temp.agregar('C-1042','Limonada natural',3,1,'sin azúcar');
SELECT pg_temp.agregar('C-1042','Pasta Alfredo',1,1,'sin champiñones');
SELECT pg_temp.agregar('C-1042','Arrachera 350 g',2,2,'término medio, papas a la francesa, sin cebolla');
-- 18:50 · Mesa 21: Ana Ruiz abre la comanda de la Familia Torres (se vincula sola, 5 personas)
INSERT INTO comanda (folio, mesa_id, mesero_usuario_id) VALUES ('C-1043', pg_temp.m('21'), pg_temp.u('aruiz'));
SELECT pg_temp.reloj('18:51'); SELECT pg_temp.agregar('C-1043','Limonada natural',5,1); SELECT pg_temp.enviar('C-1043','aruiz');
SELECT pg_temp.reloj('18:52'); SELECT pg_temp.enviar('C-1042','cruiz');                                   -- Envío 1 · 18:52
SELECT pg_temp.avanzar('C-1041',2,'cocina','listo');
SELECT pg_temp.reloj('18:53'); SELECT pg_temp.avanzar('C-1042',1,'barra','en_preparacion'); SELECT pg_temp.avanzar('C-1043',1,'barra','en_preparacion');
SELECT pg_temp.reloj('18:54'); SELECT pg_temp.avanzar('C-1042',1,'cocina','en_preparacion');
INSERT INTO lista_espera (nombre_cliente, telefono, numero_personas, espera_estimada_min, registrada_por_usuario_id)
VALUES ('Rosa Jiménez', '55 1122 3344', 3, 20, pg_temp.u('alopez'));
SELECT pg_temp.reloj('18:55'); SELECT pg_temp.agregar('C-1043','Hamburguesa KL',2,2,'término medio'); SELECT pg_temp.enviar('C-1043','aruiz');
SELECT pg_temp.avanzar('C-1041',2,'cocina','entregado');
SELECT pg_temp.reloj('18:56'); SELECT pg_temp.avanzar('C-1042',1,'barra','listo'); SELECT pg_temp.avanzar('C-1043',1,'barra','listo');
SELECT pg_temp.reloj('18:57'); SELECT pg_temp.avanzar('C-1043',2,'cocina','en_preparacion'); SELECT pg_temp.agregar('C-1040','Salmón a la parrilla',1,2,'verduras al vapor');
SELECT pg_temp.reloj('18:58'); SELECT pg_temp.avanzar('C-1042',1,'barra','entregado'); SELECT pg_temp.avanzar('C-1043',1,'barra','entregado');
SELECT pg_temp.enviar('C-1040','lmora');
SELECT pg_temp.reloj('18:59');
INSERT INTO lista_espera (nombre_cliente, telefono, numero_personas, espera_estimada_min, registrada_por_usuario_id)
VALUES ('Pedro Salas', NULL, 2, 18, pg_temp.u('alopez'));
-- 19:00 · Proceso de cada minuto: aparta la Mesa 03 para Ana Martínez (19:30)
SELECT pg_temp.reloj('19:00'); SELECT fn_revisar_reservaciones();
SELECT pg_temp.agregar('C-1039','Costillas BBQ',1,2,'término tres cuartos'); SELECT pg_temp.enviar('C-1039','lmora');     -- Envío 2 (adicional)
SELECT pg_temp.avanzar('C-1040',1,'cocina','en_preparacion');
SELECT pg_temp.reloj('19:01'); INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-1044', pg_temp.m('12'), pg_temp.u('cruiz'), 4);
SELECT pg_temp.reloj('19:02'); SELECT pg_temp.avanzar('C-1039',2,'cocina','en_preparacion');
UPDATE detalle_comanda SET estado = 'listo' WHERE id = pg_temp.linea('C-1042','Pasta Alfredo');           -- cocina saca la pasta (1er tiempo)
INSERT INTO lista_espera (nombre_cliente, telefono, numero_personas, espera_estimada_min, registrada_por_usuario_id)
VALUES ('Mariana Soto', '55 4444 1212', 2, 10, pg_temp.u('alopez'));
SELECT pg_temp.reloj('19:03'); UPDATE detalle_comanda SET estado = 'entregado' WHERE id = pg_temp.linea('C-1042','Pasta Alfredo');
INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-1045', pg_temp.m('17'), pg_temp.u('aruiz'), 4);
SELECT pg_temp.reloj('19:04'); SELECT pg_temp.agregar('C-1042','Tacos de camarón',1,2);
SELECT pg_temp.reloj('19:05'); SELECT pg_temp.enviar('C-1042','cruiz');                                   -- Envío 2 · 19:05 · adicional
INSERT INTO lista_espera (nombre_cliente, telefono, numero_personas, espera_estimada_min, nota, registrada_por_usuario_id)
VALUES ('Familia Ortega', '55 9988 7766', 5, 24, 'Necesita mesa de 6', pg_temp.u('alopez'));
SELECT pg_temp.reloj('19:06'); SELECT pg_temp.avanzar('C-1043',2,'cocina','listo');
SELECT pg_temp.agregar('C-1041','Pastel de chocolate',1,3); SELECT pg_temp.agregar('C-1041','Flan napolitano',1,3,'sin caramelo');
SELECT pg_temp.reloj('19:07'); SELECT pg_temp.enviar('C-1041','cruiz');                                   -- Envío 3 (adicional)
SELECT pg_temp.agregar('C-1042','Flan napolitano',1,3,'sin caramelo'); SELECT pg_temp.agregar('C-1042','Café de olla',2,3);
UPDATE lista_espera SET estado = 'sentada', mesa_id = pg_temp.m('05') WHERE nombre_cliente = 'Mariana Soto';
-- 19:08 · Mesa 02 pide la cuenta; la cajera imprime su pre-ticket (se genera, no se guarda)
SELECT pg_temp.reloj('19:08'); UPDATE comanda SET estado = 'por_cobrar' WHERE folio = 'C-1041';
SELECT pg_temp.agregar('C-1044','Sopa de tortilla',2,1); SELECT pg_temp.agregar('C-1044','Pollo al chipotle',1,2); SELECT pg_temp.enviar('C-1044','cruiz');
SELECT pg_temp.avanzar('C-1040',1,'cocina','listo');

-- 19:09 · LA HORA DE LAS PANTALLAS
SELECT pg_temp.reloj('19:09');
SELECT pg_temp.actor('');


-- ---------------------------------------------------------------------
--  Verificaciones de la Parte A (lo que dice la base a las 19:09)
-- ---------------------------------------------------------------------
-- 01, 01b, 02a, 02b · Usuarios
SELECT pg_temp.r(1, '02a', 'Lista de usuarios en el orden de la pantalla, con su estado', 'Luis Sáenz Jiménez: Activo · Ana López: Activo · Carlos Ruiz: Activo · Diego Benítez: Activo · Marta Díaz: Activo · Luis Mora: Activo · Ana Ruiz: Activo · Jorge Vega: Dado de baja · Sofía Méndez Ortega: Pendiente',
    (SELECT string_agg(nombre_completo || ': ' || estado_etiqueta, ' · ' ORDER BY CASE estado WHEN 'activo' THEN 1 WHEN 'dado_de_baja' THEN 2 ELSE 3 END, id) FROM v_usuarios));
SELECT pg_temp.r(2, '02a', 'El usuario Pendiente aparece al final y su último acceso es "Nunca"', 'Sofía Méndez Ortega · Pendiente · Nunca',
    (SELECT nombre_completo || ' · ' || estado_etiqueta || ' · ' || COALESCE(to_char(ultimo_acceso, 'HH24:MI'), 'Nunca') FROM v_usuarios OFFSET 8 LIMIT 1));
SELECT pg_temp.r(3, '02a', 'Columna "Último acceso": "En línea" sale de las sesiones abiertas, no del estado', '7 en línea · Jorge Vega: Hace 3 semanas · Sofía Méndez Ortega: Nunca',
    (SELECT COUNT(*) FILTER (WHERE en_linea) || ' en línea · '
            || (SELECT 'Jorge Vega: Hace ' || floor(EXTRACT(EPOCH FROM fn_ahora() - ultimo_acceso) / 604800)::int || ' semanas' FROM v_usuarios WHERE nombre_usuario = 'jvega')
            || ' · Sofía Méndez Ortega: ' || (SELECT COALESCE(to_char(ultimo_acceso, 'HH24:MI'), 'Nunca') FROM v_usuarios WHERE nombre_usuario = 'smendez')
     FROM v_usuarios));
SELECT pg_temp.r(4, '02b', 'Alta de usuario: rol, contraseña temporal y cambio obligatorio', 'smendez · Mesero · contraseña temporal · cambiarla al entrar: sí',
    (SELECT u.nombre_usuario || ' · ' || r.nombre || ' · contraseña temporal · cambiarla al entrar: ' || CASE WHEN u.requiere_cambio_pw THEN 'sí' ELSE 'no' END
     FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.nombre_usuario = 'smendez'));
-- 02c · Roles y permisos
SELECT pg_temp.r(5, '02c', 'Usuarios por rol (lista de roles)', 'Gerente: 1 usuario · Hostess: 1 usuario · Mesero: 4 usuarios · Jefe de cocina: 1 usuario · Encargado de barra: 1 usuario (dado de baja) · Cajera: 1 usuario',
    (SELECT string_agg(nombre || ': ' || usuarios_texto, ' · ' ORDER BY id) FROM v_roles));
SELECT pg_temp.r(6, '02c', 'Rol Mesero: casillas marcadas en Servicio y Salón', 'Abrir y modificar comandas · Pedir la cuenta · Ver el estado de las mesas',
    (SELECT string_agg(permiso, ' · ' ORDER BY orden) FROM v_permisos_rol WHERE rol = 'Mesero' AND marcado));
SELECT pg_temp.r(7, '02c', '"Dar de baja rol": Mesero no (tiene usuarios); Encargado de barra sí (solo uno dado de baja)', 'Mesero: no · Encargado de barra: sí',
    (SELECT string_agg(nombre || ': ' || CASE WHEN se_puede_dar_de_baja THEN 'sí' ELSE 'no' END, ' · ' ORDER BY id) FROM v_roles WHERE nombre IN ('Mesero','Encargado de barra')));
SELECT pg_temp.r(8, '02c', 'Gerente: rol del sistema con todos los permisos', 'Sistema · 17 de 17 permisos activos',
    (SELECT CASE WHEN es_sistema THEN 'Sistema · ' ELSE '' END || permisos_texto FROM v_roles WHERE nombre = 'Gerente'));
SELECT pg_temp.r(9, '07', 'El botón "Generar pre-ticket" está en la pantalla de la Cajera (casos de uso)', 'Cajera: sí · Mesero: no',
    (SELECT 'Cajera: ' || CASE WHEN fn_tiene_permiso(pg_temp.u('mdiaz'), 'ticket.pre_ticket') THEN 'sí' ELSE 'no' END
         || ' · Mesero: ' || CASE WHEN fn_tiene_permiso(pg_temp.u('cruiz'), 'ticket.pre_ticket') THEN 'sí' ELSE 'no' END));
-- 03a · Reservaciones
SELECT pg_temp.r(10, '03a', 'Pestaña "Reservaciones (6)" · 27 personas', '6 reservaciones · 27 personas',
    (SELECT COUNT(*) || ' reservaciones · ' || SUM(numero_personas) || ' personas' FROM v_reservaciones WHERE fecha_hora::date = '2026-09-22'));
SELECT pg_temp.r(11, '03a', 'Estados de la agenda, por hora', 'No se presentó · Sentada · En tolerancia · Confirmada · Confirmada · Por confirmar',
    (SELECT string_agg(estado_etiqueta, ' · ' ORDER BY fecha_hora) FROM v_reservaciones));
SELECT pg_temp.r(12, '03a', 'Paola Ruiz (17:45): la mesa se liberó sola', 'Mesa liberada a las 18:00',
    (SELECT 'Mesa liberada a las ' || to_char(finalizada_en, 'HH24:MI') FROM v_reservaciones WHERE nombre_cliente = 'Paola Ruiz'));
SELECT pg_temp.r(13, '03a', 'Familia Torres: llegada y fin estimado (2 h)', 'Llegó 18:34 · ocupada hasta 20:30',
    (SELECT 'Llegó ' || to_char(sentada_en, 'HH24:MI') || ' · ocupada hasta ' || to_char(apartado_hasta, 'HH24:MI') FROM v_reservaciones WHERE nombre_cliente = 'Familia Torres'));
SELECT pg_temp.r(14, '03a', 'Roberto Díaz: en tolerancia', 'Faltan 6 min · se libera a las 19:15',
    (SELECT 'Faltan ' || minutos_para_liberar || ' min · se libera a las ' || to_char(tolerancia_hasta, 'HH24:MI') FROM v_reservaciones WHERE nombre_cliente = 'Roberto Díaz'));
SELECT pg_temp.r(15, '03a', 'Apartado 30 min antes: Ana Martínez sí, Grupo Oficina todavía no', 'Mesa apartada desde las 19:00 · La mesa se apartará a las 19:30',
    (SELECT (SELECT 'Mesa apartada desde las ' || to_char(apartado_desde, 'HH24:MI') FROM v_reservaciones WHERE nombre_cliente = 'Ana Martínez' AND mesa_apartada)
         || ' · ' || (SELECT 'La mesa se apartará a las ' || to_char(apartado_desde, 'HH24:MI') FROM v_reservaciones WHERE nombre_cliente = 'Grupo Oficina Lomas' AND NOT mesa_apartada)));
-- 03b · Lista de espera
SELECT pg_temp.r(16, '03b', 'Pestaña "Lista de espera (3)"', '3', (SELECT COUNT(*)::text FROM v_lista_espera));
SELECT pg_temp.r(17, '03b', 'Posición, tiempo esperando y estimado', '1 Rosa Jiménez 15 min ~5 · 2 Pedro Salas 10 min ~8 · 3 Familia Ortega 4 min ~20',
    (SELECT string_agg(posicion || ' ' || nombre_cliente || ' ' || minutos_esperando || ' min ~' || minutos_estimados, ' · ' ORDER BY posicion) FROM v_lista_espera));
SELECT pg_temp.r(18, '03b', 'Teléfono opcional', '2 personas · sin teléfono',
    (SELECT numero_personas || ' personas · ' || telefono FROM v_lista_espera WHERE nombre_cliente = 'Pedro Salas'));
-- 04 · Mesas
SELECT pg_temp.r(19, '04', 'Contadores de 04 (Ocupadas = Por atender + Comanda abierta + Pidió la cuenta)', 'Total 18 · Disponibles 7 · Ocupadas 8 · Reservadas 2 · Bloqueadas 1',
    (SELECT 'Total ' || COUNT(*) || ' · Disponibles ' || COUNT(*) FILTER (WHERE estado = 'libre')
         || ' · Ocupadas ' || COUNT(*) FILTER (WHERE estado IN ('por_atender','comanda_abierta','por_cobrar'))
         || ' · Reservadas ' || COUNT(*) FILTER (WHERE estado = 'reservada') || ' · Bloqueadas ' || COUNT(*) FILTER (WHERE estado = 'bloqueada')
     FROM v_mapa_mesas));
SELECT pg_temp.r(20, '04', 'Mesa bloqueada: motivo y quién la bloqueó', 'Bloqueada · En limpieza · Bloqueada por Hostess',
    (SELECT fn_etiqueta('estado_mesa', m.estado::text) || ' · ' || m.motivo_bloqueo || ' · Bloqueada por ' || r.nombre
     FROM mesa m JOIN usuario u ON u.id = m.bloqueada_por_usuario_id JOIN rol r ON r.id = u.rol_id WHERE m.numero = '16'));
-- 05a · Mis mesas
SELECT pg_temp.r(21, '05a', 'Chips "Todas (18)" y "Libres (7)"', 'Todas (18) · Libres (7)',
    (SELECT 'Todas (' || COUNT(*) || ') · Libres (' || COUNT(*) FILTER (WHERE estado = 'libre') || ')' FROM v_mapa_mesas));
SELECT pg_temp.r(22, '05a', 'Mesa 08', 'Comanda abierta · C-1042 · abierta hace 24 min · $1571.80',
    (SELECT estado_etiqueta || ' · ' || folio || ' · abierta hace ' || minutos_abierta || ' min · $' || total FROM v_mapa_mesas WHERE numero = '08'));
SELECT pg_temp.r(23, '05a', 'Mesa 02 (el mismo monto sale en 04: "Pre-ticket de $980.20")', 'Por cobrar · C-1041 · abierta hace 45 min · Cuenta pedida 19:08 · $980.20',
    (SELECT estado_etiqueta || ' · ' || folio || ' · abierta hace ' || minutos_abierta || ' min · Cuenta pedida ' || to_char(cuenta_pedida_en, 'HH24:MI') || ' · $' || total
     FROM v_mapa_mesas WHERE numero = '02'));
SELECT pg_temp.r(24, '05a', 'Mesa 05 (la sentó la hostess, sin comanda)', 'Por atender · Sentado por la hostess hace 2 min · La hostess registró 2 · Todavía no tiene comanda',
    (SELECT estado_etiqueta || ' · Sentado por la hostess hace ' || minutos_sentados || ' min · La hostess registró ' || personas_por_atender
            || CASE WHEN folio IS NULL THEN ' · Todavía no tiene comanda' ELSE ' · ' || folio END FROM v_mapa_mesas WHERE numero = '05'));
SELECT pg_temp.r(25, '05a', 'Mesa 12', 'Comanda abierta · C-1044 · abierta hace 8 min · $417.60 · Todo enviado a cocina',
    (SELECT estado_etiqueta || ' · ' || folio || ' · abierta hace ' || minutos_abierta || ' min · $' || total
            || CASE WHEN productos_sin_enviar = 0 THEN ' · Todo enviado a cocina' ELSE ' · falta enviar' END FROM v_mapa_mesas WHERE numero = '12'));
SELECT pg_temp.r(26, '05a', 'Mesa 04', 'Reservada 19:00 · Esperando a Roberto Díaz · Se libera a las 19:15 si no llega',
    (SELECT estado_etiqueta || ' ' || to_char(proxima_reservacion_hora, 'HH24:MI') || ' · Esperando a ' || proxima_reservacion
            || ' · Se libera a las ' || to_char(se_libera_si_no_llega, 'HH24:MI') || ' si no llega' FROM v_mapa_mesas WHERE numero = '04'));
SELECT pg_temp.r(27, '05a', 'Mesas 06 y 10', 'Libre desde las 18:40 · Libre desde las 18:00',
    (SELECT string_agg(estado_etiqueta || ' desde las ' || to_char(libre_desde, 'HH24:MI'), ' · ' ORDER BY numero) FROM v_mapa_mesas WHERE numero IN ('06','10')));
SELECT pg_temp.r(28, '05a', 'Mesas 15 y 21: "Atiende:" otro mesero', 'Atiende: Luis Mora · Atiende: Ana Ruiz',
    (SELECT string_agg('Atiende: ' || mesero, ' · ' ORDER BY numero) FROM v_mapa_mesas WHERE numero IN ('15','21')));
-- 05b · Gestionar comanda
SELECT pg_temp.r(29, '05b', 'Encabezado', 'Mesa 08 · Comanda C-1042 · 6 personas · Abierta a las 18:45 · Mesero: Carlos Ruiz',
    (SELECT 'Mesa ' || mesa || ' · Comanda ' || folio || ' · ' || numero_personas || ' personas · ' || estado_etiqueta || ' a las ' || to_char(abierta_en, 'HH24:MI') || ' · Mesero: ' || mesero
     FROM v_comanda_resumen WHERE folio = 'C-1042'));
SELECT pg_temp.r(30, '05b', 'Nota de mesa', 'Un comensal es alérgico al cacahuate', (SELECT nota_general FROM v_comanda_resumen WHERE folio = 'C-1042'));
SELECT pg_temp.r(31, '05b', 'Secciones', 'Envío 1: 3 · Envío 2: 1 · SIN ENVIAR (2)',
    (SELECT string_agg(x, ' · ' ORDER BY o) FROM (
        SELECT COALESCE(envio_numero, 99) AS o,
               CASE WHEN envio_numero IS NULL THEN 'SIN ENVIAR (' || COUNT(*) || ')' ELSE 'Envío ' || envio_numero || ': ' || COUNT(*) END AS x
        FROM v_comanda_detalle WHERE folio = 'C-1042' GROUP BY envio_numero) s));
SELECT pg_temp.r(32, '05b', 'Rótulos de los envíos', 'Envío 1 · 18:52 / Envío 2 · 19:05 · pedido adicional',
    (SELECT string_agg(DISTINCT envio_texto, ' / ') FROM v_comanda_detalle WHERE folio = 'C-1042'));
SELECT pg_temp.r(33, '05b', 'Estado de cada producto', 'Limonada natural: Entregado · Pasta Alfredo: Entregado · Arrachera 350 g: En preparación · Tacos de camarón: Por preparar · Flan napolitano: Sin enviar · Café de olla: Sin enviar',
    (SELECT string_agg(nombre_producto || ': ' || estado_etiqueta, ' · ' ORDER BY id) FROM v_comanda_detalle WHERE folio = 'C-1042'));
SELECT pg_temp.r(34, '05b', 'Texto bajo cada producto (tiempo y nota)', 'Barra · sin azúcar / 1er tiempo · sin champiñones / 2º tiempo · término medio, papas a la francesa, sin cebolla / 2º tiempo / 3er tiempo · sin caramelo / Barra',
    (SELECT string_agg(detalle_texto, ' / ' ORDER BY id) FROM v_comanda_detalle WHERE folio = 'C-1042'));
SELECT pg_temp.r(35, '05b', 'Importe de cada línea', '135.00 · 210.00 · 640.00 · 185.00 · 95.00 · 90.00',
    (SELECT string_agg(importe::text, ' · ' ORDER BY id) FROM v_comanda_detalle WHERE folio = 'C-1042'));
SELECT pg_temp.r(36, '05b', 'Subtotal (enviado + sin enviar) · IVA · Total', '1355.00 · 216.80 · 1571.80',
    (SELECT subtotal || ' · ' || iva || ' · ' || total FROM v_comanda_resumen WHERE folio = 'C-1042'));
-- 06 · Panel de cocina y barra
SELECT pg_temp.r(37, '06', 'Tarjetas de cocina por columna', 'Por preparar: 3 envíos · En preparación: 2 envíos · Listo para entregar: 2 envíos',
    (SELECT string_agg(columna || ': ' || n || ' envíos', ' · ' ORDER BY e) FROM (SELECT columna, estado AS e, COUNT(*) n FROM v_panel_produccion WHERE destino = 'cocina' GROUP BY columna, estado) s));
SELECT pg_temp.r(38, '06', 'Mesa 08 · Envío 1', 'En preparación · 2× Arrachera 350 g · 17 min · Carlos Ruiz · 18:52',
    (SELECT columna || ' · ' || productos || ' · ' || minutos_desde_envio || ' min · ' || mesero || ' · ' || to_char(enviado_en, 'HH24:MI') FROM v_panel_produccion WHERE mesa = '08' AND envio_numero = 1 AND destino = 'cocina'));
SELECT pg_temp.r(39, '06', 'Mesa 08 · Envío 2', 'Por preparar · Adicional · 1× Tacos de camarón · hace 4 min',
    (SELECT columna || CASE WHEN es_adicional THEN ' · Adicional' ELSE '' END || ' · ' || productos || ' · hace ' || minutos_desde_envio || ' min' FROM v_panel_produccion WHERE mesa = '08' AND envio_numero = 2));
SELECT pg_temp.r(40, '06', '"Alergia al cacahuate en la mesa" sale en las tarjetas de la Mesa 08', '2 de 2',
    (SELECT COUNT(*) FILTER (WHERE nota_mesa IS NOT NULL) || ' de ' || COUNT(*) FROM v_panel_produccion WHERE mesa = '08'));
SELECT pg_temp.r(41, '06', 'Mesa 09 · Envío 1', 'Listo para entregar · 1× Salmón a la parrilla · listo hace 1 min · Luis Mora · 18:58',
    (SELECT columna || ' · ' || productos || ' · listo hace ' || minutos_desde_listo || ' min · ' || mesero || ' · ' || to_char(enviado_en, 'HH24:MI') FROM v_panel_produccion WHERE mesa = '09'));
SELECT pg_temp.r(42, '06', 'Mesa 12 · Envío 1 y Mesa 15 · Envío 2', 'Mesa 12: Por preparar · 2× Sopa de tortilla | 1× Pollo al chipotle · hace 1 min / Mesa 15: En preparación · Adicional · 1× Costillas BBQ · 9 min',
    (SELECT string_agg('Mesa ' || mesa || ': ' || columna || CASE WHEN es_adicional THEN ' · Adicional' ELSE '' END || ' · ' || productos || ' · '
                       || CASE WHEN estado = 'por_preparar' THEN 'hace ' ELSE '' END || minutos_desde_envio || ' min', ' / ' ORDER BY mesa)
     FROM v_panel_produccion WHERE mesa IN ('12','15')));
SELECT pg_temp.r(43, '06', 'Barra: sin pendientes (el café de la Mesa 08 no se ha enviado)', '0 tarjetas',
    (SELECT COUNT(*) || ' tarjetas' FROM v_panel_produccion WHERE destino = 'barra'));
-- 07, 08, 10 · Caja y reportes (servicio completo de la Mesa 06)
SELECT pg_temp.r(44, '08', 'Ticket de la Mesa 06 en "Tickets del día" (se genera, no se guarda)', 'C-1038 · Mesa 06 · Ana Ruiz · Efectivo · 18:40 · $313.20 · 1 pago',
    (SELECT folio || ' · Mesa ' || mesa || ' · ' || mesero || ' · ' || metodo || ' · ' || to_char(hora, 'HH24:MI') || ' · $' || total || ' · ' || pagos_texto FROM v_tickets WHERE folio = 'C-1038'));
SELECT pg_temp.r(45, '07', 'Cambio a entregar en efectivo (se calcula, no se guarda)', 'Monto recibido $500.00 · Cambio a entregar $186.80',
    (SELECT 'Monto recibido $' || monto_recibido || ' · Cambio a entregar $' || cambio FROM v_ticket_pagos WHERE folio = 'C-1038'));
SELECT pg_temp.r(46, '08', 'Resumen del día (a las 19:09)', 'Ventas $313.20 · 1 ticket · Efectivo $313.20 (1 operación) · Comensales 3',
    (SELECT 'Ventas $' || ventas || ' · ' || tickets || ' ticket · Efectivo $' || efectivo || ' (' || operaciones_efectivo || ' operación) · Comensales ' || comensales
     FROM v_resumen_dia WHERE dia = '2026-09-22'));
SELECT pg_temp.r(47, '10', 'Tiempo de rotación de la Mesa 06 (umbral en Configuración)', 'Mesa 06 · 70 min · Alto',
    (SELECT 'Mesa ' || mesa || ' · ' || minutos_promedio || ' min · ' || nivel FROM v_rotacion_mesas WHERE mesa = '06'));
SELECT pg_temp.r(48, '09', 'Productos con 86', 'Pay de limón: 86 · Risotto de hongos: 86',
    (SELECT string_agg(nombre || ': 86', ' · ' ORDER BY nombre) FROM producto WHERE NOT disponible));
SELECT pg_temp.r(49, '09', 'Dónde se prepara cada categoría (decide el panel de 06)', 'Entradas: Cocina · Platos fuertes: Cocina · Bebidas: Barra · Postres: Cocina · Bar: Barra',
    (SELECT string_agg(nombre || ': ' || fn_etiqueta('destino_produccion', destino::text), ' · ' ORDER BY orden) FROM categoria));
SELECT pg_temp.r(50, 'Todas', 'Cada valor de la base tiene su texto de pantalla (etiqueta_estado)', '0 sin etiqueta',
    (SELECT COUNT(*) || ' sin etiqueta' FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'kitchenlink'
     WHERE NOT EXISTS (SELECT 1 FROM etiqueta_estado x WHERE x.dominio = t.typname AND x.valor = e.enumlabel)));

-- ---------------------------------------------------------------------
--  Pantallas corregidas con los plugins v2 y v3
-- ---------------------------------------------------------------------
SELECT pg_temp.r(51, '02a', 'Contador de usuarios (incluye a Luis Mora y Ana Ruiz)', '9 usuarios · 7 activos · 1 pendiente · 1 dado de baja',
    (SELECT COUNT(*) || ' usuarios · ' || COUNT(*) FILTER (WHERE estado = 'activo') || ' activos · ' || COUNT(*) FILTER (WHERE estado = 'pendiente') || ' pendiente · '
            || COUNT(*) FILTER (WHERE estado = 'dado_de_baja') || ' dado de baja' FROM usuario));
SELECT pg_temp.r(52, '02c', 'Rol Mesero: "4 usuarios con este rol"', '4 usuarios', (SELECT usuarios_texto FROM v_roles WHERE nombre = 'Mesero'));
SELECT pg_temp.r(53, '02c', 'Contador de permisos (el pre-ticket es permiso de Caja)', '3 de 17 permisos activos', (SELECT permisos_texto FROM v_roles WHERE nombre = 'Mesero'));
SELECT pg_temp.r(54, '02c', 'Casillas de Servicio y de Caja', 'Servicio: Abrir y modificar comandas · Pedir la cuenta · Cancelar productos o comandas / Caja: Registrar pagos · Generar y cancelar pre-tickets · Emitir y reimprimir tickets · Arqueo y cortes de caja',
    (SELECT 'Servicio: ' || string_agg(nombre, ' · ' ORDER BY orden) FILTER (WHERE modulo = 'Servicio') || ' / Caja: ' || string_agg(nombre, ' · ' ORDER BY orden) FILTER (WHERE modulo = 'Caja') FROM permiso));
SELECT pg_temp.r(55, '12', 'Paso 8 del ciclo de la comanda: quién genera el pre-ticket', 'Cajera',
    (SELECT string_agg(r.nombre, ', ') FROM rol r JOIN rol_permiso rp ON rp.rol_id = r.id JOIN permiso p ON p.id = rp.permiso_id
     WHERE p.clave = 'ticket.pre_ticket' AND NOT r.es_sistema));
SELECT pg_temp.r(56, '05a', 'Aviso de cocina de Carlos y tarjeta de la Mesa 08', 'Sin platillos listos por entregar · Arrachera en preparación · 17 min',
    (SELECT CASE WHEN SUM(platillos_listos) = 0 THEN 'Sin platillos listos por entregar' ELSE SUM(platillos_listos) || ' platillos listos' END
     FROM v_mapa_mesas WHERE mesero_usuario_id = pg_temp.u('cruiz'))
    || ' · ' || (SELECT 'Arrachera en preparación · ' || minutos_desde_envio || ' min' FROM v_panel_produccion
                 WHERE mesa = '08' AND estado = 'en_preparacion' AND productos LIKE '%Arrachera%'));
SELECT pg_temp.r(57, '05a', 'Chip "Mis mesas" de Carlos Ruiz (08, 02 y 12)', 'Mis mesas (3)',
    (SELECT 'Mis mesas (' || COUNT(*) || ')' FROM v_mapa_mesas WHERE mesero_usuario_id = pg_temp.u('cruiz')));
SELECT pg_temp.r(58, '06', 'Segunda tarjeta "Listo para entregar"', 'Mesa 21 · Envío 2 · Ana Ruiz · 2× Hamburguesa KL · listo hace 3 min',
    (SELECT 'Mesa ' || mesa || ' · Envío ' || envio_numero || ' · ' || mesero || ' · ' || productos || ' · listo hace ' || minutos_desde_listo || ' min'
     FROM v_panel_produccion WHERE columna = 'Listo para entregar' AND mesa <> '09'));
SELECT pg_temp.r(59, '06', 'Mesero de la tarjeta Mesa 02 · Envío 3', 'Carlos Ruiz · 19:07',
    (SELECT mesero || ' · ' || to_char(enviado_en, 'HH24:MI') FROM v_panel_produccion WHERE mesa = '02' AND envio_numero = 3));
SELECT pg_temp.r(60, '05b', 'Arrachera: término y guarnición van en la nota (ya no hay modificadores)', '2º tiempo · término medio, papas a la francesa, sin cebolla',
    (SELECT detalle_texto FROM v_comanda_detalle WHERE folio = 'C-1042' AND nombre_producto = 'Arrachera 350 g'));
SELECT pg_temp.r(61, '12', 'Nombre del estado de la mesa que pidió la cuenta (04, 05a, 12)', 'Por cobrar', fn_etiqueta('estado_mesa', 'por_cobrar'));
SELECT pg_temp.r(62, '03b', 'Mesa apartada para una reservación (03b, 04, 05a)', 'Reservada', fn_etiqueta('estado_mesa', 'reservada'));
SELECT pg_temp.r(63, '03a', 'Formulario de 03a: qué pasa si no llegan', 'pasa sola a No se presentó',
    'pasa sola a ' || fn_etiqueta('estado_reservacion', 'no_se_presento'));
SELECT pg_temp.r(64, '04', 'Leyenda de estados de 04', 'Libre · Reservada · Por atender · Comanda abierta · Por cobrar · Bloqueada',
    (SELECT string_agg(etiqueta, ' · ' ORDER BY orden) FROM etiqueta_estado WHERE dominio = 'estado_mesa'));
SELECT pg_temp.r(65, '04', 'Estado de las 18 tarjetas de 04', '01 Libre · 02 Por cobrar · 03 Reservada · 04 Reservada · 05 Por atender · 06 Libre · 07 Libre · 08 Comanda abierta · 09 Comanda abierta · 10 Libre · 11 Libre · 12 Comanda abierta · 13 Libre · 14 Libre · 15 Comanda abierta · 16 Bloqueada · 17 Comanda abierta · 21 Comanda abierta',
    (SELECT string_agg(numero || ' ' || estado_etiqueta, ' · ' ORDER BY numero) FROM v_mapa_mesas));
SELECT pg_temp.r(66, '04', 'Tarjetas con comanda abierta: mesero y minutos', 'Mesa 08: Carlos Ruiz · 24 min / Mesa 09: Luis Mora · 49 min / Mesa 12: Carlos Ruiz · 8 min / Mesa 17: Ana Ruiz · 6 min / Mesa 21: Ana Ruiz · 19 min',
    (SELECT string_agg('Mesa ' || numero || ': ' || mesero || ' · ' || minutos_abierta || ' min', ' / ' ORDER BY numero) FROM v_mapa_mesas WHERE estado = 'comanda_abierta' AND numero <> '15'));
SELECT pg_temp.r(67, '04', 'Avisos en tarjetas: Mesa 15 ocupada con reservación a las 20:00 y Mesa 07 por confirmar', 'Mesa 15: Luis Mora · reservación 20:00 / Mesa 07: reservación 20:30 · Por confirmar',
    (SELECT 'Mesa 15: ' || mesero || ' · reservación ' || to_char(proxima_reservacion_hora, 'HH24:MI') FROM v_mapa_mesas WHERE numero = '15')
    || ' / ' || (SELECT 'Mesa 07: reservación ' || to_char(fecha_hora, 'HH24:MI') || ' · ' || estado_etiqueta FROM v_reservaciones WHERE mesa = '07'));
SELECT pg_temp.r(68, '07', 'Pre-ticket de la Mesa 02 en Cobro (se genera con una consulta)', 'Pre-ticket · C-1041 · Mesa 02 · Carlos Ruiz · 6 productos · 845.00 + 135.20 = 980.20 · propina sugerida 84.50 · pidió la cuenta a las 19:08',
    (SELECT tipo || ' · ' || folio || ' · Mesa ' || mesa || ' · ' || mesero || ' · ' || productos || ' productos · '
            || subtotal || ' + ' || iva || ' = ' || total || ' · propina sugerida ' || propina_sugerida || ' · pidió la cuenta a las ' || to_char(cuenta_pedida_en, 'HH24:MI')
     FROM v_ticket WHERE folio = 'C-1041'));
SELECT pg_temp.r(69, '07', 'Lista "Por cobrar" de caja a las 19:09', '1 mesa · Mesa 02',
    (SELECT COUNT(*) || CASE WHEN COUNT(*) = 1 THEN ' mesa' ELSE ' mesas' END || ' · ' || string_agg('Mesa ' || mesa, ', ') FROM v_cuentas_por_cobrar));
SELECT pg_temp.r(70, '07', 'Lista "Abiertas · aún no piden la cuenta" (total con IVA)', 'Mesa 08: $1571.80 · Mesa 09: $336.40 · Mesa 12: $417.60 · Mesa 15: $649.60 · Mesa 17: $0.00 · Mesa 21: $678.60',
    (SELECT string_agg('Mesa ' || mesa || ': $' || total, ' · ' ORDER BY mesa) FROM v_comanda_resumen WHERE estado = 'abierta'));
SELECT pg_temp.r(71, '03b', 'Mesas candidatas para Rosa Jiménez (3 personas)', 'Mesa 06 · 4 lugares · Libre desde las 18:40 / Mesa 07 · 8 lugares · Libre · reservación 20:30 / Mesa 04 · 4 lugares · Reservada · Roberto Díaz 19:00 / Mesa 10 · 2 lugares · Libre',
    (SELECT string_agg('Mesa ' || numero || ' · ' || capacidad || ' lugares · ' || estado_etiqueta
            || CASE numero WHEN '06' THEN ' desde las ' || to_char(libre_desde, 'HH24:MI')
                           WHEN '07' THEN ' · reservación ' || to_char(proxima_reservacion_hora, 'HH24:MI')
                           WHEN '04' THEN ' · ' || proxima_reservacion || ' ' || to_char(proxima_reservacion_hora, 'HH24:MI') ELSE '' END,
            ' / ' ORDER BY CASE numero WHEN '06' THEN 1 WHEN '07' THEN 2 WHEN '04' THEN 3 ELSE 4 END)
     FROM v_mapa_mesas WHERE numero IN ('06','07','04','10')));


SELECT pg_temp.r(72, '05b', 'Pestaña Postres de 05b (el Café de olla pasó a Bebidas y se prepara en barra)', 'Flan napolitano · Pastel de chocolate · Helado de vainilla · Churros con cajeta · Pay de limón · Arroz con leche / Café de olla: Bebidas · Barra',
    (SELECT string_agg(nombre, ' · ' ORDER BY id) FROM v_menu WHERE categoria = 'Postres')
    || ' / ' || (SELECT nombre || ': ' || categoria || ' · ' || se_prepara_en FROM v_menu WHERE nombre = 'Café de olla'));
SELECT pg_temp.r(73, '08', 'Ticket de la Mesa 06 generado de la comanda y su pago', '1× Hamburguesa KL 180.00 · 2× Limonada natural 90.00 · Subtotal 270.00 · IVA 43.20 · Total 313.20 · Efectivo · cambio 186.80',
    (SELECT (SELECT string_agg(cantidad || '× ' || nombre_producto || ' ' || importe, ' · ' ORDER BY linea) FROM v_ticket_lineas WHERE folio = 'C-1038')
            || ' · Subtotal ' || subtotal || ' · IVA ' || iva || ' · Total ' || total || ' · ' || metodo
            || ' · cambio ' || (SELECT cambio FROM v_ticket_pagos WHERE folio = 'C-1038')
     FROM v_ticket WHERE folio = 'C-1038'));


-- =====================================================================
--  PARTE B · La operación sigue después de las 19:09
--  Todo esto se deshace al final: la base regresa a las 19:09.
-- =====================================================================
DO $prueba$
DECLARE
    paso text := 'inicio';
    res  jsonb;
    v_id bigint;
BEGIN
  BEGIN
    -- ---------------- 19:10 · Reservaciones --------------------------
    paso := '19:10 reservaciones';
    PERFORM pg_temp.reloj('19:10');
    INSERT INTO reservacion (nombre_cliente, telefono, numero_personas, fecha_hora, mesa_id, registrada_por_usuario_id)
    VALUES ('Jorge Salinas', '55 2468 1357', 4, '2026-09-22 21:00-06', pg_temp.m('11'), pg_temp.u('alopez'));
    PERFORM pg_temp.r(101, '03a', 'Nueva reservación (formulario): Mesa 11, 21:00', 'Mesa 11 quedará apartada de 20:30 a 23:00 · si no llegan antes de las 21:15 se libera',
        (SELECT 'Mesa ' || m.numero || ' quedará apartada de ' || to_char(r.apartado_desde, 'HH24:MI') || ' a ' || to_char(r.apartado_hasta, 'HH24:MI')
                || ' · si no llegan antes de las ' || to_char(r.tolerancia_hasta, 'HH24:MI') || ' se libera'
         FROM reservacion r JOIN mesa m ON m.id = r.mesa_id WHERE r.nombre_cliente = 'Jorge Salinas'));
    PERFORM pg_temp.r(102, '03a', 'Rechaza otra reservación que se empalma en la Mesa 11 (22:00)', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO reservacion (nombre_cliente, numero_personas, fecha_hora, mesa_id, registrada_por_usuario_id)
        VALUES ('Pareja Núñez', 2, '2026-09-22 22:00-06', pg_temp.m('11'), pg_temp.u('alopez')) $q$));
    PERFORM pg_temp.r(103, '03a', 'Rechaza "reservar" para una hora que ya pasó (eso es lista de espera)', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO reservacion (nombre_cliente, numero_personas, fecha_hora, mesa_id, registrada_por_usuario_id)
        VALUES ('Cliente sin reservación', 2, '2026-09-22 19:05-06', pg_temp.m('13'), pg_temp.u('alopez')) $q$));
    INSERT INTO reservacion (nombre_cliente, numero_personas, fecha_hora, mesa_id, estado, registrada_por_usuario_id)
    VALUES ('Laura Paredes', 2, '2026-09-22 19:35-06', pg_temp.m('13'), 'confirmada', pg_temp.u('alopez'));
    PERFORM pg_temp.r(104, '03a', 'Una reservación confirmada dentro de su ventana aparta la mesa en ese momento', 'Mesa 13: Reservada',
        (SELECT 'Mesa 13: ' || estado_etiqueta FROM v_mapa_mesas WHERE numero = '13'));
    UPDATE reservacion SET mesa_id = pg_temp.m('01') WHERE nombre_cliente = 'Laura Paredes';
    PERFORM pg_temp.r(105, '03a', 'Cambiar la reservación de mesa libera la anterior y aparta la nueva', 'Mesa 01: Reservada · Mesa 13: Libre desde 19:10',
        (SELECT string_agg('Mesa ' || numero || ': ' || estado_etiqueta || COALESCE(' desde ' || to_char(libre_desde, 'HH24:MI'), ''), ' · ' ORDER BY numero)
         FROM v_mapa_mesas WHERE numero IN ('01','13')));
    INSERT INTO reservacion (nombre_cliente, numero_personas, fecha_hora, mesa_id, estado, registrada_por_usuario_id)
    VALUES ('Paty Luna', 2, '2026-09-22 21:30-06', pg_temp.m('04'), 'confirmada', pg_temp.u('alopez'));
    PERFORM pg_temp.r(106, '03a', 'Rechaza sentar a otra reservación en la mesa apartada para Roberto', 'rechazado',
        pg_temp.rechaza($q$ UPDATE reservacion SET estado = 'sentada' WHERE nombre_cliente = 'Paty Luna' $q$));

    -- ---------------- 19:12 · Mesa 08 envía lo pendiente --------------
    paso := '19:12 enviar';
    PERFORM pg_temp.reloj('19:12');
    PERFORM pg_temp.r(107, '05b', 'Rechaza pedir la cuenta con productos Sin enviar', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET estado = 'por_cobrar' WHERE folio = 'C-1042' $q$));
    PERFORM pg_temp.enviar('C-1042', 'cruiz');
    PERFORM pg_temp.r(108, '05b', 'Enviar crea el Envío 3 con los 2 productos', 'Envío 3 · adicional · 2 productos · 0 sin enviar',
        (SELECT 'Envío ' || v.numero || CASE WHEN v.es_adicional THEN ' · adicional' ELSE '' END
                || ' · ' || (SELECT COUNT(*) FROM detalle_comanda d WHERE d.envio_id = v.id) || ' productos · '
                || (SELECT COUNT(*) FROM detalle_comanda d WHERE d.comanda_id = v.comanda_id AND d.estado = 'sin_enviar') || ' sin enviar'
         FROM envio v WHERE v.comanda_id = pg_temp.c('C-1042') ORDER BY v.numero DESC LIMIT 1));
    PERFORM pg_temp.r(109, '06', 'El Envío 3 llega como una tarjeta a cocina y otra a barra', 'barra: 2× Café de olla · cocina: 1× Flan napolitano',
        (SELECT string_agg(destino || ': ' || productos, ' · ' ORDER BY destino DESC) FROM v_panel_produccion WHERE mesa = '08' AND envio_numero = 3));
    PERFORM pg_temp.r(110, '06', 'Rechaza "Marcar como listo" sin "Empezar a preparar"', 'rechazado',
        pg_temp.rechaza($q$ SELECT pg_temp.avanzar('C-1042', 3, 'cocina', 'listo') $q$));

    -- ---------------- 19:16 · Tolerancia de Roberto Díaz ------------
    paso := '19:16 tolerancia';
    PERFORM pg_temp.reloj('19:16');
    PERFORM pg_temp.r(111, '12', 'Roberto llega 19:16: ya no se le sienta con su reservación', 'rechazado',
        pg_temp.rechaza($q$ UPDATE reservacion SET estado = 'sentada' WHERE nombre_cliente = 'Roberto Díaz' $q$));
    PERFORM fn_revisar_reservaciones();
    PERFORM pg_temp.r(112, '03a', 'El proceso de cada minuto la marca y libera la mesa', 'No se presentó · Mesa 04 Libre desde 19:15',
        (SELECT (SELECT estado_etiqueta FROM v_reservaciones WHERE nombre_cliente = 'Roberto Díaz')
                || ' · Mesa 04 ' || estado_etiqueta || ' desde ' || to_char(libre_desde, 'HH24:MI') FROM v_mapa_mesas WHERE numero = '04'));
    INSERT INTO lista_espera (nombre_cliente, telefono, numero_personas, espera_estimada_min, reservacion_origen_id, registrada_por_usuario_id)
    VALUES ('Roberto Díaz', '55 3333 4444', 2, 25, (SELECT id FROM reservacion WHERE nombre_cliente = 'Roberto Díaz'), pg_temp.u('alopez'));
    PERFORM pg_temp.r(113, '12', 'Si todavía quiere mesa, entra a la lista de espera como cualquier otro', 'posición 4 · venía con reservación',
        (SELECT 'posición ' || posicion || CASE WHEN venia_con_reservacion THEN ' · venía con reservación' ELSE '' END FROM v_lista_espera WHERE nombre_cliente = 'Roberto Díaz'));

    -- ---------------- 19:18 · Asignar mesa a la lista de espera --------
    paso := '19:18 asignar mesa';
    PERFORM pg_temp.reloj('19:18');
    PERFORM pg_temp.r(114, '03b', 'Prioridad: Rosa Jiménez no puede ocupar la Mesa 03 (apartada para Ana Martínez)', 'rechazado',
        pg_temp.rechaza($q$ UPDATE lista_espera SET estado = 'sentada', mesa_id = pg_temp.m('03') WHERE nombre_cliente = 'Rosa Jiménez' $q$));
    UPDATE lista_espera SET estado = 'sentada', mesa_id = pg_temp.m('04') WHERE nombre_cliente = 'Rosa Jiménez';
    PERFORM pg_temp.r(115, '03b', 'Asignar la Mesa 04 (libre) a Rosa Jiménez', 'Por atender · Rosa Jiménez · 3 personas',
        (SELECT estado_etiqueta || ' · ' || grupo_por_atender || ' · ' || personas_por_atender || ' personas' FROM v_mapa_mesas WHERE numero = '04'));
    PERFORM pg_temp.reloj('19:19');
    INSERT INTO comanda (folio, mesa_id, mesero_usuario_id) VALUES ('C-1046', pg_temp.m('04'), pg_temp.u('cruiz'));
    PERFORM pg_temp.r(116, '05a', 'Abrir comanda en Mesa 04: se vincula sola y toma las personas de la hostess', 'lista de espera: Rosa Jiménez · 3 personas · Carlos Ruiz · Comanda abierta',
        (SELECT 'lista de espera: ' || l.nombre_cliente || ' · ' || c.numero_personas || ' personas · ' || u.nombre_completo || ' · ' || fn_etiqueta('estado_mesa', m.estado::text)
         FROM comanda c JOIN lista_espera l ON l.id = c.lista_espera_id JOIN usuario u ON u.id = c.mesero_usuario_id JOIN mesa m ON m.id = c.mesa_id
         WHERE c.folio = 'C-1046'));
    INSERT INTO comanda (folio, mesa_id, mesero_usuario_id) VALUES ('C-1047', pg_temp.m('05'), pg_temp.u('cruiz'));
    PERFORM pg_temp.r(117, '03b', 'Rechaza cambiar de mesa a un grupo ya sentado desde la lista', 'rechazado',
        pg_temp.rechaza($q$ UPDATE lista_espera SET mesa_id = pg_temp.m('14') WHERE nombre_cliente = 'Mariana Soto' $q$));
    PERFORM pg_temp.r(118, '05a', 'Mesa 05: "La hostess registró 2"', 'Mariana Soto · 2 personas',
        (SELECT l.nombre_cliente || ' · ' || c.numero_personas || ' personas' FROM comanda c JOIN lista_espera l ON l.id = c.lista_espera_id WHERE c.folio = 'C-1047'));

    -- ---------------- 19:20 · Reglas de mesas ------------------------
    paso := '19:20 reglas de mesas';
    PERFORM pg_temp.reloj('19:20');
    PERFORM pg_temp.r(119, '05a', 'Rechaza abrir comanda en una mesa bloqueada', 'rechazado',
        pg_temp.rechaza($q$ INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-9001', pg_temp.m('16'), pg_temp.u('cruiz'), 2) $q$));
    PERFORM pg_temp.r(120, '05a', 'Rechaza abrir comanda en una mesa apartada para una reservación', 'rechazado',
        pg_temp.rechaza($q$ INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-9002', pg_temp.m('03'), pg_temp.u('cruiz'), 2) $q$));
    PERFORM pg_temp.r(121, '05a', 'Rechaza una segunda comanda abierta en la misma mesa', 'rechazado',
        pg_temp.rechaza($q$ INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-9003', pg_temp.m('08'), pg_temp.u('cruiz'), 2) $q$));
    PERFORM pg_temp.r(122, '04', 'Rechaza poner una mesa en "Comanda abierta" a mano (sin comanda)', 'rechazado',
        pg_temp.rechaza($q$ UPDATE mesa SET estado = 'comanda_abierta' WHERE numero = '01' $q$));
    UPDATE mesa SET estado = 'libre' WHERE numero = '03';
    PERFORM pg_temp.r(123, '04', 'Liberar a mano una mesa apartada no borra el apartado', 'Mesa 03: Reservada',
        (SELECT 'Mesa 03: ' || estado_etiqueta FROM v_mapa_mesas WHERE numero = '03'));
    PERFORM pg_temp.r(124, '04', 'Rechaza bloquear una mesa sin escribir el motivo', 'rechazado',
        pg_temp.rechaza($q$ UPDATE mesa SET estado = 'bloqueada' WHERE numero = '14' $q$));
    PERFORM pg_temp.r(125, '04', 'Rechaza bloquear una mesa ocupada', 'rechazado',
        pg_temp.rechaza($q$ UPDATE mesa SET estado = 'bloqueada', motivo_bloqueo = 'Prueba' WHERE numero = '08' $q$));

    -- ---------------- 19:21 · La mesa de otro mesero -----------------
    -- 05a · "Quien abre la comanda queda como su mesero": solo él la trabaja.
    -- Para que otro la tome, él mismo o el gerente se la transfieren.
    paso := '19:21 mesa de otro mesero';
    PERFORM pg_temp.reloj('19:21');
    PERFORM pg_temp.actor('lmora');
    PERFORM pg_temp.r(180, '05a', 'Rechaza que un mesero agregue productos en una mesa que no es suya (Luis Mora en la Mesa 12 de Carlos)', 'rechazado',
        pg_temp.rechaza($q$ SELECT pg_temp.agregar('C-1044', 'Flan napolitano', 1, 3) $q$));
    PERFORM pg_temp.r(181, '05a', 'Rechaza abrir una comanda a nombre de otro mesero', 'rechazado',
        pg_temp.rechaza($q$ INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-9005', pg_temp.m('14'), pg_temp.u('cruiz'), 2) $q$));
    PERFORM pg_temp.actor('cruiz');
    v_id := pg_temp.agregar('C-1044', 'Flan napolitano', 1, 3);              -- Carlos sí agrega en su mesa
    PERFORM pg_temp.actor('lmora');
    PERFORM pg_temp.r(182, '05b', 'Rechaza que otro mesero envíe a cocina lo de una mesa que no es suya', 'rechazado',
        pg_temp.rechaza($q$ SELECT pg_temp.enviar('C-1044', 'lmora') $q$));
    PERFORM pg_temp.r(183, '05b', 'Rechaza que otro mesero quite productos de una mesa que no es suya', 'rechazado',
        pg_temp.rechaza(format($q$ DELETE FROM detalle_comanda WHERE id = %s $q$, v_id)));
    PERFORM pg_temp.actor('cruiz');
    DELETE FROM detalle_comanda WHERE id = v_id;                               -- Carlos sí lo quita
    PERFORM pg_temp.actor('lmora');
    PERFORM pg_temp.r(184, '05b', 'Rechaza que otro mesero pida la cuenta de una mesa que no es suya', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET estado = 'por_cobrar' WHERE folio = 'C-1044' $q$));
    PERFORM pg_temp.r(185, '05b', 'Rechaza que otro mesero use "Cambiar mesa" en una comanda que no es suya', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET mesa_id = pg_temp.m('14') WHERE folio = 'C-1044' $q$));
    PERFORM pg_temp.r(186, '05b', 'Rechaza que un mesero se transfiera a sí mismo la comanda de otro', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET mesero_usuario_id = pg_temp.u('lmora') WHERE folio = 'C-1044' $q$));
    PERFORM pg_temp.actor('');
    PERFORM pg_temp.r(187, '05b', 'Rechaza transferir sin indicar quién lo hace (debe quedar en bitácora)', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET mesero_usuario_id = pg_temp.u('lmora') WHERE folio = 'C-1044' $q$));
    PERFORM pg_temp.actor('cruiz');
    UPDATE comanda SET mesero_usuario_id = pg_temp.u('lmora') WHERE folio = 'C-1044';     -- "Transferir" (cambio de turno)
    PERFORM pg_temp.actor('lmora');
    v_id := pg_temp.agregar('C-1044', 'Flan napolitano', 1, 3);              -- ahora Luis sí puede
    PERFORM pg_temp.r(188, '05b', 'Carlos transfiere su Mesa 12 a Luis Mora (cambio de turno): queda en bitácora y Luis ya la trabaja', 'Mesa 12: Luis Mora · bitácora: Carlos Ruiz la pasó de Carlos Ruiz a Luis Mora · Luis agregó Flan napolitano',
        (SELECT 'Mesa 12: ' || v.mesero || ' · bitácora: ' || quien.nombre_completo || ' la pasó de ' || de.nombre_completo || ' a ' || a.nombre_completo
                || ' · Luis agregó ' || (SELECT nombre_producto FROM detalle_comanda WHERE id = v_id)
         FROM v_mapa_mesas v
         JOIN bitacora b ON b.entidad = 'comanda' AND b.entidad_id = v.comanda_id AND b.accion = 'transferir'
         JOIN usuario quien ON quien.id = b.usuario_id
         JOIN usuario de    ON de.id = (b.detalle->>'de')::bigint
         JOIN usuario a     ON a.id  = (b.detalle->>'a')::bigint
         WHERE v.numero = '12'));
    DELETE FROM detalle_comanda WHERE id = v_id;
    PERFORM pg_temp.actor('cruiz');
    PERFORM pg_temp.r(189, '05a', 'Ya transferida, Carlos deja de trabajar la Mesa 12', 'rechazado',
        pg_temp.rechaza($q$ SELECT pg_temp.agregar('C-1044', 'Flan napolitano', 1, 3) $q$));
    PERFORM pg_temp.actor('lsaenz');
    UPDATE comanda SET mesero_usuario_id = pg_temp.u('cruiz') WHERE folio = 'C-1044';     -- el gerente la regresa
    PERFORM pg_temp.r(190, '05b', 'El gerente también transfiere (le regresa la Mesa 12 a Carlos)', 'Mesa 12: Carlos Ruiz · 2 transferencias en bitácora',
        (SELECT 'Mesa 12: ' || mesero || ' · ' || (SELECT COUNT(*) FROM bitacora WHERE entidad = 'comanda' AND entidad_id = v.comanda_id AND accion = 'transferir')
                || ' transferencias en bitácora' FROM v_mapa_mesas v WHERE numero = '12'));
    PERFORM pg_temp.actor('cruiz');
    PERFORM pg_temp.avanzar('C-1040', 1, 'cocina', 'entregado', 'cruiz');
    PERFORM pg_temp.r(191, '06', 'Entregar sí lo puede cualquier mesero (Carlos lleva el salmón de la Mesa 09 de Luis)', 'Salmón a la parrilla: Entregado',
        (SELECT nombre_producto || ': ' || fn_etiqueta('estado_linea', estado::text) FROM detalle_comanda WHERE comanda_id = pg_temp.c('C-1040')));
    PERFORM pg_temp.actor('');

    -- ---------------- 19:22–19:33 · Cocina y barra terminan la Mesa 08
    paso := '19:22 cocina';
    PERFORM pg_temp.reloj('19:22');
    PERFORM pg_temp.r(126, '06', 'Rechaza que un mesero mueva las tarjetas del panel', 'rechazado',
        pg_temp.rechaza($q$ SELECT pg_temp.avanzar('C-1042', 1, 'cocina', 'listo', 'cruiz') $q$));
    PERFORM pg_temp.avanzar('C-1042', 1, 'cocina', 'listo');
    PERFORM pg_temp.avanzar('C-1042', 2, 'cocina', 'en_preparacion');
    PERFORM pg_temp.avanzar('C-1042', 3, 'cocina', 'en_preparacion'); PERFORM pg_temp.avanzar('C-1042', 3, 'barra', 'en_preparacion');
    PERFORM pg_temp.reloj('19:24'); PERFORM pg_temp.avanzar('C-1042', 1, 'cocina', 'entregado');
    PERFORM pg_temp.reloj('19:27'); PERFORM pg_temp.avanzar('C-1042', 3, 'barra', 'listo');
    PERFORM pg_temp.reloj('19:30'); PERFORM pg_temp.avanzar('C-1042', 2, 'cocina', 'listo');
    PERFORM pg_temp.reloj('19:31'); PERFORM pg_temp.avanzar('C-1042', 2, 'cocina', 'entregado');
    PERFORM pg_temp.reloj('19:32'); PERFORM pg_temp.avanzar('C-1042', 3, 'cocina', 'listo');
    PERFORM pg_temp.reloj('19:33'); PERFORM pg_temp.avanzar('C-1042', 3, 'cocina', 'entregado'); PERFORM pg_temp.avanzar('C-1042', 3, 'barra', 'entregado', 'cruiz');
    PERFORM pg_temp.r(127, '06', 'Todo lo de la Mesa 08 se entrega (el café lo marca el mesero, 12 paso 6)', '6 de 6 entregados',
        (SELECT COUNT(*) FILTER (WHERE estado = 'entregado') || ' de ' || COUNT(*) || ' entregados' FROM detalle_comanda WHERE comanda_id = pg_temp.c('C-1042')));

    -- ---------------- 19:34 · Quitar -----------------------------------
    paso := '19:34 quitar';
    PERFORM pg_temp.reloj('19:34');
    INSERT INTO detalle_comanda (comanda_id, producto_id, cantidad, tiempo, precio_unitario)
    VALUES (pg_temp.c('C-1042'), pg_temp.p('Churros con cajeta'), 1, 3, 0.01) RETURNING id INTO v_id;
    PERFORM pg_temp.r(128, '05b', 'El precio siempre sale del menú (aunque la app mande otro); cocina o barra, de la categoría', '90.00 · cocina',
        (SELECT precio_unitario || ' · ' || (SELECT destino FROM v_comanda_detalle WHERE id = v_id) FROM detalle_comanda WHERE id = v_id));
    PERFORM pg_temp.r(129, '05b', 'Rechaza cambiar el producto de una línea (así se saltaría el 86)', 'rechazado',
        pg_temp.rechaza(format($q$ UPDATE detalle_comanda SET producto_id = pg_temp.p('Pay de limón') WHERE id = %s $q$, v_id)));
    PERFORM pg_temp.r(130, '05b', 'Rechaza meter un producto nuevo en un envío anterior (Envío 1)', 'rechazado',
        pg_temp.rechaza(format($q$ UPDATE detalle_comanda SET estado = 'por_preparar',
            envio_id = (SELECT id FROM envio WHERE comanda_id = pg_temp.c('C-1042') AND numero = 1) WHERE id = %s $q$, v_id)));
    DELETE FROM detalle_comanda WHERE id = v_id;
    PERFORM pg_temp.r(131, '05b', '"Quitar" un producto Sin enviar', 'quitado',
        (SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM detalle_comanda WHERE id = v_id) THEN 'quitado' ELSE 'sigue ahí' END));
    PERFORM pg_temp.r(132, '05b', 'Rechaza "Quitar" algo que ya se envió', 'rechazado',
        pg_temp.rechaza($q$ DELETE FROM detalle_comanda WHERE id = pg_temp.linea('C-1042', 'Pasta Alfredo') $q$));

    -- ---------------- 19:40 · Pedir la cuenta y pre-ticket -------------
    paso := '19:40 pedir la cuenta';
    PERFORM pg_temp.reloj('19:40');
    UPDATE comanda SET estado = 'por_cobrar' WHERE folio = 'C-1042';
    PERFORM pg_temp.r(133, '05b', 'Pedir la cuenta: comanda Por cobrar y aviso en el mapa', 'Por cobrar · Mesa 08: Por cobrar',
        (SELECT (SELECT estado_etiqueta FROM v_comanda_resumen WHERE folio = 'C-1042') || ' · Mesa 08: ' || estado_etiqueta FROM v_mapa_mesas WHERE numero = '08'));
    PERFORM pg_temp.r(135, '07', 'El pre-ticket se genera con una consulta (no se guarda) y la comanda congela el IVA', 'Pre-ticket · 1355.00 + IVA 216.80 = 1571.80 · tasa 0.1600',
        (SELECT tipo || ' · ' || subtotal || ' + IVA ' || iva || ' = ' || total || ' · tasa ' || tasa_impuesto FROM v_ticket WHERE folio = 'C-1042'));
    PERFORM pg_temp.r(136, '07', 'Rechaza cancelar un producto con la cuenta pedida', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO cancelacion (tipo, detalle_comanda_id, motivo, solicitado_por_usuario_id, autorizado_por_usuario_id)
        VALUES ('producto', pg_temp.linea('C-1042', 'Tacos de camarón'), 'Prueba', pg_temp.u('cruiz'), pg_temp.u('lsaenz')) $q$));
    PERFORM pg_temp.r(137, '05b', 'Con la cuenta pedida no se agregan productos', 'rechazado',
        pg_temp.rechaza($q$ SELECT pg_temp.agregar('C-1042', 'Churros con cajeta', 1, 3) $q$));
    PERFORM pg_temp.actor('cruiz');
    PERFORM pg_temp.r(134, '07', 'Rechaza que el mesero cancele el pre-ticket (lo hace caja)', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET estado = 'abierta' WHERE folio = 'C-1042' $q$));
    PERFORM pg_temp.actor('');
    PERFORM pg_temp.r(138, '07', 'Rechaza cancelar el pre-ticket sin decir quién lo hace (queda en bitácora)', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET estado = 'abierta' WHERE folio = 'C-1042' $q$));
    PERFORM pg_temp.reloj('19:41');
    PERFORM pg_temp.actor('mdiaz');
    UPDATE comanda SET estado = 'abierta' WHERE folio = 'C-1042';           -- "Cancelar pre-ticket": la mesa pidió churros
    PERFORM pg_temp.actor('');
    PERFORM pg_temp.r(139, '07', 'La cajera cancela el pre-ticket: la comanda vuelve a Abierta y queda en bitácora', 'comanda Abierta · Mesa 08: Comanda abierta · bitácora: Marta Díaz canceló el pre-ticket',
        (SELECT 'comanda ' || fn_etiqueta('estado_comanda', c.estado::text) || ' · Mesa 08: ' || fn_etiqueta('estado_mesa', m.estado::text)
                || ' · bitácora: ' || (SELECT u.nombre_completo FROM bitacora b JOIN usuario u ON u.id = b.usuario_id
                                       WHERE b.entidad = 'comanda' AND b.entidad_id = c.id AND b.accion = 'cancelar_pre_ticket') || ' canceló el pre-ticket'
         FROM comanda c JOIN mesa m ON m.id = c.mesa_id WHERE c.folio = 'C-1042'));
    PERFORM pg_temp.agregar('C-1042', 'Churros con cajeta', 1, 3);
    PERFORM pg_temp.reloj('19:42'); PERFORM pg_temp.enviar('C-1042', 'cruiz');
    PERFORM pg_temp.avanzar('C-1042', 4, 'cocina', 'en_preparacion');
    PERFORM pg_temp.reloj('19:43'); PERFORM pg_temp.avanzar('C-1042', 4, 'cocina', 'listo'); PERFORM pg_temp.avanzar('C-1042', 4, 'cocina', 'entregado');
    UPDATE comanda SET estado = 'por_cobrar' WHERE folio = 'C-1042';
    PERFORM pg_temp.r(140, '05b', 'Los churros llegan como Envío 4 y el pre-ticket nuevo ya los incluye', 'Envío 4 · pre-ticket 1445.00 + 231.20 = 1676.20',
        (SELECT 'Envío ' || MAX(v.numero) || ' · pre-ticket ' || (SELECT subtotal || ' + ' || iva || ' = ' || total FROM v_ticket WHERE folio = 'C-1042')
         FROM envio v WHERE v.comanda_id = pg_temp.c('C-1042')));

    -- ---------------- 19:45 · Cobro con la cuenta dividida (varios pagos)
    paso := '19:45 cobro';
    PERFORM pg_temp.reloj('19:45');
    PERFORM pg_temp.r(141, '07', 'La tasa de IVA de la comanda no se escribe a mano', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET tasa_impuesto = 0 WHERE folio = 'C-1042' $q$));
    PERFORM pg_temp.r(142, '07', 'Rechaza cerrar la comanda a mano con saldo pendiente', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET estado = 'cerrada', cerrada_por_usuario_id = pg_temp.u('mdiaz') WHERE folio = 'C-1042' $q$));
    PERFORM pg_temp.r(143, '07', 'Rechaza efectivo recibido menor a lo que se cobra', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO pago (comanda_id, metodo, monto, monto_recibido, registrado_por_usuario_id) VALUES (pg_temp.c('C-1042'), 'efectivo', 1357.20, 1000.00, pg_temp.u('mdiaz')) $q$));
    PERFORM pg_temp.r(144, '07', 'Rechaza un pago mayor a lo que falta por cobrar', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO pago (comanda_id, metodo, monto, registrado_por_usuario_id) VALUES (pg_temp.c('C-1042'), 'tarjeta', 2000.00, pg_temp.u('mdiaz')) $q$));
    PERFORM pg_temp.r(192, '07', 'Rechaza cobrar si quien cobra no tiene caja abierta', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO pago (comanda_id, metodo, monto, registrado_por_usuario_id) VALUES (pg_temp.c('C-1042'), 'tarjeta', 100.00, pg_temp.u('lsaenz')) $q$));
    INSERT INTO pago (comanda_id, metodo, monto, monto_recibido, registrado_por_usuario_id)
    VALUES (pg_temp.c('C-1042'), 'efectivo', 1357.20, 1500.00, pg_temp.u('mdiaz'));
    PERFORM pg_temp.r(146, '07', 'Dividir cuenta: el primer pago deja saldo y la comanda sigue Por cobrar', 'Por cobrar · pagado 1357.20 · falta 319.00',
        (SELECT estado_etiqueta || ' · pagado ' || pagado || ' · falta ' || (total - pagado) FROM v_comanda_resumen WHERE folio = 'C-1042'));
    PERFORM pg_temp.r(147, '07', 'El cambio se calcula, no se guarda', 'Efectivo 1357.20 · recibido 1500.00 · cambio 142.80',
        (SELECT metodo_etiqueta || ' ' || monto || ' · recibido ' || monto_recibido || ' · cambio ' || cambio FROM v_ticket_pagos WHERE folio = 'C-1042'));
    PERFORM pg_temp.actor('mdiaz');
    PERFORM pg_temp.r(145, '12', 'Con pagos registrados la comanda ya no se reabre', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET estado = 'abierta' WHERE folio = 'C-1042' $q$));
    PERFORM pg_temp.actor('');
    PERFORM pg_temp.r(149, '12', 'Rechaza que el mesero cierre la comanda (solo caja)', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET estado = 'cerrada', cerrada_por_usuario_id = pg_temp.u('cruiz') WHERE folio = 'C-1042' $q$));
    PERFORM pg_temp.r(150, '07', 'Rechaza modificar un pago ya registrado', 'rechazado',
        pg_temp.rechaza($q$ UPDATE pago SET monto = 1 WHERE comanda_id = pg_temp.c('C-1042') $q$));
    INSERT INTO pago (comanda_id, metodo, monto, referencia, registrado_por_usuario_id) VALUES (pg_temp.c('C-1042'), 'tarjeta', 200.00, 'AUT 482913', pg_temp.u('mdiaz'));
    INSERT INTO pago (comanda_id, metodo, monto, monto_recibido, registrado_por_usuario_id) VALUES (pg_temp.c('C-1042'), 'efectivo', 119.00, 120.00, pg_temp.u('mdiaz'));
    PERFORM pg_temp.r(148, '07', 'Al cubrir el total la comanda se cierra sola (pago mixto)', '3 pagos · 1676.20 de 1676.20 · Mixto · Cerrada',
        (SELECT pagos || ' pagos · ' || pagado || ' de ' || total || ' · ' || metodo || ' · '
                || fn_etiqueta('estado_comanda', (SELECT estado FROM comanda WHERE folio = 'C-1042')::text)
         FROM v_ticket WHERE folio = 'C-1042'));
    PERFORM pg_temp.r(151, '12', 'Caja cobra y la comanda se cierra: la mesa queda libre', 'Cerrada · Mesa 08 Libre desde 19:45',
        (SELECT (SELECT estado_etiqueta FROM v_comanda_resumen WHERE folio = 'C-1042') || ' · Mesa 08 ' || estado_etiqueta || ' desde ' || to_char(libre_desde, 'HH24:MI')
         FROM v_mapa_mesas WHERE numero = '08'));
    PERFORM pg_temp.r(193, '08', 'El ticket de la Mesa 08 se genera de la comanda y sus pagos', 'Ticket · C-1042 · 7 renglones · 1445.00 + 231.20 = 1676.20 · Mixto',
        (SELECT tipo || ' · ' || folio || ' · ' || (SELECT COUNT(*) FROM v_ticket_lineas l WHERE l.folio = t.folio) || ' renglones · '
                || subtotal || ' + ' || iva || ' = ' || total || ' · ' || metodo FROM v_ticket t WHERE folio = 'C-1042'));
    PERFORM pg_temp.r(152, '12', 'Una comanda pagada no admite productos', 'rechazado',
        pg_temp.rechaza($q$ SELECT pg_temp.agregar('C-1042', 'Churros con cajeta', 1, 3) $q$));
    PERFORM pg_temp.r(153, '12', 'Una comanda pagada no se reabre', 'rechazado',
        pg_temp.rechaza($q$ UPDATE comanda SET estado = 'abierta' WHERE folio = 'C-1042' $q$));
    PERFORM pg_temp.reloj('19:46');
    INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-1048', pg_temp.m('08'), pg_temp.u('cruiz'), 2);
    PERFORM pg_temp.agregar('C-1048', 'Hamburguesa KL', 1, 2, 'término medio');
    PERFORM pg_temp.enviar('C-1048', 'cruiz');
    PERFORM pg_temp.r(158, '12', 'Si piden algo más, se abre otra comanda en la misma mesa', 'C-1048 · Abierta · Mesa 08: Comanda abierta · 2 comandas hoy',
        (SELECT c.folio || ' · ' || fn_etiqueta('estado_comanda', c.estado::text) || ' · Mesa 08: ' || fn_etiqueta('estado_mesa', m.estado::text)
                || ' · ' || (SELECT COUNT(*) FROM comanda WHERE mesa_id = m.id) || ' comandas hoy'
         FROM comanda c JOIN mesa m ON m.id = c.mesa_id WHERE c.folio = 'C-1048'));

    -- ---------------- 19:50 · Cancelaciones ----------------------------
    paso := '19:50 cancelaciones';
    PERFORM pg_temp.reloj('19:50');
    PERFORM pg_temp.r(159, '05b', 'Rechaza cancelar un producto enviado sin autorización del gerente', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO cancelacion (tipo, detalle_comanda_id, motivo, solicitado_por_usuario_id, autorizado_por_usuario_id)
        VALUES ('producto', pg_temp.linea('C-1044', 'Sopa de tortilla'), 'Prueba', pg_temp.u('cruiz'), pg_temp.u('cruiz')) $q$));
    PERFORM pg_temp.r(160, '05b', 'Rechaza cancelar un producto sin registrar la cancelación', 'rechazado',
        pg_temp.rechaza($q$ UPDATE detalle_comanda SET estado = 'cancelado' WHERE id = pg_temp.linea('C-1044', 'Sopa de tortilla') $q$));
    INSERT INTO cancelacion (tipo, detalle_comanda_id, motivo, solicitado_por_usuario_id, autorizado_por_usuario_id)
    VALUES ('producto', pg_temp.linea('C-1044', 'Sopa de tortilla'), 'Tardó demasiado', pg_temp.u('cruiz'), pg_temp.u('lsaenz'));
    PERFORM pg_temp.r(161, '10', 'Reporte de cancelaciones: motivo, monto, quién pidió y quién autorizó', 'Sopa de tortilla · 190.00 · Tardó demasiado · Carlos Ruiz > Luis Sáenz Jiménez · Mesa 12 ahora 197.20',
        (SELECT producto || ' · ' || monto || ' · ' || motivo || ' · ' || solicito || ' > ' || autorizo
                || ' · Mesa 12 ahora ' || (SELECT total FROM v_mapa_mesas WHERE numero = '12')
         FROM v_cancelaciones WHERE tipo = 'producto'));
    INSERT INTO cancelacion (tipo, comanda_id, motivo, solicitado_por_usuario_id, autorizado_por_usuario_id)
    VALUES ('comanda', pg_temp.c('C-1045'), 'El grupo se fue sin ordenar', pg_temp.u('aruiz'), pg_temp.u('lsaenz'));
    PERFORM pg_temp.r(162, '05b', 'Cancelar comanda (autoriza el gerente): la mesa se libera', 'C-1045 Cancelada · Mesa 17 Libre',
        (SELECT c.folio || ' ' || fn_etiqueta('estado_comanda', c.estado::text) || ' · Mesa 17 ' || fn_etiqueta('estado_mesa', m.estado::text)
         FROM comanda c JOIN mesa m ON m.id = c.mesa_id WHERE c.folio = 'C-1045'));
    -- Mesa 02 paga una parte con tarjeta: queda a medias
    INSERT INTO pago (comanda_id, metodo, monto, referencia, registrado_por_usuario_id) VALUES (pg_temp.c('C-1041'), 'tarjeta', 500.00, 'AUT 551027', pg_temp.u('mdiaz'));
    PERFORM pg_temp.actor('mdiaz');
    PERFORM pg_temp.r(163, '12', 'Con un pago a medias la comanda no se cancela, no se reabre y el corte no se cierra', 'C-1041 sigue Por cobrar · falta 480.20 · cancelar: rechazado · reabrir: rechazado · corte: rechazado',
        (SELECT c.folio || ' sigue ' || fn_etiqueta('estado_comanda', c.estado::text) || ' · falta ' || (fn_total_comanda(c.id) - fn_pagado_comanda(c.id))
                || ' · cancelar: ' || split_part(pg_temp.rechaza($q$ INSERT INTO cancelacion (tipo, comanda_id, motivo, solicitado_por_usuario_id, autorizado_por_usuario_id)
                                                               VALUES ('comanda', pg_temp.c('C-1041'), 'Prueba', pg_temp.u('mdiaz'), pg_temp.u('lsaenz')) $q$), ':', 1)
                || ' · reabrir: ' || split_part(pg_temp.rechaza($q$ UPDATE comanda SET estado = 'abierta' WHERE folio = 'C-1041' $q$), ':', 1)
                || ' · corte: ' || split_part(pg_temp.rechaza($q$ SELECT fn_cerrar_corte((SELECT id FROM corte_caja WHERE folio = 'Z-0031'), pg_temp.u('mdiaz'), 0) $q$), ':', 1)
         FROM comanda c WHERE c.folio = 'C-1041'));
    PERFORM pg_temp.actor('');
    -- y termina de pagar en efectivo: la comanda se cierra sola
    INSERT INTO pago (comanda_id, metodo, monto, monto_recibido, registrado_por_usuario_id) VALUES (pg_temp.c('C-1041'), 'efectivo', 480.20, 500.00, pg_temp.u('mdiaz'));
    PERFORM pg_temp.r(164, '05b', 'Rechaza capturar un producto con 86 (agotado)', 'rechazado',
        pg_temp.rechaza($q$ SELECT pg_temp.agregar('C-1048', 'Pay de limón', 1, 3) $q$));

    -- ---------------- 19:55 · Usuarios y roles -------------------------
    paso := '19:55 usuarios';
    PERFORM pg_temp.reloj('19:55');
    PERFORM pg_temp.actor('lsaenz');
    UPDATE usuario SET contrasena_hash = 'bcrypt:propia', requiere_cambio_pw = FALSE WHERE nombre_usuario = 'smendez';
    PERFORM pg_temp.r(165, '02a', 'Sofía Méndez entra por primera vez y crea su contraseña (02b paso 3)', 'Pendiente > Activo',
        (SELECT 'Pendiente > ' || estado_etiqueta FROM v_usuarios WHERE nombre_usuario = 'smendez'));
    INSERT INTO usuario (rol_id, nombre_completo, nombre_usuario, contrasena_hash)
    VALUES ((SELECT id FROM rol WHERE nombre = 'Mesero'), 'Pedro Gómez', 'pgomez', 'bcrypt:temporal');
    PERFORM pg_temp.r(166, '02a', 'Rechaza pasar de Pendiente a Activo sin crear su contraseña', 'rechazado',
        pg_temp.rechaza($q$ UPDATE usuario SET estado = 'activo' WHERE nombre_usuario = 'pgomez' $q$));
    PERFORM pg_temp.r(167, '01b', 'Rechaza quitar la contraseña temporal sin poner una nueva', 'rechazado',
        pg_temp.rechaza($q$ UPDATE usuario SET requiere_cambio_pw = FALSE WHERE nombre_usuario = 'pgomez' $q$));
    PERFORM pg_temp.r(168, '02b', 'Rechaza crear un usuario directamente Activo', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO usuario (rol_id, nombre_completo, nombre_usuario, contrasena_hash, estado, requiere_cambio_pw)
        VALUES ((SELECT id FROM rol WHERE nombre = 'Mesero'), 'X', 'x', 'bcrypt:x', 'activo', FALSE) $q$));
    UPDATE usuario SET contrasena_hash = 'bcrypt:temporal-2', requiere_cambio_pw = TRUE WHERE nombre_usuario = 'cruiz';
    PERFORM pg_temp.r(169, '12', 'El gerente restablece la contraseña de Carlos (queda en bitácora)', 'Activo · Contraseña restablecida: la cambia al entrar · por Luis Sáenz Jiménez',
        (SELECT estado_etiqueta || ' · ' || aviso || ' · por ' ||
                (SELECT u.nombre_completo FROM bitacora b JOIN usuario u ON u.id = b.usuario_id
                 WHERE b.accion = 'restablecer_contrasena' AND b.entidad_id = pg_temp.u('cruiz') ORDER BY b.id DESC LIMIT 1)
         FROM v_usuarios WHERE nombre_usuario = 'cruiz'));
    UPDATE usuario SET contrasena_hash = 'bcrypt:propia', requiere_cambio_pw = FALSE WHERE nombre_usuario = 'pgomez';
    INSERT INTO sesion (usuario_id, token_hash, expira_en) VALUES (pg_temp.u('pgomez'), 'tkn-pgomez', '2026-09-23 02:00-06');
    UPDATE usuario SET estado = 'dado_de_baja' WHERE nombre_usuario = 'pgomez';
    PERFORM pg_temp.r(170, '02a', 'Dar de baja cierra sus sesiones', 'Dado de baja · en línea: no',
        (SELECT estado_etiqueta || ' · en línea: ' || CASE WHEN en_linea THEN 'sí' ELSE 'no' END FROM v_usuarios WHERE nombre_usuario = 'pgomez'));
    PERFORM pg_temp.r(171, '12', 'Un usuario dado de baja ya no puede entrar', 'rechazado',
        pg_temp.rechaza($q$ INSERT INTO sesion (usuario_id, token_hash, expira_en) VALUES (pg_temp.u('pgomez'), 'tkn', '2026-09-23 02:00-06') $q$));
    PERFORM pg_temp.r(172, '12', 'Un usuario dado de baja ya no puede abrir comandas', 'rechazado',
        pg_temp.rechaza($q$ INSERT INTO comanda (folio, mesa_id, mesero_usuario_id, numero_personas) VALUES ('C-9004', pg_temp.m('01'), pg_temp.u('pgomez'), 2) $q$));
    PERFORM pg_temp.r(173, '02c', 'Rechaza dar de baja un rol con usuarios asignados', 'rechazado',
        pg_temp.rechaza($q$ UPDATE rol SET activo = FALSE WHERE nombre = 'Mesero' $q$));
    PERFORM pg_temp.r(174, '02c', 'Rechaza dar de baja el rol Gerente', 'rechazado',
        pg_temp.rechaza($q$ UPDATE rol SET activo = FALSE WHERE nombre = 'Gerente' $q$));
    PERFORM pg_temp.r(175, '02c', 'Rechaza quitarle permisos al Gerente', 'rechazado', pg_temp.rechaza($q$
        DELETE FROM rol_permiso WHERE rol_id = (SELECT id FROM rol WHERE nombre = 'Gerente')
                                  AND permiso_id = (SELECT id FROM permiso WHERE clave = 'ticket.pre_ticket') $q$));
    PERFORM pg_temp.r(176, '02c', 'Rechaza cambiarle un permiso al Gerente por otro rol', 'rechazado', pg_temp.rechaza($q$
        UPDATE rol_permiso SET rol_id = (SELECT id FROM rol WHERE nombre = 'Mesero')
        WHERE rol_id = (SELECT id FROM rol WHERE nombre = 'Gerente') AND permiso_id = (SELECT id FROM permiso WHERE clave = 'caja.corte') $q$));

    -- ---------------- 20:10 · Corte Z ----------------------------------
    paso := '20:10 corte';
    PERFORM pg_temp.reloj('20:10');
    PERFORM fn_cerrar_corte((SELECT id FROM corte_caja WHERE folio = 'Z-0031'), pg_temp.u('mdiaz'), 3769.60);
    PERFORM pg_temp.r(177, '08', 'Corte Z-0031: los totales se calculan con una consulta (no se guardan)', 'Efectivo 2269.60 · Tarjeta 700.00 · Esperado en caja 3769.60 · Contado 3769.60 · Diferencia 0.00 · Cerrado',
        (SELECT 'Efectivo ' || efectivo || ' · Tarjeta ' || tarjeta || ' · Esperado en caja ' || efectivo_esperado || ' · Contado ' || efectivo_declarado
                || ' · Diferencia ' || diferencia || ' · ' || estado_etiqueta FROM v_cortes_caja WHERE folio = 'Z-0031'));
    PERFORM pg_temp.r(178, '08', 'Un corte cerrado es inmutable', 'rechazado',
        pg_temp.rechaza($q$ UPDATE corte_caja SET efectivo_declarado = 0 WHERE folio = 'Z-0031' $q$));
    UPDATE comanda SET estado = 'por_cobrar' WHERE folio = 'C-1048';
    PERFORM pg_temp.r(179, '07', 'Después del corte, para cobrar hay que abrir caja otra vez', 'rechazado', pg_temp.rechaza($q$
        INSERT INTO pago (comanda_id, metodo, monto, registrado_por_usuario_id) VALUES (pg_temp.c('C-1048'), 'tarjeta', 100.00, pg_temp.u('mdiaz')) $q$));

    -- Guardar resultados y deshacer todo lo de la Parte B
    paso := 'fin';
    SELECT jsonb_agg(to_jsonb(x)) INTO res FROM resultado_prueba x WHERE x.orden > 100;
    RAISE EXCEPTION USING ERRCODE = 'KLRBK';
  EXCEPTION
    WHEN SQLSTATE 'KLRBK' THEN NULL;
    WHEN OTHERS THEN
        res := jsonb_build_array(jsonb_build_object('orden', 199, 'pantalla', '—',
                   'verificacion', 'La Parte B se detuvo en el paso «' || paso || '»', 'esperado', 'sin errores',
                   'obtenido', SQLERRM, 'estado', 'FALLA'));
  END;
  INSERT INTO resultado_prueba SELECT * FROM jsonb_populate_recordset(NULL::resultado_prueba, res);
END
$prueba$;


-- =====================================================================
--  PARTE C · Inventario del esquema y regreso a las 19:09
-- =====================================================================
SELECT pg_temp.r(201, 'ERD', 'Tablas', '19', (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_schema = 'kitchenlink' AND table_type = 'BASE TABLE'));
SELECT pg_temp.r(202, 'ERD', 'Llaves foráneas (relaciones del diagrama)', '32', (SELECT COUNT(*)::text FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'kitchenlink' AND c.contype = 'f'));
SELECT pg_temp.r(203, 'ERD', 'Tipos ENUM (estados)', '10', (SELECT COUNT(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'kitchenlink' AND t.typtype = 'e'));
SELECT pg_temp.r(204, 'ERD', 'Vistas (una o más por pantalla; tickets y reportes salen de aquí)', '22', (SELECT COUNT(*)::text FROM information_schema.views WHERE table_schema = 'kitchenlink'));
SELECT pg_temp.r(206, 'ERD', 'Sin columnas genéricas creado_en / actualizado_en', '0',
    (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_schema = 'kitchenlink' AND column_name IN ('creado_en','actualizado_en')
       AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'kitchenlink' AND table_type = 'BASE TABLE')));
SELECT pg_temp.r(205, 'Todas', 'La Parte B se deshizo: la base quedó como en las pantallas', 'Mesa 08: Comanda abierta · 2 sin enviar · 19:09',
    (SELECT 'Mesa 08: ' || estado_etiqueta || ' · ' || productos_sin_enviar || ' sin enviar · ' || to_char(fn_ahora(), 'HH24:MI') FROM v_mapa_mesas WHERE numero = '08'));


-- =====================================================================
--  RESULTADO · esta es la tabla que verás en pgAdmin
-- =====================================================================
SELECT 0 AS "#", '—' AS "Pantalla", '=== RESUMEN ===' AS "Verificación",
       COUNT(*) || ' pruebas' AS "Esperado (pantalla)",
       COUNT(*) FILTER (WHERE estado = 'PASA') || ' pasaron · ' || COUNT(*) FILTER (WHERE estado = 'AJUSTAR PANTALLA') || ' ajustes de pantalla' AS "Obtenido (base)",
       CASE WHEN COUNT(*) FILTER (WHERE estado = 'FALLA') > 0 THEN COUNT(*) FILTER (WHERE estado = 'FALLA') || ' FALLARON'
            WHEN COUNT(*) FILTER (WHERE estado = 'AJUSTAR PANTALLA') > 0 THEN 'BASE CORRECTA · ' || COUNT(*) FILTER (WHERE estado = 'AJUSTAR PANTALLA') || ' AJUSTES EN PANTALLAS'
            ELSE 'TODO CORRECTO' END AS "Resultado"
FROM resultado_prueba
UNION ALL
SELECT orden, pantalla, verificacion, esperado, obtenido, estado FROM resultado_prueba
ORDER BY 1;
