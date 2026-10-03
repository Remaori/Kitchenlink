-- =====================================================================
--  KitchenLink · Base de datos v3 (con las observaciones de la revisión)
--  Motor:      PostgreSQL 16
--  Proyecto:   Sistema de gestión de restaurante
--  Fase:       Elaboración · Diseño físico (tablas y relaciones)
--  Autores:    Luis Antonio Sáenz Jiménez · Diego Jerónimo Benítez
--  Fecha:      Octubre 2026
-- =====================================================================
--  CÓMO USARLO
--    Lo normal: `npm run db:instalar` (ejecuta 01 a 04 en orden).
--    A mano en pgAdmin: Query Tool sobre la base "kitchenlink", ejecuta
--    este archivo completo (F5; borra y vuelve a crear el esquema), luego
--    02_permisos_app.sql, 03_prueba_coherencia_v3.sql y
--    04_contrasenas_demo.sql. Ver database/README.md.
--
--  QUÉ CAMBIÓ RESPECTO A LA v2 (observaciones de la revisión)
--    · Sin factura: se quitaron la tabla y su estado. El ticket es el
--      comprobante de la venta.
--    · El ticket ya no se guarda. El pre-ticket y el ticket se generan
--      con consultas (v_ticket, v_ticket_lineas, v_ticket_pagos) a partir
--      de la comanda y sus pagos. Los pagos se registran contra la
--      comanda: "Dividir cuenta" = varios pagos. Cuando los pagos cubren
--      el total, la comanda se cierra sola y la mesa queda libre.
--    · Los reportes y los totales del corte de caja se calculan con
--      vistas; no se guardan. Del corte solo se guarda lo que captura la
--      cajera: fondo inicial y efectivo contado.
--    · El destino (cocina o barra) ahora es de la categoría: Bebidas y
--      Bar van a barra; lo demás, a cocina. Producto ya no tiene destino.
--    · Sin modificadores: término, guarnición y peticiones especiales van
--      en la nota del producto. Un extra con costo se da de alta como
--      producto. (Se quitaron 4 tablas.)
--    · Sin columnas genéricas creado_en / actualizado_en. Se conservan
--      las fechas que usa el negocio (abierta_en, enviado_en, listo_en,
--      registrado_en…), porque de ellas salen tiempos y reportes.
--
--  NOTAS DE DISEÑO
--    · Dinero en NUMERIC(10,2), nunca FLOAT.
--    · El nombre y el precio del producto se congelan en la línea, y la
--      tasa de IVA en la comanda al pedir la cuenta: así un ticket
--      reimpreso sale igual aunque después cambie el menú o el IVA.
--    · Las cancelaciones se registran, nunca se borran.
--    · Un corte de caja cerrado es inmutable: sus pagos ya no cambian.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. LIMPIEZA (solo para desarrollo: quitar antes de producción)
-- ---------------------------------------------------------------------
DROP SCHEMA IF EXISTS kitchenlink CASCADE;
CREATE SCHEMA kitchenlink;
SET search_path TO kitchenlink, public;


-- ---------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS · cada valor es un estado que aparece en pantalla
--    (el texto exacto de pantalla está en la tabla etiqueta_estado)
-- ---------------------------------------------------------------------
CREATE TYPE estado_usuario     AS ENUM ('pendiente','activo','dado_de_baja');
CREATE TYPE estado_mesa        AS ENUM ('libre','reservada','por_atender','comanda_abierta','por_cobrar','bloqueada');
CREATE TYPE destino_produccion AS ENUM ('cocina','barra');
CREATE TYPE estado_reservacion AS ENUM ('por_confirmar','confirmada','sentada','no_se_presento','cancelada');
CREATE TYPE estado_espera      AS ENUM ('en_espera','sentada','retirada');
CREATE TYPE estado_comanda     AS ENUM ('abierta','por_cobrar','cerrada','cancelada');
CREATE TYPE estado_linea       AS ENUM ('sin_enviar','por_preparar','en_preparacion','listo','entregado','cancelado');
CREATE TYPE metodo_pago        AS ENUM ('efectivo','tarjeta','transferencia');
CREATE TYPE estado_corte       AS ENUM ('abierto','cerrado');
CREATE TYPE tipo_cancelacion   AS ENUM ('producto','comanda');


-- ---------------------------------------------------------------------
-- 2. FUNCIONES BASE
-- ---------------------------------------------------------------------
-- Reloj del sistema. En operación normal es now(). Las pruebas pueden
-- fijar la hora (SET kitchenlink.ahora = '2026-09-22 19:09-06') para que
-- la base muestre exactamente el momento que dibujan las pantallas.
CREATE FUNCTION fn_ahora() RETURNS timestamptz
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('kitchenlink.ahora', true), '')::timestamptz, now())
$$;

-- Usuario que opera la petición actual (el backend hace SET LOCAL
-- kitchenlink.usuario_id = … en cada transacción). Se usa en la bitácora.
CREATE FUNCTION fn_usuario_actual() RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('kitchenlink.usuario_id', true), '')::bigint
$$;


-- =====================================================================
--  MÓDULO 1 · SEGURIDAD            Pantallas 01, 01b, 02a, 02b, 02c
-- =====================================================================

CREATE TABLE rol (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(50)  NOT NULL UNIQUE,
    descripcion     VARCHAR(200),
    es_sistema      BOOLEAN      NOT NULL DEFAULT FALSE,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE  rol            IS '02c · Roles. Tabla (no ENUM) porque "Nuevo rol" y "Dar de baja rol" son acciones de la pantalla.';
COMMENT ON COLUMN rol.es_sistema IS '02c · Candado "Sistema". El rol Gerente no se puede eliminar ni quitarle permisos.';
COMMENT ON COLUMN rol.activo     IS '02c · FALSE = rol dado de baja. No se permite mientras tenga usuarios Pendientes o Activos.';

CREATE TABLE permiso (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clave           VARCHAR(60)  NOT NULL UNIQUE,
    nombre          VARCHAR(100) NOT NULL,
    modulo          VARCHAR(40)  NOT NULL,
    orden           SMALLINT     NOT NULL DEFAULT 0,
    descripcion     VARCHAR(200)
);
COMMENT ON TABLE  permiso        IS '02c · Casillas de "Permisos por módulo". nombre y modulo son el texto de la pantalla.';
COMMENT ON COLUMN permiso.clave  IS 'Identificador que valida el backend y la base (ej. ticket.pre_ticket).';

CREATE TABLE rol_permiso (
    rol_id          BIGINT NOT NULL REFERENCES rol(id)     ON DELETE CASCADE,
    permiso_id      BIGINT NOT NULL REFERENCES permiso(id) ON DELETE CASCADE,
    PRIMARY KEY (rol_id, permiso_id)
);
COMMENT ON TABLE rol_permiso IS '02c · Casilla marcada = fila en esta tabla. "3 de 17 permisos activos" = COUNT por rol.';

CREATE TABLE usuario (
    id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rol_id                     BIGINT         NOT NULL REFERENCES rol(id) ON DELETE RESTRICT,
    nombre_completo            VARCHAR(120)   NOT NULL,
    nombre_usuario             VARCHAR(40)    NOT NULL UNIQUE,
    telefono                   VARCHAR(20),
    correo                     VARCHAR(120)   UNIQUE,
    contrasena_hash            VARCHAR(255)   NOT NULL,
    requiere_cambio_pw         BOOLEAN        NOT NULL DEFAULT TRUE,
    contrasena_actualizada_en  TIMESTAMPTZ,
    estado                     estado_usuario NOT NULL DEFAULT 'pendiente',
    dado_de_baja_en            TIMESTAMPTZ,
    ultimo_acceso              TIMESTAMPTZ,
    CONSTRAINT ck_usuario_pendiente CHECK (estado <> 'pendiente' OR requiere_cambio_pw),
    CONSTRAINT ck_usuario_baja      CHECK ((estado = 'dado_de_baja') = (dado_de_baja_en IS NOT NULL))
);
COMMENT ON COLUMN usuario.estado             IS '02a · Pendiente (creado con contraseña temporal, nunca ha entrado) > Activo (ya cambió su contraseña) > Dado de baja. "En línea" NO es un estado: se calcula con la tabla sesion.';
COMMENT ON COLUMN usuario.requiere_cambio_pw IS '01b · TRUE = la próxima vez que entre debe crear su contraseña. Es TRUE en Pendiente y cuando el gerente la restablece.';
COMMENT ON COLUMN usuario.contrasena_hash    IS 'Hash bcrypt. Nunca la contraseña en claro. No hay recuperación por correo: la restablece el gerente.';
COMMENT ON COLUMN usuario.ultimo_acceso      IS '02a · Columna "Último acceso". Se actualiza sola al abrir una sesión.';

CREATE TABLE sesion (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id      BIGINT       NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    direccion_ip    VARCHAR(45),
    dispositivo     VARCHAR(120),
    emitida_en      TIMESTAMPTZ  NOT NULL DEFAULT fn_ahora(),
    expira_en       TIMESTAMPTZ  NOT NULL,
    cerrada_en      TIMESTAMPTZ,
    CONSTRAINT ck_sesion_vigencia CHECK (expira_en > emitida_en)
);
COMMENT ON TABLE sesion IS '02a · Indicador "En línea" (sesión abierta y no vencida). Al dar de baja a un usuario sus sesiones se cierran.';


-- =====================================================================
--  MÓDULO 2 · SALÓN                Pantallas 04, 05a
-- =====================================================================

CREATE TABLE mesa (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero                    VARCHAR(10)  NOT NULL UNIQUE,
    capacidad                 SMALLINT     NOT NULL,
    zona                      VARCHAR(60),
    estado                    estado_mesa  NOT NULL DEFAULT 'libre',
    libre_desde               TIMESTAMPTZ  DEFAULT fn_ahora(),
    motivo_bloqueo            VARCHAR(160),
    bloqueada_por_usuario_id  BIGINT       REFERENCES usuario(id) ON DELETE SET NULL,
    bloqueada_en              TIMESTAMPTZ,
    activo                    BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_mesa_capacidad   CHECK (capacidad BETWEEN 1 AND 30),
    CONSTRAINT ck_mesa_bloqueo     CHECK ((estado = 'bloqueada') = (motivo_bloqueo IS NOT NULL)),
    CONSTRAINT ck_mesa_libre_desde CHECK ((estado = 'libre') = (libre_desde IS NOT NULL))
);
COMMENT ON COLUMN mesa.estado      IS '04, 05a · Libre, Reservada, Por atender, Comanda abierta, Por cobrar, Bloqueada. Solo "Bloqueada" se pone a mano; el resto lo mueven los triggers de comanda y reservación, y la base rechaza un estado que no esté respaldado.';
COMMENT ON COLUMN mesa.libre_desde IS '05a · "Libre desde las 18:40". Solo tiene valor cuando la mesa está libre.';


-- =====================================================================
--  MÓDULO 3 · MENÚ                 Pantallas 05b, 09
-- =====================================================================

CREATE TABLE categoria (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(60)        NOT NULL UNIQUE,
    descripcion     VARCHAR(200),
    destino         destino_produccion NOT NULL DEFAULT 'cocina',
    orden           SMALLINT           NOT NULL DEFAULT 0,
    activo          BOOLEAN            NOT NULL DEFAULT TRUE
);
COMMENT ON COLUMN categoria.destino IS '06, 09 · Dónde se preparan los productos de la categoría (Bebidas y Bar: barra; las demás: cocina). Decide en qué panel aparece cada producto.';
COMMENT ON COLUMN categoria.orden   IS '05b · Orden de los chips de categoría (Entradas, Platos fuertes, Bebidas, Postres, Bar).';

CREATE TABLE producto (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    categoria_id            BIGINT        NOT NULL REFERENCES categoria(id) ON DELETE RESTRICT,
    nombre                  VARCHAR(120)  NOT NULL,
    descripcion             VARCHAR(250),
    precio                  NUMERIC(10,2) NOT NULL,
    disponible              BOOLEAN       NOT NULL DEFAULT TRUE,
    motivo_no_disponible    VARCHAR(160),
    activo                  BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_producto_precio CHECK (precio >= 0),
    CONSTRAINT uq_producto_nombre_categoria UNIQUE (categoria_id, nombre)
);
COMMENT ON TABLE  producto            IS '09 · Lo que se vende. Un extra con costo (ej. extra de aguacate) se da de alta como producto; término, guarnición y peticiones especiales van en la nota de la línea.';
COMMENT ON COLUMN producto.disponible IS '05b · FALSE = "86 · agotado". Sigue en el menú pero no se puede capturar.';


-- =====================================================================
--  MÓDULO 4 · RECEPCIÓN            Pantallas 03a, 03b
--  Reservación y lista de espera son tablas distintas: una aparta una
--  mesa para una hora futura; la otra ordena a quien ya llegó.
-- =====================================================================

CREATE TABLE reservacion (
    id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_cliente             VARCHAR(120)       NOT NULL,
    telefono                   VARCHAR(20),
    numero_personas            SMALLINT           NOT NULL,
    fecha_hora                 TIMESTAMPTZ        NOT NULL,
    mesa_id                    BIGINT             NOT NULL REFERENCES mesa(id) ON DELETE RESTRICT,
    solicitudes_especiales     VARCHAR(300),
    estado                     estado_reservacion NOT NULL DEFAULT 'por_confirmar',
    apartado_desde             TIMESTAMPTZ        NOT NULL,
    apartado_hasta             TIMESTAMPTZ        NOT NULL,
    tolerancia_hasta           TIMESTAMPTZ        NOT NULL,
    confirmada_en              TIMESTAMPTZ,
    sentada_en                 TIMESTAMPTZ,
    finalizada_en              TIMESTAMPTZ,
    registrada_por_usuario_id  BIGINT             NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    CONSTRAINT ck_reservacion_personas CHECK (numero_personas BETWEEN 1 AND 30),
    CONSTRAINT ck_reservacion_ventana  CHECK (apartado_desde <= fecha_hora AND fecha_hora < tolerancia_hasta AND tolerancia_hasta <= apartado_hasta),
    CONSTRAINT ck_reservacion_sentada  CHECK (estado <> 'sentada' OR sentada_en IS NOT NULL)
);
COMMENT ON COLUMN reservacion.estado           IS '03a · Por confirmar > Confirmada > Sentada, o No se presentó / Cancelada. "En tolerancia" no se guarda: se calcula (v_reservaciones) porque cambia sola con el reloj.';
COMMENT ON COLUMN reservacion.apartado_desde   IS '03a · "La mesa se aparta 30 min antes". Se calcula al registrar con la configuración vigente.';
COMMENT ON COLUMN reservacion.apartado_hasta   IS '03a · "Duración de la reservación: 2 h" > "ocupada hasta 20:30".';
COMMENT ON COLUMN reservacion.tolerancia_hasta IS '03a · "Tolerancia de llegada: 15 min" > "se libera a las 19:15". Después pasa sola a No se presentó.';

CREATE TABLE lista_espera (
    id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_cliente             VARCHAR(120)  NOT NULL,
    telefono                   VARCHAR(20),
    numero_personas            SMALLINT      NOT NULL,
    llegada_en                 TIMESTAMPTZ   NOT NULL DEFAULT fn_ahora(),
    espera_estimada_min        SMALLINT,
    nota                       VARCHAR(160),
    estado                     estado_espera NOT NULL DEFAULT 'en_espera',
    mesa_id                    BIGINT        REFERENCES mesa(id) ON DELETE SET NULL,
    sentada_en                 TIMESTAMPTZ,
    retirada_en                TIMESTAMPTZ,
    reservacion_origen_id      BIGINT        REFERENCES reservacion(id) ON DELETE SET NULL,
    registrada_por_usuario_id  BIGINT        NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    CONSTRAINT ck_espera_personas CHECK (numero_personas BETWEEN 1 AND 30),
    CONSTRAINT ck_espera_sentada  CHECK ((estado = 'sentada')  = (mesa_id IS NOT NULL AND sentada_en IS NOT NULL)),
    CONSTRAINT ck_espera_retirada CHECK ((estado = 'retirada') = (retirada_en IS NOT NULL))
);
COMMENT ON COLUMN lista_espera.llegada_en            IS '03b · "Esperando 15 min" = ahora - llegada_en. La posición es el orden de llegada.';
COMMENT ON COLUMN lista_espera.telefono              IS '03b · Opcional ("sin teléfono").';
COMMENT ON COLUMN lista_espera.reservacion_origen_id IS '12 · Cliente con reservación que llegó fuera de la tolerancia y entró a la lista de espera.';


-- =====================================================================
--  MÓDULO 5 · COMANDAS, COCINA Y BARRA     Pantallas 05a, 05b, 06
-- =====================================================================

CREATE TABLE comanda (
    id                            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folio                         VARCHAR(20)    NOT NULL UNIQUE,
    mesa_id                       BIGINT         NOT NULL REFERENCES mesa(id)         ON DELETE RESTRICT,
    mesero_usuario_id             BIGINT         NOT NULL REFERENCES usuario(id)      ON DELETE RESTRICT,
    reservacion_id                BIGINT         REFERENCES reservacion(id)           ON DELETE SET NULL,
    lista_espera_id               BIGINT         REFERENCES lista_espera(id)          ON DELETE SET NULL,
    numero_personas               SMALLINT       NOT NULL,
    estado                        estado_comanda NOT NULL DEFAULT 'abierta',
    nota_general                  VARCHAR(300),
    abierta_en                    TIMESTAMPTZ    NOT NULL DEFAULT fn_ahora(),
    cuenta_pedida_en              TIMESTAMPTZ,
    cuenta_pedida_por_usuario_id  BIGINT         REFERENCES usuario(id)               ON DELETE RESTRICT,
    tasa_impuesto                 NUMERIC(5,4),
    cerrada_en                    TIMESTAMPTZ,
    cerrada_por_usuario_id        BIGINT         REFERENCES usuario(id)               ON DELETE RESTRICT,
    cancelada_en                  TIMESTAMPTZ,
    CONSTRAINT ck_comanda_personas CHECK (numero_personas BETWEEN 1 AND 30),
    CONSTRAINT ck_comanda_origen   CHECK (reservacion_id IS NULL OR lista_espera_id IS NULL),
    CONSTRAINT ck_comanda_cuenta   CHECK (estado NOT IN ('por_cobrar','cerrada') OR (cuenta_pedida_en IS NOT NULL AND tasa_impuesto IS NOT NULL)),
    CONSTRAINT ck_comanda_cierre   CHECK (estado <> 'cerrada' OR (cerrada_en IS NOT NULL AND cerrada_por_usuario_id IS NOT NULL)),
    CONSTRAINT ck_comanda_fechas   CHECK (cerrada_en IS NULL OR cerrada_en >= abierta_en)
);
COMMENT ON TABLE  comanda                   IS '05b, 07 · La cuenta de una mesa. El pre-ticket y el ticket NO se guardan: se generan de la comanda, sus productos y sus pagos (v_ticket).';
COMMENT ON COLUMN comanda.estado            IS '05b · Abierta (se puede seguir agregando) > Por cobrar (el mesero pidió la cuenta; caja imprime el pre-ticket) > Cerrada (se cierra sola cuando los pagos cubren el total). Una comanda cerrada no se reabre.';
COMMENT ON COLUMN comanda.mesero_usuario_id IS '05a · Quien abre la comanda queda como su mesero y solo él la trabaja (agregar, quitar, enviar, pedir la cuenta, cambiar mesa). Él o el gerente la transfieren (queda en bitácora). Entregar sí lo puede marcar cualquier mesero.';
COMMENT ON COLUMN comanda.nota_general      IS '05b, 06 · Nota de mesa (ej. alergia). Se muestra en rojo en la comanda y en cada tarjeta de cocina.';
COMMENT ON COLUMN comanda.reservacion_id    IS '05a · "Reservación vinculada". Se llena sola si la hostess sentó al grupo desde una reservación.';
COMMENT ON COLUMN comanda.lista_espera_id   IS '05a · Se llena sola si la hostess sentó al grupo desde la lista de espera.';
COMMENT ON COLUMN comanda.tasa_impuesto     IS '07 · SNAPSHOT del IVA al pedir la cuenta. El pre-ticket y el ticket se calculan con esta tasa: un ticket reimpreso sale igual aunque cambie la configuración.';

-- 05a, 12 · "Una comanda abierta por mesa": a la vez solo una Abierta o Por cobrar.
CREATE UNIQUE INDEX uq_comanda_mesa_activa ON comanda (mesa_id) WHERE estado IN ('abierta','por_cobrar');

CREATE TABLE envio (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comanda_id              BIGINT      NOT NULL REFERENCES comanda(id) ON DELETE CASCADE,
    numero                  SMALLINT    NOT NULL,
    es_adicional            BOOLEAN     GENERATED ALWAYS AS (numero > 1) STORED,
    enviado_en              TIMESTAMPTZ NOT NULL DEFAULT fn_ahora(),
    enviado_por_usuario_id  BIGINT      NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    CONSTRAINT ck_envio_numero   CHECK (numero >= 1),
    CONSTRAINT uq_envio_numero   UNIQUE (comanda_id, numero),
    CONSTRAINT uq_envio_comanda  UNIQUE (id, comanda_id)
);
COMMENT ON TABLE  envio              IS '05b, 06 · Cada vez que el mesero presiona Enviar se crea un envío. Cada tarjeta del panel de cocina es un envío (por destino).';
COMMENT ON COLUMN envio.numero       IS '05b · "Envío 1 · 18:52", "Envío 2 · 19:05". Se numera solo dentro de la comanda.';
COMMENT ON COLUMN envio.es_adicional IS '06 · Etiqueta "Adicional" (todo envío después del primero).';

CREATE TABLE detalle_comanda (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comanda_id        BIGINT        NOT NULL REFERENCES comanda(id)  ON DELETE CASCADE,
    envio_id          BIGINT,
    producto_id       BIGINT        NOT NULL REFERENCES producto(id) ON DELETE RESTRICT,
    cantidad          SMALLINT      NOT NULL,
    nombre_producto   VARCHAR(120)  NOT NULL,
    precio_unitario   NUMERIC(10,2) NOT NULL,
    tiempo            SMALLINT      NOT NULL DEFAULT 1,
    nota              VARCHAR(250),
    estado            estado_linea  NOT NULL DEFAULT 'sin_enviar',
    capturado_en      TIMESTAMPTZ   NOT NULL DEFAULT fn_ahora(),
    preparacion_en    TIMESTAMPTZ,
    listo_en          TIMESTAMPTZ,
    entregado_en      TIMESTAMPTZ,
    cancelado_en      TIMESTAMPTZ,
    CONSTRAINT fk_detalle_envio     FOREIGN KEY (envio_id, comanda_id) REFERENCES envio (id, comanda_id),
    CONSTRAINT ck_detalle_cantidad  CHECK (cantidad > 0),
    CONSTRAINT ck_detalle_precio    CHECK (precio_unitario >= 0),
    CONSTRAINT ck_detalle_tiempo    CHECK (tiempo BETWEEN 1 AND 3),
    CONSTRAINT ck_detalle_envio     CHECK ((estado = 'sin_enviar') = (envio_id IS NULL))
);
COMMENT ON TABLE  detalle_comanda                 IS '05b · Cada producto de la comanda. El estado vive aquí porque cocina marca platillos, no comandas. Cocina o barra sale de la categoría del producto.';
COMMENT ON COLUMN detalle_comanda.estado          IS '05b, 06 · Sin enviar > Por preparar > En preparación > Listo > Entregado (o Cancelado).';
COMMENT ON COLUMN detalle_comanda.envio_id        IS '05b · NULL = sección "SIN ENVIAR". La FK compuesta garantiza que el envío sea de la misma comanda.';
COMMENT ON COLUMN detalle_comanda.tiempo          IS '05b · 1er, 2º o 3er tiempo: el orden en que cocina saca los platillos.';
COMMENT ON COLUMN detalle_comanda.nota            IS '05b, 06 · Botón "Nota": término, guarnición y peticiones especiales (ej. "término medio, papas a la francesa").';
COMMENT ON COLUMN detalle_comanda.precio_unitario IS 'SNAPSHOT del precio al capturar. Cambiar el menú no altera cuentas ni tickets (que se generan de aquí).';


-- =====================================================================
--  MÓDULO 6 · CAJA                 Pantallas 07, 08
-- =====================================================================

CREATE TABLE corte_caja (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folio                     VARCHAR(20)   NOT NULL UNIQUE,
    cajero_usuario_id         BIGINT        NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    turno                     VARCHAR(30),
    monto_apertura            NUMERIC(10,2) NOT NULL DEFAULT 0,
    abierto_en                TIMESTAMPTZ   NOT NULL DEFAULT fn_ahora(),
    efectivo_declarado        NUMERIC(10,2),
    observaciones             VARCHAR(300),
    estado                    estado_corte  NOT NULL DEFAULT 'abierto',
    cerrado_en                TIMESTAMPTZ,
    cerrado_por_usuario_id    BIGINT        REFERENCES usuario(id) ON DELETE SET NULL,
    CONSTRAINT ck_corte_apertura CHECK (monto_apertura >= 0),
    CONSTRAINT ck_corte_cierre   CHECK (cerrado_en IS NULL OR cerrado_en >= abierto_en),
    CONSTRAINT ck_corte_cerrado  CHECK (estado = 'abierto' OR (cerrado_en IS NOT NULL AND efectivo_declarado IS NOT NULL))
);
COMMENT ON TABLE  corte_caja                    IS '08 · Apertura de caja y corte Z. Solo guarda lo que captura la cajera (fondo inicial y efectivo contado); los totales por método y la diferencia los calcula la vista v_cortes_caja. Un corte cerrado es inmutable.';
COMMENT ON COLUMN corte_caja.efectivo_declarado IS '08 · Lo que la cajera cuenta en el cajón al hacer el corte Z.';

CREATE UNIQUE INDEX uq_corte_abierto_por_cajero ON corte_caja (cajero_usuario_id) WHERE estado = 'abierto';

CREATE TABLE pago (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comanda_id                BIGINT        NOT NULL REFERENCES comanda(id)    ON DELETE RESTRICT,
    corte_caja_id             BIGINT        NOT NULL REFERENCES corte_caja(id) ON DELETE RESTRICT,
    metodo                    metodo_pago   NOT NULL,
    monto                     NUMERIC(10,2) NOT NULL,
    monto_recibido            NUMERIC(10,2),
    referencia                VARCHAR(60),
    registrado_por_usuario_id BIGINT        NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    registrado_en             TIMESTAMPTZ   NOT NULL DEFAULT fn_ahora(),
    CONSTRAINT ck_pago_monto    CHECK (monto > 0),
    CONSTRAINT ck_pago_efectivo CHECK ((metodo = 'efectivo') = (monto_recibido IS NOT NULL) AND (monto_recibido IS NULL OR monto_recibido >= monto))
);
COMMENT ON TABLE  pago                IS '07 · Cada cobro a una comanda. Varios pagos = dividir cuenta o pago mixto. Al cubrir el total la comanda se cierra sola. Los pagos no se modifican ni se borran.';
COMMENT ON COLUMN pago.monto_recibido IS '07 · Solo en efectivo ("Monto recibido"). El cambio no se guarda: es monto_recibido - monto.';
COMMENT ON COLUMN pago.referencia     IS 'Autorización de la terminal bancaria (se captura a mano).';
COMMENT ON COLUMN pago.corte_caja_id  IS '08 · Corte abierto de quien cobra. Si no se indica, la base usa el corte abierto de la cajera.';


-- =====================================================================
--  MÓDULO 7 · CANCELACIONES Y BITÁCORA     Pantallas 05b, 10, 12
-- =====================================================================

CREATE TABLE cancelacion (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo                      tipo_cancelacion NOT NULL,
    comanda_id                BIGINT        NOT NULL REFERENCES comanda(id)         ON DELETE RESTRICT,
    detalle_comanda_id        BIGINT        REFERENCES detalle_comanda(id)          ON DELETE RESTRICT,
    motivo                    VARCHAR(250)  NOT NULL,
    monto                     NUMERIC(10,2) NOT NULL DEFAULT 0,
    solicitado_por_usuario_id BIGINT        NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    autorizado_por_usuario_id BIGINT        NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    registrada_en             TIMESTAMPTZ   NOT NULL DEFAULT fn_ahora(),
    CONSTRAINT ck_cancelacion_referencia CHECK ((tipo = 'producto') = (detalle_comanda_id IS NOT NULL))
);
COMMENT ON TABLE  cancelacion IS '05b, 10 · Registrar la cancelación ES cancelar: al insertar la fila, el trigger cancela el producto o la comanda. Sin fila aquí, la base no deja cancelar.';
COMMENT ON COLUMN cancelacion.autorizado_por_usuario_id IS '05b · "Requiere autorización del gerente".';
COMMENT ON COLUMN cancelacion.registrada_en IS '10 · Hora de la cancelación en el reporte.';

CREATE TABLE bitacora (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id     BIGINT      REFERENCES usuario(id) ON DELETE SET NULL,
    entidad        VARCHAR(40) NOT NULL,
    entidad_id     BIGINT,
    accion         VARCHAR(60) NOT NULL,
    detalle        JSONB,
    registrado_en  TIMESTAMPTZ NOT NULL DEFAULT fn_ahora()
);
COMMENT ON TABLE bitacora IS '12 · "Todo queda registrado": altas, bajas y restablecimientos de contraseña, transferencias de comanda, cambios de mesa, pre-tickets cancelados, bloqueos y 86. La llenan los triggers.';


-- =====================================================================
--  MÓDULO 8 · CONFIGURACIÓN Y ETIQUETAS
-- =====================================================================

CREATE TABLE configuracion (
    clave          VARCHAR(60)  PRIMARY KEY,
    valor          VARCHAR(250) NOT NULL,
    descripcion    VARCHAR(200)
);
COMMENT ON TABLE configuracion IS 'Parámetros que el gerente ajusta: IVA, propina sugerida, tolerancia (15 min), duración (2 h) y apartado previo (30 min) de reservaciones, datos del ticket.';

CREATE TABLE etiqueta_estado (
    dominio     VARCHAR(40) NOT NULL,
    valor       VARCHAR(40) NOT NULL,
    etiqueta    VARCHAR(60) NOT NULL,
    tono        VARCHAR(10) NOT NULL,
    orden       SMALLINT    NOT NULL DEFAULT 0,
    calculado   BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (dominio, valor),
    CONSTRAINT ck_etiqueta_tono CHECK (tono IN ('ok','warn','bad','info','purple','gray'))
);
COMMENT ON TABLE  etiqueta_estado          IS 'Puente BD <> pantallas: cada valor de un ENUM con el texto y el color del badge que muestra el diseño. El frontend lo lee para que ambos digan lo mismo.';
COMMENT ON COLUMN etiqueta_estado.dominio  IS 'Nombre del tipo ENUM (estado_mesa, estado_linea, …).';
COMMENT ON COLUMN etiqueta_estado.tono     IS 'Color del badge en Figma: ok verde, warn ámbar, bad rojo, info azul, purple morado, gray gris.';
COMMENT ON COLUMN etiqueta_estado.calculado IS 'TRUE si el estado no se guarda en la base sino que se calcula (ej. "En tolerancia").';


-- ---------------------------------------------------------------------
-- 9. FUNCIONES DE APOYO (dependen de las tablas)
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_config_num(p_clave text, p_defecto numeric) RETURNS numeric
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT COALESCE((SELECT valor::numeric FROM configuracion WHERE clave = p_clave), p_defecto)
$$;

CREATE FUNCTION fn_config_txt(p_clave text) RETURNS text
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT valor FROM configuracion WHERE clave = p_clave
$$;

CREATE FUNCTION fn_etiqueta(p_dominio text, p_valor text) RETURNS text
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT COALESCE((SELECT etiqueta FROM etiqueta_estado WHERE dominio = p_dominio AND valor = p_valor), p_valor)
$$;

-- Importe de una línea: cantidad × precio congelado
CREATE FUNCTION fn_importe_linea(p_detalle bigint) RETURNS numeric
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT (d.cantidad * d.precio_unitario)::numeric(10,2) FROM detalle_comanda d WHERE d.id = p_detalle
$$;

-- Subtotal de la comanda (sin cancelados). p_solo_enviado = sin la sección "Sin enviar".
CREATE FUNCTION fn_subtotal_comanda(p_comanda bigint, p_solo_enviado boolean DEFAULT false) RETURNS numeric
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT COALESCE(SUM(fn_importe_linea(d.id)), 0)::numeric(10,2)
    FROM detalle_comanda d
    WHERE d.comanda_id = p_comanda
      AND d.estado <> 'cancelado'
      AND (NOT p_solo_enviado OR d.estado <> 'sin_enviar')
$$;

-- IVA de la comanda: la tasa que se congeló al pedir la cuenta; si sigue abierta, la vigente
CREATE FUNCTION fn_tasa_comanda(p_comanda bigint) RETURNS numeric
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT COALESCE((SELECT tasa_impuesto FROM comanda WHERE id = p_comanda), fn_config_num('impuesto.tasa', 0.16))
$$;

CREATE FUNCTION fn_iva_comanda(p_comanda bigint) RETURNS numeric
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT ROUND(fn_subtotal_comanda(p_comanda) * fn_tasa_comanda(p_comanda), 2)
$$;

-- "Total a cobrar" (07): subtotal + IVA. La propina sugerida no se suma.
CREATE FUNCTION fn_total_comanda(p_comanda bigint) RETURNS numeric
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT fn_subtotal_comanda(p_comanda) + fn_iva_comanda(p_comanda)
$$;

CREATE FUNCTION fn_pagado_comanda(p_comanda bigint) RETURNS numeric
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT COALESCE(SUM(monto), 0)::numeric(10,2) FROM pago WHERE comanda_id = p_comanda
$$;

-- ¿El usuario tiene este permiso? (activo, con rol activo y la casilla marcada en 02c)
CREATE FUNCTION fn_tiene_permiso(p_usuario bigint, p_clave text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = kitchenlink, public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM usuario u
        JOIN rol r          ON r.id = u.rol_id AND r.activo
        JOIN rol_permiso rp ON rp.rol_id = r.id
        JOIN permiso p      ON p.id = rp.permiso_id
        WHERE u.id = p_usuario AND u.estado = 'activo' AND p.clave = p_clave)
$$;

CREATE FUNCTION fn_exigir_permiso(p_usuario bigint, p_clave text, p_accion text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = kitchenlink, public AS $$
DECLARE
    v_nombre text; v_rol text; v_estado estado_usuario; v_permiso text;
BEGIN
    IF fn_tiene_permiso(p_usuario, p_clave) THEN RETURN; END IF;
    SELECT u.nombre_completo, r.nombre, u.estado INTO v_nombre, v_rol, v_estado
    FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.id = p_usuario;
    SELECT nombre || ' (' || modulo || ')' INTO v_permiso FROM permiso WHERE clave = p_clave;
    IF v_nombre IS NULL THEN
        RAISE EXCEPTION 'Falta indicar quién realiza la acción: %.', p_accion USING ERRCODE = 'insufficient_privilege';
    ELSIF v_estado <> 'activo' THEN
        RAISE EXCEPTION '% está %: no puede %.', v_nombre, fn_etiqueta('estado_usuario', v_estado::text), p_accion
              USING ERRCODE = 'insufficient_privilege';
    ELSE
        RAISE EXCEPTION '% (%) no tiene permiso para %.', v_nombre, v_rol, p_accion
              USING ERRCODE = 'insufficient_privilege', DETAIL = 'Permiso requerido: ' || COALESCE(v_permiso, p_clave);
    END IF;
END $$;

-- 05a · "Quien abre la comanda queda como su mesero": solo él la trabaja
-- (agregar, quitar, enviar, pedir la cuenta, cambiar mesa). El gerente
-- también puede: lo identifica el permiso «Cancelar productos o comandas».
-- Para que otro mesero la tome, él o el gerente se la transfieren.
CREATE FUNCTION fn_exigir_mesero_de(p_comanda bigint, p_usuario bigint, p_accion text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = kitchenlink, public AS $$
DECLARE
    v_mesero bigint; v_mesa text; v_nombre_mesero text; v_nombre text;
BEGIN
    SELECT c.mesero_usuario_id, m.numero, u.nombre_completo INTO v_mesero, v_mesa, v_nombre_mesero
    FROM comanda c JOIN mesa m ON m.id = c.mesa_id JOIN usuario u ON u.id = c.mesero_usuario_id
    WHERE c.id = p_comanda;
    IF p_usuario = v_mesero OR fn_tiene_permiso(p_usuario, 'comanda.cancelar') THEN
        RETURN;
    END IF;
    SELECT nombre_completo INTO v_nombre FROM usuario WHERE id = p_usuario;
    IF v_nombre IS NULL THEN
        RAISE EXCEPTION 'Falta indicar quién realiza la acción: %.', p_accion USING ERRCODE = 'insufficient_privilege';
    END IF;
    RAISE EXCEPTION '% no atiende la mesa % (es de %): no puede %. Para tomarla, % se la transfiere o lo hace el gerente.',
          v_nombre, v_mesa, v_nombre_mesero, p_accion, v_nombre_mesero USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE FUNCTION fn_bitacora(p_entidad text, p_id bigint, p_accion text, p_detalle jsonb DEFAULT NULL) RETURNS void
LANGUAGE sql SET search_path = kitchenlink, public AS $$
    INSERT INTO bitacora (usuario_id, entidad, entidad_id, accion, detalle)
    VALUES (fn_usuario_actual(), p_entidad, p_id, p_accion, p_detalle)
$$;

-- 03b, 12 · "Cuando se libera una mesa, primero se revisa si tiene una
-- reservación próxima": queda Reservada si hay una confirmada en su
-- ventana de apartado; si no, queda Libre.
CREATE FUNCTION fn_liberar_mesa(p_mesa bigint, p_desde timestamptz DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM reservacion r
               WHERE r.mesa_id = p_mesa AND r.estado = 'confirmada'
                 AND r.apartado_desde <= fn_ahora() AND fn_ahora() <= r.tolerancia_hasta) THEN
        UPDATE mesa SET estado = 'reservada' WHERE id = p_mesa;
    ELSE
        UPDATE mesa SET estado = 'libre', libre_desde = COALESCE(p_desde, fn_ahora()) WHERE id = p_mesa;
    END IF;
END $$;


-- =====================================================================
-- 10. REGLAS DE NEGOCIO (triggers)
--     Cada regla corresponde a un texto escrito en las pantallas.
-- =====================================================================

-- ---------- 02c · Roles ----------------------------------------------
CREATE FUNCTION tg_rol_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.es_sistema THEN
            RAISE EXCEPTION 'El rol % es del sistema: no se puede eliminar.', OLD.nombre;
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.es_sistema AND (NOT NEW.activo OR NOT NEW.es_sistema) THEN
        RAISE EXCEPTION 'El rol % es del sistema: no se puede dar de baja, para que siempre haya alguien que administre.', OLD.nombre;
    END IF;
    IF OLD.activo AND NOT NEW.activo
       AND EXISTS (SELECT 1 FROM usuario WHERE rol_id = OLD.id AND estado <> 'dado_de_baja') THEN
        RAISE EXCEPTION 'No se puede dar de baja este rol mientras tenga usuarios asignados.';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_rol_reglas BEFORE UPDATE OR DELETE ON rol
    FOR EACH ROW EXECUTE FUNCTION tg_rol_reglas();

CREATE FUNCTION tg_rol_permiso_proteger() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF (SELECT es_sistema FROM rol WHERE id = OLD.rol_id) THEN
        RAISE EXCEPTION 'El rol % es del sistema: no se le pueden quitar permisos.', (SELECT nombre FROM rol WHERE id = OLD.rol_id);
    END IF;
    RETURN OLD;
END $$;
CREATE TRIGGER tg_rol_permiso_proteger BEFORE UPDATE OR DELETE ON rol_permiso
    FOR EACH ROW EXECUTE FUNCTION tg_rol_permiso_proteger();

-- Un permiso nuevo se asigna solo al rol de sistema (Gerente conserva todo).
CREATE FUNCTION tg_permiso_nuevo() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    INSERT INTO rol_permiso (rol_id, permiso_id) SELECT id, NEW.id FROM rol WHERE es_sistema;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_permiso_nuevo AFTER INSERT ON permiso
    FOR EACH ROW EXECUTE FUNCTION tg_permiso_nuevo();

-- ---------- 02a, 01b, 12 · Usuarios ----------------------------------
CREATE FUNCTION tg_usuario_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF NEW.estado <> 'dado_de_baja' AND NOT (SELECT activo FROM rol WHERE id = NEW.rol_id) THEN
        RAISE EXCEPTION 'El rol asignado está dado de baja.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.estado <> 'pendiente' OR NOT NEW.requiere_cambio_pw THEN
            RAISE EXCEPTION 'Un usuario nuevo empieza Pendiente, con contraseña temporal que cambia en su primer inicio de sesión.';
        END IF;
        NEW.contrasena_actualizada_en := fn_ahora();
        RETURN NEW;
    END IF;

    -- Dejar la contraseña temporal = crear una contraseña nueva
    IF OLD.requiere_cambio_pw AND NOT NEW.requiere_cambio_pw
       AND NEW.contrasena_hash IS NOT DISTINCT FROM OLD.contrasena_hash THEN
        RAISE EXCEPTION 'Para dejar la contraseña temporal, el usuario crea una contraseña nueva.';
    END IF;
    -- Primer inicio de sesión: cambió su contraseña temporal > Activo
    IF OLD.estado = 'pendiente' AND NEW.estado = 'pendiente'
       AND OLD.requiere_cambio_pw AND NOT NEW.requiere_cambio_pw THEN
        NEW.estado := 'activo';
    END IF;
    IF OLD.estado = 'pendiente' AND NEW.estado = 'activo' AND NEW.requiere_cambio_pw THEN
        RAISE EXCEPTION 'Un usuario Pendiente pasa a Activo solo cuando crea su propia contraseña en su primer inicio de sesión.';
    END IF;
    IF NEW.contrasena_hash IS DISTINCT FROM OLD.contrasena_hash THEN
        NEW.contrasena_actualizada_en := fn_ahora();
    END IF;
    IF NEW.estado = 'dado_de_baja' AND OLD.estado <> 'dado_de_baja' THEN
        NEW.dado_de_baja_en := fn_ahora();
    ELSIF NEW.estado <> 'dado_de_baja' THEN
        NEW.dado_de_baja_en := NULL;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_usuario_reglas BEFORE INSERT OR UPDATE ON usuario
    FOR EACH ROW EXECUTE FUNCTION tg_usuario_reglas();

CREATE FUNCTION tg_usuario_despues() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM fn_bitacora('usuario', NEW.id, 'crear_usuario',
                jsonb_build_object('usuario', NEW.nombre_usuario, 'rol', (SELECT nombre FROM rol WHERE id = NEW.rol_id)));
        RETURN NEW;
    END IF;
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        PERFORM fn_bitacora('usuario', NEW.id, 'cambiar_estado', jsonb_build_object('de', OLD.estado, 'a', NEW.estado));
        IF NEW.estado = 'dado_de_baja' THEN
            UPDATE sesion SET cerrada_en = fn_ahora() WHERE usuario_id = NEW.id AND cerrada_en IS NULL;
        END IF;
    END IF;
    IF NEW.requiere_cambio_pw AND NOT OLD.requiere_cambio_pw THEN
        PERFORM fn_bitacora('usuario', NEW.id, 'restablecer_contrasena');
    ELSIF OLD.requiere_cambio_pw AND NOT NEW.requiere_cambio_pw THEN
        PERFORM fn_bitacora('usuario', NEW.id, 'cambiar_contrasena_temporal');
    END IF;
    IF NEW.rol_id <> OLD.rol_id THEN
        PERFORM fn_bitacora('usuario', NEW.id, 'cambiar_rol', jsonb_build_object('de', OLD.rol_id, 'a', NEW.rol_id));
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_usuario_despues AFTER INSERT OR UPDATE ON usuario
    FOR EACH ROW EXECUTE FUNCTION tg_usuario_despues();

CREATE FUNCTION tg_sesion_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF (SELECT estado FROM usuario WHERE id = NEW.usuario_id) = 'dado_de_baja' THEN
            RAISE EXCEPTION 'El usuario está dado de baja: ya no puede iniciar sesión.';
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_sesion_reglas BEFORE INSERT ON sesion
    FOR EACH ROW EXECUTE FUNCTION tg_sesion_reglas();

CREATE FUNCTION tg_sesion_ultimo_acceso() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    UPDATE usuario SET ultimo_acceso = NEW.emitida_en WHERE id = NEW.usuario_id;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_sesion_ultimo_acceso AFTER INSERT ON sesion
    FOR EACH ROW EXECUTE FUNCTION tg_sesion_ultimo_acceso();

-- ---------- 05a · Mesas ----------------------------------------------
-- El estado de la mesa lo mueven los triggers. Aquí se valida que
-- cualquier estado que se escriba esté respaldado por los datos.
CREATE FUNCTION tg_mesa_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_ok boolean := TRUE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.estado NOT IN ('libre','bloqueada') THEN
        RAISE EXCEPTION 'Una mesa nueva empieza Libre o Bloqueada.';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        CASE NEW.estado
            WHEN 'bloqueada' THEN
                IF OLD.estado <> 'libre' THEN
                    RAISE EXCEPTION 'Solo se puede bloquear una mesa libre (la mesa % está: %).',
                          OLD.numero, fn_etiqueta('estado_mesa', OLD.estado::text);
                END IF;
            WHEN 'libre' THEN
                v_ok := NOT EXISTS (SELECT 1 FROM comanda WHERE mesa_id = NEW.id AND estado IN ('abierta','por_cobrar'));
                -- 03b, 12 · Al liberarse, si tiene una reservación en su ventana queda Reservada
                IF v_ok AND EXISTS (SELECT 1 FROM reservacion WHERE mesa_id = NEW.id AND estado = 'confirmada'
                                    AND apartado_desde <= fn_ahora() AND fn_ahora() <= tolerancia_hasta) THEN
                    NEW.estado := 'reservada';
                END IF;
            WHEN 'reservada' THEN
                v_ok := EXISTS (SELECT 1 FROM reservacion WHERE mesa_id = NEW.id AND estado = 'confirmada'
                                AND apartado_desde <= fn_ahora() AND fn_ahora() <= tolerancia_hasta);
            WHEN 'por_atender' THEN
                v_ok := EXISTS (SELECT 1 FROM reservacion r WHERE r.mesa_id = NEW.id AND r.estado = 'sentada'
                                AND NOT EXISTS (SELECT 1 FROM comanda c WHERE c.reservacion_id = r.id))
                     OR EXISTS (SELECT 1 FROM lista_espera l WHERE l.mesa_id = NEW.id AND l.estado = 'sentada'
                                AND NOT EXISTS (SELECT 1 FROM comanda c WHERE c.lista_espera_id = l.id));
            WHEN 'comanda_abierta' THEN
                v_ok := EXISTS (SELECT 1 FROM comanda WHERE mesa_id = NEW.id AND estado = 'abierta');
            WHEN 'por_cobrar' THEN
                v_ok := EXISTS (SELECT 1 FROM comanda WHERE mesa_id = NEW.id AND estado = 'por_cobrar');
        END CASE;
        IF NOT v_ok THEN
            RAISE EXCEPTION 'La mesa % no puede quedar «%»: ese estado lo pone el sistema a partir de las comandas y reservaciones.',
                  NEW.numero, fn_etiqueta('estado_mesa', NEW.estado::text);
        END IF;
    END IF;

    -- Campos que dependen del estado
    IF NEW.estado = 'bloqueada' THEN
        IF TG_OP = 'INSERT' OR OLD.estado <> 'bloqueada' THEN
            IF NEW.motivo_bloqueo IS NULL THEN
                RAISE EXCEPTION 'Para bloquear la mesa % se escribe el motivo.', NEW.numero;
            END IF;
            NEW.bloqueada_en := fn_ahora();
            NEW.bloqueada_por_usuario_id := COALESCE(NEW.bloqueada_por_usuario_id, fn_usuario_actual());
            PERFORM fn_exigir_permiso(NEW.bloqueada_por_usuario_id, 'mesa.administrar', 'bloquear mesas');
        END IF;
    ELSE
        NEW.motivo_bloqueo := NULL; NEW.bloqueada_en := NULL; NEW.bloqueada_por_usuario_id := NULL;
    END IF;
    IF NEW.estado = 'libre' THEN
        NEW.libre_desde := COALESCE(NEW.libre_desde, fn_ahora());
    ELSE
        NEW.libre_desde := NULL;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_mesa_reglas BEFORE INSERT OR UPDATE ON mesa
    FOR EACH ROW EXECUTE FUNCTION tg_mesa_reglas();

CREATE FUNCTION tg_mesa_bitacora() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF NEW.estado = 'bloqueada' AND OLD.estado <> 'bloqueada' THEN
        PERFORM fn_bitacora('mesa', NEW.id, 'bloquear', jsonb_build_object('motivo', NEW.motivo_bloqueo));
    ELSIF OLD.estado = 'bloqueada' AND NEW.estado <> 'bloqueada' THEN
        PERFORM fn_bitacora('mesa', NEW.id, 'desbloquear');
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_mesa_bitacora AFTER UPDATE OF estado ON mesa
    FOR EACH ROW EXECUTE FUNCTION tg_mesa_bitacora();

-- ---------- 09 · Productos (86) ---------------------------------------
CREATE FUNCTION tg_producto_bitacora() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF NEW.disponible IS DISTINCT FROM OLD.disponible THEN
        IF fn_usuario_actual() IS NOT NULL THEN
            PERFORM fn_exigir_permiso(fn_usuario_actual(), 'menu.asignar_86', 'asignar o quitar el 86');
        END IF;
        PERFORM fn_bitacora('producto', NEW.id, CASE WHEN NEW.disponible THEN 'quitar_86' ELSE 'asignar_86' END,
                            jsonb_build_object('motivo', NEW.motivo_no_disponible));
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_producto_bitacora AFTER UPDATE OF disponible ON producto
    FOR EACH ROW EXECUTE FUNCTION tg_producto_bitacora();

-- ---------- 03a · Reservaciones --------------------------------------
CREATE FUNCTION tg_reservacion_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_cap smallint; v_num text; v_choque record;
BEGIN
    IF TG_OP = 'INSERT' OR NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora THEN
        NEW.apartado_desde   := NEW.fecha_hora - make_interval(mins => fn_config_num('reservacion.apartado_previo_min', 30)::int);
        NEW.apartado_hasta   := NEW.fecha_hora + make_interval(mins => fn_config_num('reservacion.duracion_min', 120)::int);
        NEW.tolerancia_hasta := NEW.fecha_hora + make_interval(mins => fn_config_num('reservacion.tolerancia_min', 15)::int);
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM fn_exigir_permiso(NEW.registrada_por_usuario_id, 'reservacion.gestionar', 'registrar reservaciones');
        IF NEW.estado NOT IN ('por_confirmar','confirmada') THEN
            RAISE EXCEPTION 'Una reservación nueva empieza Por confirmar o Confirmada.';
        END IF;
        IF NEW.fecha_hora <= fn_ahora() THEN
            RAISE EXCEPTION 'Una reservación aparta mesa para una hora futura. Si el cliente ya llegó, va a la lista de espera.';
        END IF;
        IF NEW.estado = 'confirmada' THEN NEW.confirmada_en := fn_ahora(); END IF;
    END IF;

    -- FOR UPDATE: dos hostess reservando la misma mesa al mismo tiempo se forman en fila
    -- (válido con el aislamiento por defecto, READ COMMITTED)
    SELECT capacidad, numero INTO v_cap, v_num FROM mesa WHERE id = NEW.mesa_id FOR UPDATE;
    IF NEW.numero_personas > v_cap THEN
        RAISE EXCEPTION 'La mesa % es para % personas y la reservación es de %.', v_num, v_cap, NEW.numero_personas;
    END IF;

    IF NEW.estado IN ('por_confirmar','confirmada','sentada') THEN
        SELECT r.nombre_cliente, r.apartado_desde, r.apartado_hasta INTO v_choque
        FROM reservacion r
        WHERE r.mesa_id = NEW.mesa_id AND r.id <> NEW.id
          AND r.estado IN ('por_confirmar','confirmada','sentada')
          AND tstzrange(r.apartado_desde, r.apartado_hasta) && tstzrange(NEW.apartado_desde, NEW.apartado_hasta)
        LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'La mesa % ya está apartada de % a % para %.', v_num,
                  to_char(v_choque.apartado_desde, 'HH24:MI'), to_char(v_choque.apartado_hasta, 'HH24:MI'), v_choque.nombre_cliente;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.estado = 'sentada' AND NEW.mesa_id <> OLD.mesa_id THEN
        RAISE EXCEPTION 'El grupo ya está sentado: para cambiarlo de mesa se usa «Cambiar mesa» en su comanda.';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        IF OLD.estado IN ('sentada','no_se_presento','cancelada') THEN
            RAISE EXCEPTION 'La reservación de % ya terminó (%).', OLD.nombre_cliente, fn_etiqueta('estado_reservacion', OLD.estado::text);
        END IF;
        CASE NEW.estado
            WHEN 'confirmada' THEN
                NEW.confirmada_en := fn_ahora();
            WHEN 'sentada' THEN
                IF fn_ahora() > NEW.tolerancia_hasta THEN
                    RAISE EXCEPTION 'Llegó fuera de la tolerancia (se liberaba a las %): pierde la reservación. Si todavía quiere mesa, entra a la lista de espera.',
                          to_char(NEW.tolerancia_hasta, 'HH24:MI');
                END IF;
                IF (SELECT estado FROM mesa WHERE id = NEW.mesa_id) NOT IN ('libre','reservada') THEN
                    RAISE EXCEPTION 'La mesa % todavía no está libre (está: %).', v_num,
                          fn_etiqueta('estado_mesa', (SELECT estado FROM mesa WHERE id = NEW.mesa_id)::text);
                END IF;
                SELECT r.nombre_cliente, r.fecha_hora INTO v_choque FROM reservacion r
                WHERE r.mesa_id = NEW.mesa_id AND r.id <> NEW.id AND r.estado = 'confirmada'
                  AND r.apartado_desde <= fn_ahora() AND fn_ahora() <= r.tolerancia_hasta LIMIT 1;
                IF FOUND THEN
                    RAISE EXCEPTION 'La mesa % está apartada para otra reservación (% a las %).', v_num,
                          v_choque.nombre_cliente, to_char(v_choque.fecha_hora, 'HH24:MI');
                END IF;
                NEW.sentada_en := fn_ahora();
            WHEN 'no_se_presento' THEN
                IF fn_ahora() <= NEW.tolerancia_hasta THEN
                    RAISE EXCEPTION 'Todavía está dentro de la tolerancia (hasta las %).', to_char(NEW.tolerancia_hasta, 'HH24:MI');
                END IF;
                NEW.finalizada_en := NEW.tolerancia_hasta;
            WHEN 'cancelada' THEN
                NEW.finalizada_en := fn_ahora();
            ELSE
                RAISE EXCEPTION 'Una reservación no regresa a Por confirmar.';
        END CASE;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_reservacion_reglas BEFORE INSERT OR UPDATE ON reservacion
    FOR EACH ROW EXECUTE FUNCTION tg_reservacion_reglas();

-- Aparta o libera la mesa según haya (o no) una reservación confirmada en su ventana.
CREATE FUNCTION fn_ajustar_apartado(p_mesa bigint, p_desde timestamptz DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_estado estado_mesa; v_hay boolean;
BEGIN
    SELECT estado INTO v_estado FROM mesa WHERE id = p_mesa FOR UPDATE;
    v_hay := EXISTS (SELECT 1 FROM reservacion WHERE mesa_id = p_mesa AND estado = 'confirmada'
                     AND apartado_desde <= fn_ahora() AND fn_ahora() <= tolerancia_hasta);
    IF v_estado = 'libre' AND v_hay THEN
        UPDATE mesa SET estado = 'reservada' WHERE id = p_mesa;
    ELSIF v_estado = 'reservada' AND NOT v_hay THEN
        UPDATE mesa SET estado = 'libre', libre_desde = COALESCE(p_desde, fn_ahora()) WHERE id = p_mesa;
    END IF;
END $$;

CREATE FUNCTION tg_reservacion_mesa() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado = 'sentada' AND OLD.estado <> 'sentada' THEN
        UPDATE mesa SET estado = 'por_atender' WHERE id = NEW.mesa_id;
    ELSE
        PERFORM fn_ajustar_apartado(NEW.mesa_id, CASE WHEN NEW.estado = 'no_se_presento' THEN NEW.finalizada_en END);
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.mesa_id <> OLD.mesa_id THEN
        PERFORM fn_ajustar_apartado(OLD.mesa_id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_reservacion_mesa AFTER INSERT OR UPDATE ON reservacion
    FOR EACH ROW EXECUTE FUNCTION tg_reservacion_mesa();

-- 03a · "Si el cliente no llega dentro de la tolerancia, cambia sola a
-- No se presentó y la mesa se libera" + "La mesa se aparta 30 min antes".
-- El backend la llama cada minuto. Devuelve cuántos cambios hizo.
CREATE FUNCTION fn_revisar_reservaciones() RETURNS integer
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_vencida record; n integer := 0; k integer;
BEGIN
    FOR v_vencida IN SELECT id FROM reservacion
                     WHERE estado IN ('por_confirmar','confirmada') AND tolerancia_hasta < fn_ahora()
                     ORDER BY fecha_hora LOOP
        UPDATE reservacion SET estado = 'no_se_presento' WHERE id = v_vencida.id;
        n := n + 1;
    END LOOP;

    UPDATE mesa m SET estado = 'reservada'
    FROM reservacion r
    WHERE r.mesa_id = m.id AND r.estado = 'confirmada'
      AND r.apartado_desde <= fn_ahora() AND fn_ahora() <= r.tolerancia_hasta
      AND m.estado = 'libre';
    GET DIAGNOSTICS k = ROW_COUNT;
    RETURN n + k;
END $$;

-- ---------- 03b · Lista de espera ------------------------------------
CREATE FUNCTION tg_espera_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_mesa record; v_res text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM fn_exigir_permiso(NEW.registrada_por_usuario_id, 'reservacion.gestionar', 'agregar a la lista de espera');
        IF NEW.estado <> 'en_espera' THEN
            RAISE EXCEPTION 'Un grupo nuevo en la lista empieza En espera.';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.estado = 'sentada' AND NEW.mesa_id IS DISTINCT FROM OLD.mesa_id THEN
        RAISE EXCEPTION 'El grupo ya está sentado: para cambiarlo de mesa se usa «Cambiar mesa» en su comanda.';
    END IF;
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        IF OLD.estado <> 'en_espera' THEN
            RAISE EXCEPTION '% ya no está en la lista de espera.', OLD.nombre_cliente;
        END IF;
        IF NEW.estado = 'sentada' THEN
            SELECT * INTO v_mesa FROM mesa WHERE id = NEW.mesa_id;
            IF v_mesa.estado = 'reservada' THEN
                SELECT nombre_cliente || ' (' || to_char(fecha_hora, 'HH24:MI') || ')' INTO v_res
                FROM reservacion WHERE mesa_id = NEW.mesa_id AND estado = 'confirmada'
                  AND apartado_desde <= fn_ahora() AND fn_ahora() <= tolerancia_hasta LIMIT 1;
                RAISE EXCEPTION 'La mesa % está apartada para %: las reservaciones tienen prioridad sobre la lista de espera.', v_mesa.numero, v_res;
            ELSIF v_mesa.estado <> 'libre' THEN
                RAISE EXCEPTION 'La mesa % no está libre (está: %).', v_mesa.numero, fn_etiqueta('estado_mesa', v_mesa.estado::text);
            END IF;
            IF NEW.numero_personas > v_mesa.capacidad THEN
                RAISE EXCEPTION 'La mesa % es muy pequeña: % lugares para % personas.', v_mesa.numero, v_mesa.capacidad, NEW.numero_personas;
            END IF;
            NEW.sentada_en := fn_ahora();
        ELSIF NEW.estado = 'retirada' THEN
            NEW.retirada_en := fn_ahora();
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_espera_reglas BEFORE INSERT OR UPDATE ON lista_espera
    FOR EACH ROW EXECUTE FUNCTION tg_espera_reglas();

CREATE FUNCTION tg_espera_mesa() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    UPDATE mesa SET estado = 'por_atender' WHERE id = NEW.mesa_id;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_espera_mesa AFTER UPDATE OF estado ON lista_espera
    FOR EACH ROW WHEN (NEW.estado = 'sentada' AND OLD.estado <> 'sentada')
    EXECUTE FUNCTION tg_espera_mesa();


-- ---------- 05a, 05b · Comanda ---------------------------------------
CREATE FUNCTION tg_comanda_abrir() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_mesa record; v_grupo record;
BEGIN
    PERFORM fn_exigir_permiso(NEW.mesero_usuario_id, 'comanda.abrir', 'abrir comandas');
    -- 05a · Queda a nombre de quien la abre (el gerente puede abrirla a nombre de un mesero)
    IF fn_usuario_actual() IS NOT NULL AND fn_usuario_actual() <> NEW.mesero_usuario_id
       AND NOT fn_tiene_permiso(fn_usuario_actual(), 'comanda.cancelar') THEN
        RAISE EXCEPTION 'Quien abre la comanda queda como su mesero: % no puede abrirla a nombre de %.',
              (SELECT nombre_completo FROM usuario WHERE id = fn_usuario_actual()),
              (SELECT nombre_completo FROM usuario WHERE id = NEW.mesero_usuario_id);
    END IF;
    IF NEW.estado <> 'abierta' THEN
        RAISE EXCEPTION 'Una comanda nueva empieza Abierta.';
    END IF;
    NEW.tasa_impuesto := NULL;                -- el IVA se congela al pedir la cuenta
    SELECT * INTO v_mesa FROM mesa WHERE id = NEW.mesa_id FOR UPDATE;
    IF v_mesa.estado NOT IN ('libre','por_atender') THEN
        RAISE EXCEPTION 'No se puede abrir comanda en la mesa %: está %.', v_mesa.numero, fn_etiqueta('estado_mesa', v_mesa.estado::text);
    END IF;

    -- 05a · Si la hostess sentó al grupo, la comanda se vincula sola y
    -- toma el número de personas que ella registró.
    IF v_mesa.estado = 'por_atender' AND NEW.reservacion_id IS NULL AND NEW.lista_espera_id IS NULL THEN
        SELECT * INTO v_grupo FROM (
            SELECT 'reservacion' AS origen, r.id, r.numero_personas, r.sentada_en
            FROM reservacion r
            WHERE r.mesa_id = NEW.mesa_id AND r.estado = 'sentada'
              AND NOT EXISTS (SELECT 1 FROM comanda c WHERE c.reservacion_id = r.id)
            UNION ALL
            SELECT 'lista_espera', l.id, l.numero_personas, l.sentada_en
            FROM lista_espera l
            WHERE l.mesa_id = NEW.mesa_id AND l.estado = 'sentada'
              AND NOT EXISTS (SELECT 1 FROM comanda c WHERE c.lista_espera_id = l.id)
        ) g ORDER BY g.sentada_en DESC LIMIT 1;
        IF FOUND THEN
            IF v_grupo.origen = 'reservacion' THEN NEW.reservacion_id := v_grupo.id;
            ELSE NEW.lista_espera_id := v_grupo.id; END IF;
            NEW.numero_personas := COALESCE(NEW.numero_personas, v_grupo.numero_personas);
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_comanda_abrir BEFORE INSERT ON comanda
    FOR EACH ROW EXECUTE FUNCTION tg_comanda_abrir();

CREATE FUNCTION tg_comanda_abierta_mesa() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    UPDATE mesa SET estado = 'comanda_abierta' WHERE id = NEW.mesa_id;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_comanda_abierta_mesa AFTER INSERT ON comanda
    FOR EACH ROW EXECUTE FUNCTION tg_comanda_abierta_mesa();

CREATE FUNCTION tg_comanda_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_mesa record; v_quien bigint; v_falta numeric;
BEGIN
    IF OLD.estado IN ('cerrada','cancelada') THEN
        RAISE EXCEPTION 'La comanda % ya está %: no se reabre ni se modifica. Si piden algo más, se abre una comanda nueva.',
              OLD.folio, lower(fn_etiqueta('estado_comanda', OLD.estado::text));
    END IF;

    -- Transferir: la transfiere su mesero (cambio de turno, descanso) o el
    -- gerente, siempre a alguien que pueda atender comandas. Queda en bitácora.
    IF NEW.mesero_usuario_id <> OLD.mesero_usuario_id THEN
        IF fn_usuario_actual() IS NULL THEN
            RAISE EXCEPTION 'Para transferir la comanda % se indica quién la transfiere (queda en bitácora).', OLD.folio
                  USING ERRCODE = 'insufficient_privilege';
        END IF;
        PERFORM fn_exigir_mesero_de(OLD.id, fn_usuario_actual(), 'transferir la comanda');
        PERFORM fn_exigir_permiso(NEW.mesero_usuario_id, 'comanda.abrir', 'atender comandas');
    END IF;

    -- Cambiar mesa, personas o nota: solo su mesero (o el gerente)
    IF fn_usuario_actual() IS NOT NULL
       AND (NEW.mesa_id, NEW.numero_personas, NEW.nota_general) IS DISTINCT FROM (OLD.mesa_id, OLD.numero_personas, OLD.nota_general) THEN
        PERFORM fn_exigir_mesero_de(OLD.id, fn_usuario_actual(),
                CASE WHEN NEW.mesa_id <> OLD.mesa_id THEN 'cambiar la mesa' ELSE 'modificar la comanda' END);
    END IF;

    -- Cambiar mesa (solo a una mesa libre)
    IF NEW.mesa_id <> OLD.mesa_id THEN
        SELECT * INTO v_mesa FROM mesa WHERE id = NEW.mesa_id FOR UPDATE;
        IF v_mesa.estado <> 'libre' THEN
            RAISE EXCEPTION 'Solo se puede cambiar a una mesa libre (la mesa % está: %).', v_mesa.numero, fn_etiqueta('estado_mesa', v_mesa.estado::text);
        END IF;
    END IF;

    -- La tasa de IVA la congela la base al pedir la cuenta
    IF NEW.tasa_impuesto IS DISTINCT FROM OLD.tasa_impuesto AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
        RAISE EXCEPTION 'La tasa de IVA de la comanda la congela la base al pedir la cuenta: no se escribe a mano.';
    END IF;

    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        CASE
            -- 05b · Pedir la cuenta: caja ya puede imprimir el pre-ticket
            WHEN OLD.estado = 'abierta' AND NEW.estado = 'por_cobrar' THEN
                IF EXISTS (SELECT 1 FROM detalle_comanda WHERE comanda_id = OLD.id AND estado = 'sin_enviar') THEN
                    RAISE EXCEPTION 'Hay productos sin enviar: envíalos o quítalos antes de pedir la cuenta.';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM detalle_comanda WHERE comanda_id = OLD.id AND estado <> 'cancelado') THEN
                    RAISE EXCEPTION 'La comanda % no tiene productos que cobrar.', OLD.folio;
                END IF;
                -- La pide su mesero (o el gerente)
                v_quien := COALESCE(NEW.cuenta_pedida_por_usuario_id, fn_usuario_actual());
                IF v_quien IS NOT NULL AND v_quien <> NEW.mesero_usuario_id THEN
                    PERFORM fn_exigir_mesero_de(OLD.id, v_quien, 'pedir la cuenta');
                END IF;
                NEW.cuenta_pedida_por_usuario_id := COALESCE(NEW.cuenta_pedida_por_usuario_id, NEW.mesero_usuario_id);
                PERFORM fn_exigir_permiso(NEW.cuenta_pedida_por_usuario_id, 'comanda.pedir_cuenta', 'pedir la cuenta');
                NEW.cuenta_pedida_en := fn_ahora();
                NEW.tasa_impuesto    := fn_config_num('impuesto.tasa', 0.16);
            -- 07 · "Cancelar pre-ticket": la cajera regresa la comanda a Abierta
            --      para que el mesero agregue lo que pidieron. Queda en bitácora.
            WHEN OLD.estado = 'por_cobrar' AND NEW.estado = 'abierta' THEN
                IF EXISTS (SELECT 1 FROM pago WHERE comanda_id = OLD.id) THEN
                    RAISE EXCEPTION 'La comanda % ya tiene pagos: se termina de cobrar. Si piden algo más, se abre una comanda nueva.', OLD.folio;
                END IF;
                IF fn_usuario_actual() IS NULL THEN
                    RAISE EXCEPTION 'Para cancelar el pre-ticket se indica quién lo hace (queda en bitácora).'
                          USING ERRCODE = 'insufficient_privilege';
                END IF;
                PERFORM fn_exigir_permiso(fn_usuario_actual(), 'ticket.pre_ticket', 'cancelar el pre-ticket');
                NEW.cuenta_pedida_en := NULL; NEW.cuenta_pedida_por_usuario_id := NULL; NEW.tasa_impuesto := NULL;
            -- 07, 12 · Solo caja cierra la comanda: se cierra sola cuando los pagos cubren el total
            WHEN OLD.estado = 'por_cobrar' AND NEW.estado = 'cerrada' THEN
                PERFORM fn_exigir_permiso(NEW.cerrada_por_usuario_id, 'pago.registrar', 'cerrar la comanda (solo caja la cierra, al cobrar)');
                v_falta := fn_total_comanda(OLD.id) - fn_pagado_comanda(OLD.id);
                IF v_falta > 0 THEN
                    RAISE EXCEPTION 'Faltan $% por cobrar en la comanda %: no se puede cerrar.', v_falta, OLD.folio;
                END IF;
                NEW.cerrada_en := fn_ahora();
            WHEN OLD.estado = 'abierta' AND NEW.estado = 'cerrada' THEN
                RAISE EXCEPTION 'Primero se pide la cuenta: la comanda pasa a Por cobrar y se cierra al cobrarla.';
            WHEN NEW.estado = 'cancelada' THEN
                IF NOT EXISTS (SELECT 1 FROM cancelacion WHERE tipo = 'comanda' AND comanda_id = OLD.id) THEN
                    RAISE EXCEPTION 'Para cancelar la comanda se registra la cancelación con motivo y autorización del gerente.';
                END IF;
                NEW.cancelada_en := fn_ahora();
            ELSE
                RAISE EXCEPTION 'Cambio de estado no permitido: % > %.',
                      fn_etiqueta('estado_comanda', OLD.estado::text), fn_etiqueta('estado_comanda', NEW.estado::text);
        END CASE;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_comanda_reglas BEFORE UPDATE ON comanda
    FOR EACH ROW EXECUTE FUNCTION tg_comanda_reglas();

CREATE FUNCTION tg_comanda_despues() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF NEW.mesa_id <> OLD.mesa_id THEN
        PERFORM fn_liberar_mesa(OLD.mesa_id);
        UPDATE mesa SET estado = CASE WHEN NEW.estado = 'por_cobrar' THEN 'por_cobrar' ELSE 'comanda_abierta' END::estado_mesa
        WHERE id = NEW.mesa_id;
        PERFORM fn_bitacora('comanda', NEW.id, 'cambiar_mesa', jsonb_build_object('de', OLD.mesa_id, 'a', NEW.mesa_id));
    END IF;
    IF NEW.mesero_usuario_id <> OLD.mesero_usuario_id THEN
        PERFORM fn_bitacora('comanda', NEW.id, 'transferir', jsonb_build_object('de', OLD.mesero_usuario_id, 'a', NEW.mesero_usuario_id));
    END IF;
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        IF NEW.estado = 'abierta' THEN
            UPDATE mesa SET estado = 'comanda_abierta' WHERE id = NEW.mesa_id;
            PERFORM fn_bitacora('comanda', NEW.id, 'cancelar_pre_ticket');
        ELSIF NEW.estado = 'por_cobrar' THEN
            UPDATE mesa SET estado = 'por_cobrar' WHERE id = NEW.mesa_id;
        ELSE
            PERFORM fn_liberar_mesa(NEW.mesa_id);
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_comanda_despues AFTER UPDATE ON comanda
    FOR EACH ROW EXECUTE FUNCTION tg_comanda_despues();

-- ---------- 05b · Envíos ---------------------------------------------
CREATE FUNCTION tg_envio_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF (SELECT estado FROM comanda WHERE id = NEW.comanda_id) <> 'abierta' THEN
        RAISE EXCEPTION 'Solo se envía a cocina y barra desde una comanda Abierta.';
    END IF;
    PERFORM fn_exigir_permiso(NEW.enviado_por_usuario_id, 'comanda.abrir', 'enviar productos a cocina y barra');
    PERFORM fn_exigir_mesero_de(NEW.comanda_id, NEW.enviado_por_usuario_id, 'enviar productos');
    IF NEW.numero IS NULL THEN
        NEW.numero := (SELECT COALESCE(MAX(numero), 0) + 1 FROM envio WHERE comanda_id = NEW.comanda_id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_envio_reglas BEFORE INSERT ON envio
    FOR EACH ROW EXECUTE FUNCTION tg_envio_reglas();

-- 05b · Botón "Enviar": crea el envío y manda todo lo que está Sin enviar.
CREATE FUNCTION fn_enviar_comanda(p_comanda bigint, p_usuario bigint) RETURNS bigint
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_envio bigint;
BEGIN
    PERFORM 1 FROM comanda WHERE id = p_comanda FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM detalle_comanda WHERE comanda_id = p_comanda AND estado = 'sin_enviar') THEN
        RAISE EXCEPTION 'No hay productos sin enviar.';
    END IF;
    INSERT INTO envio (comanda_id, enviado_por_usuario_id) VALUES (p_comanda, p_usuario) RETURNING id INTO v_envio;
    UPDATE detalle_comanda SET envio_id = v_envio, estado = 'por_preparar'
    WHERE comanda_id = p_comanda AND estado = 'sin_enviar';
    RETURN v_envio;
END $$;

-- 06 · Botones de la tarjeta: "Empezar a preparar", "Marcar como listo",
-- "Marcar como entregado". Mueve todos los productos de ese envío que se
-- preparan en ese destino (el destino sale de la categoría del producto).
CREATE FUNCTION fn_avanzar_envio(p_envio bigint, p_destino destino_produccion, p_nuevo estado_linea, p_usuario bigint) RETURNS integer
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_prev estado_linea; n integer;
BEGIN
    -- Cocina y barra mueven las tarjetas; "Entregado" también lo puede marcar el mesero (12, paso 6)
    IF NOT (p_nuevo = 'entregado' AND fn_tiene_permiso(p_usuario, 'comanda.abrir')) THEN
        PERFORM fn_exigir_permiso(p_usuario, 'produccion.cambiar_estado', 'cambiar el estado de los platillos');
    END IF;
    v_prev := CASE p_nuevo WHEN 'en_preparacion' THEN 'por_preparar'
                           WHEN 'listo'          THEN 'en_preparacion'
                           WHEN 'entregado'      THEN 'listo' END;
    IF v_prev IS NULL THEN
        RAISE EXCEPTION 'Desde el panel solo se pasa a En preparación, Listo o Entregado.';
    END IF;
    UPDATE detalle_comanda d SET estado = p_nuevo
    FROM producto p JOIN categoria k ON k.id = p.categoria_id
    WHERE d.envio_id = p_envio AND p.id = d.producto_id AND k.destino = p_destino AND d.estado = v_prev;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
        RAISE EXCEPTION 'Esa tarjeta no tiene productos en «%».', fn_etiqueta('estado_linea', v_prev::text);
    END IF;
    RETURN n;
END $$;

-- ---------- 05b, 06 · Productos de la comanda ------------------------
CREATE FUNCTION tg_detalle_agregar() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_com record; v_prod record;
BEGIN
    SELECT folio, estado INTO v_com FROM comanda WHERE id = NEW.comanda_id;
    IF v_com.estado = 'por_cobrar' THEN
        RAISE EXCEPTION 'La comanda % está Por cobrar: para agregar algo, la cajera cancela el pre-ticket y la comanda vuelve a Abierta.', v_com.folio;
    ELSIF v_com.estado <> 'abierta' THEN
        RAISE EXCEPTION 'La comanda % ya está %: no se reabre. Si piden algo más, se abre una comanda nueva.', v_com.folio, lower(fn_etiqueta('estado_comanda', v_com.estado::text));
    END IF;
    IF NEW.estado <> 'sin_enviar' OR NEW.envio_id IS NOT NULL THEN
        RAISE EXCEPTION 'Los productos se agregan como Sin enviar; llegan a cocina hasta presionar Enviar.';
    END IF;
    IF fn_usuario_actual() IS NOT NULL THEN
        PERFORM fn_exigir_mesero_de(NEW.comanda_id, fn_usuario_actual(), 'agregar productos');
    END IF;
    SELECT * INTO v_prod FROM producto WHERE id = NEW.producto_id;
    IF NOT v_prod.activo THEN
        RAISE EXCEPTION '% ya no está en el menú.', v_prod.nombre;
    ELSIF NOT v_prod.disponible THEN
        RAISE EXCEPTION '% está agotado (86).', v_prod.nombre;
    END IF;
    -- Snapshot: siempre del catálogo, nunca lo que mande la aplicación
    NEW.nombre_producto := v_prod.nombre;
    NEW.precio_unitario := v_prod.precio;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_detalle_agregar BEFORE INSERT ON detalle_comanda
    FOR EACH ROW EXECUTE FUNCTION tg_detalle_agregar();

CREATE FUNCTION tg_detalle_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_com estado_comanda; v_paso text;
BEGIN
    SELECT estado INTO v_com FROM comanda WHERE id = OLD.comanda_id;

    IF v_com = 'cancelada' THEN
        RAISE EXCEPTION 'La comanda está cancelada: sus productos ya no cambian.';
    END IF;
    -- Producto y precio se fijan al capturar
    IF (NEW.producto_id, NEW.nombre_producto, NEW.precio_unitario, NEW.comanda_id)
       IS DISTINCT FROM (OLD.producto_id, OLD.nombre_producto, OLD.precio_unitario, OLD.comanda_id) THEN
        RAISE EXCEPTION 'El producto y su precio se fijan al capturarlo: para cambiarlo se quita (o se cancela) y se captura otro.';
    END IF;
    -- Cantidad, tiempo y nota solo se editan mientras está Sin enviar (y solo su mesero)
    IF OLD.estado = 'sin_enviar' AND fn_usuario_actual() IS NOT NULL
       AND (NEW.cantidad, NEW.tiempo, NEW.nota) IS DISTINCT FROM (OLD.cantidad, OLD.tiempo, OLD.nota) THEN
        PERFORM fn_exigir_mesero_de(OLD.comanda_id, fn_usuario_actual(), 'modificar productos');
    END IF;
    IF OLD.estado <> 'sin_enviar' AND (NEW.cantidad, NEW.tiempo, NEW.nota) IS DISTINCT FROM (OLD.cantidad, OLD.tiempo, OLD.nota) THEN
        RAISE EXCEPTION 'El producto ya se envió: no se modifica. Si hace falta, se cancela y se captura de nuevo.';
    END IF;
    -- El envío solo se asigna al presionar Enviar
    IF NEW.envio_id IS DISTINCT FROM OLD.envio_id AND NOT (OLD.estado = 'sin_enviar' AND NEW.estado = 'por_preparar') THEN
        RAISE EXCEPTION 'Un producto no cambia de envío.';
    END IF;

    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        v_paso := OLD.estado::text || '>' || NEW.estado::text;
        IF NEW.estado = 'cancelado' THEN
            IF OLD.estado = 'sin_enviar' THEN
                RAISE EXCEPTION 'Un producto sin enviar no se cancela: se quita de la comanda.';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM cancelacion WHERE detalle_comanda_id = OLD.id)
               AND NOT EXISTS (SELECT 1 FROM cancelacion WHERE tipo = 'comanda' AND comanda_id = OLD.comanda_id) THEN
                RAISE EXCEPTION 'Para cancelar un producto enviado se registra la cancelación con motivo y autorización del gerente.';
            END IF;
            NEW.cancelado_en := fn_ahora();
        ELSIF v_paso IN ('sin_enviar>por_preparar','por_preparar>en_preparacion','en_preparacion>listo','listo>entregado') THEN
            IF v_com = 'cerrada' AND OLD.estado = 'sin_enviar' THEN
                RAISE EXCEPTION 'La comanda ya está cerrada.';
            END IF;
            IF OLD.estado = 'sin_enviar'
               AND NEW.envio_id IS DISTINCT FROM (SELECT id FROM envio WHERE comanda_id = OLD.comanda_id ORDER BY numero DESC LIMIT 1) THEN
                RAISE EXCEPTION 'Lo nuevo se manda en un envío nuevo (botón Enviar), no en uno anterior.';
            END IF;
            IF OLD.estado <> 'sin_enviar' AND fn_usuario_actual() IS NOT NULL THEN
                IF NEW.estado = 'entregado' AND fn_tiene_permiso(fn_usuario_actual(), 'comanda.abrir') THEN
                    NULL;   -- 12, paso 6 · el mesero también marca Entregado al llevarlo a la mesa
                ELSE
                    PERFORM fn_exigir_permiso(fn_usuario_actual(), 'produccion.cambiar_estado', 'cambiar el estado de los platillos');
                END IF;
            END IF;
            CASE NEW.estado
                WHEN 'en_preparacion' THEN NEW.preparacion_en := fn_ahora();
                WHEN 'listo'          THEN NEW.listo_en       := fn_ahora();
                WHEN 'entregado'      THEN NEW.entregado_en   := fn_ahora();
                ELSE NULL;
            END CASE;
        ELSE
            RAISE EXCEPTION 'Cambio no permitido para «%»: % > %.', OLD.nombre_producto,
                  fn_etiqueta('estado_linea', OLD.estado::text), fn_etiqueta('estado_linea', NEW.estado::text);
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_detalle_reglas BEFORE UPDATE ON detalle_comanda
    FOR EACH ROW EXECUTE FUNCTION tg_detalle_reglas();

-- 05b · "Quitar" solo aplica a lo que está Sin enviar
CREATE FUNCTION tg_detalle_quitar() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF OLD.estado <> 'sin_enviar' THEN
        RAISE EXCEPTION 'Solo se quitan productos Sin enviar. Lo que ya se envió se cancela con motivo y autorización del gerente.';
    END IF;
    IF fn_usuario_actual() IS NOT NULL THEN
        PERFORM fn_exigir_mesero_de(OLD.comanda_id, fn_usuario_actual(), 'quitar productos');
    END IF;
    RETURN OLD;
END $$;
CREATE TRIGGER tg_detalle_quitar BEFORE DELETE ON detalle_comanda
    FOR EACH ROW EXECUTE FUNCTION tg_detalle_quitar();

-- ---------- 07 · Pagos -----------------------------------------------
-- Cada pago se registra contra la comanda. Varios pagos = dividir cuenta.
CREATE FUNCTION tg_pago_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_com record; v_corte record; v_corte_id bigint; v_falta numeric;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Los pagos no se modifican ni se borran.';
    END IF;
    SELECT folio, estado INTO v_com FROM comanda WHERE id = NEW.comanda_id FOR UPDATE;
    IF v_com.estado <> 'por_cobrar' THEN
        RAISE EXCEPTION 'Primero el mesero pide la cuenta: solo se cobra una comanda Por cobrar (la % está %).',
              v_com.folio, lower(fn_etiqueta('estado_comanda', v_com.estado::text));
    END IF;
    PERFORM fn_exigir_permiso(NEW.registrado_por_usuario_id, 'pago.registrar', 'registrar pagos');
    -- El pago entra al corte abierto de quien cobra
    v_corte_id := NEW.corte_caja_id;
    IF v_corte_id IS NULL THEN
        SELECT id INTO v_corte_id FROM corte_caja WHERE cajero_usuario_id = NEW.registrado_por_usuario_id AND estado = 'abierto';
        IF v_corte_id IS NULL THEN
            RAISE EXCEPTION 'Abre caja para cobrar: % no tiene un corte abierto.',
                  (SELECT nombre_completo FROM usuario WHERE id = NEW.registrado_por_usuario_id);
        END IF;
        NEW.corte_caja_id := v_corte_id;
    END IF;
    SELECT folio, estado INTO v_corte FROM corte_caja WHERE id = v_corte_id;
    IF v_corte.estado = 'cerrado' THEN
        RAISE EXCEPTION 'El corte % ya está cerrado: abre caja para cobrar.', v_corte.folio;
    END IF;
    IF NEW.metodo = 'efectivo' AND (NEW.monto_recibido IS NULL OR NEW.monto_recibido < NEW.monto) THEN
        RAISE EXCEPTION 'El efectivo recibido ($%) no alcanza para el pago ($%).', COALESCE(NEW.monto_recibido, 0), NEW.monto;
    END IF;
    IF NEW.metodo <> 'efectivo' THEN
        NEW.monto_recibido := NULL;
    END IF;
    v_falta := fn_total_comanda(NEW.comanda_id) - fn_pagado_comanda(NEW.comanda_id);
    IF NEW.monto > v_falta THEN
        RAISE EXCEPTION 'El pago ($%) excede lo que falta por cobrar de la comanda % ($%).', NEW.monto, v_com.folio, v_falta;
    END IF;
    NEW.registrado_en := fn_ahora();
    RETURN NEW;
END $$;
CREATE TRIGGER tg_pago_reglas BEFORE INSERT OR UPDATE OR DELETE ON pago
    FOR EACH ROW EXECUTE FUNCTION tg_pago_reglas();

-- 07 · "Al registrar el pago se cierra la comanda y la mesa queda libre"
--      (cuando los pagos cubren el total; si no, sigue Por cobrar).
CREATE FUNCTION tg_pago_cerrar() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF fn_pagado_comanda(NEW.comanda_id) >= fn_total_comanda(NEW.comanda_id) THEN
        UPDATE comanda SET estado = 'cerrada', cerrada_por_usuario_id = NEW.registrado_por_usuario_id
        WHERE id = NEW.comanda_id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_pago_cerrar AFTER INSERT ON pago
    FOR EACH ROW EXECUTE FUNCTION tg_pago_cerrar();

-- ---------- 08 · Corte de caja ---------------------------------------
CREATE FUNCTION tg_corte_reglas() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM fn_exigir_permiso(NEW.cajero_usuario_id, 'caja.corte', 'abrir caja');
        IF NEW.estado <> 'abierto' OR NEW.efectivo_declarado IS NOT NULL THEN
            RAISE EXCEPTION 'Un corte nuevo empieza Abierto.';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.estado = 'cerrado' THEN
        RAISE EXCEPTION 'El corte % ya está cerrado: es inmutable.', OLD.folio;
    END IF;
    IF (NEW.folio, NEW.cajero_usuario_id, NEW.monto_apertura, NEW.abierto_en)
       IS DISTINCT FROM (OLD.folio, OLD.cajero_usuario_id, OLD.monto_apertura, OLD.abierto_en) THEN
        RAISE EXCEPTION 'La apertura del corte % no cambia.', OLD.folio;
    END IF;
    IF NEW.estado = 'cerrado' THEN
        PERFORM fn_exigir_permiso(NEW.cerrado_por_usuario_id, 'caja.corte', 'hacer el corte de caja');
        IF EXISTS (SELECT 1 FROM pago p JOIN comanda c ON c.id = p.comanda_id
                   WHERE p.corte_caja_id = OLD.id AND c.estado = 'por_cobrar') THEN
            RAISE EXCEPTION 'Hay cuentas cobradas a medias en el corte %: termina de cobrarlas antes del corte.', OLD.folio;
        END IF;
        NEW.cerrado_en := fn_ahora();
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_corte_reglas BEFORE INSERT OR UPDATE ON corte_caja
    FOR EACH ROW EXECUTE FUNCTION tg_corte_reglas();

-- 08 · Corte Z: la cajera captura el efectivo que contó y el corte se
-- cierra. Los totales por método y la diferencia los calcula v_cortes_caja.
CREATE FUNCTION fn_cerrar_corte(p_corte bigint, p_usuario bigint, p_efectivo_declarado numeric,
                                p_observaciones text DEFAULT NULL) RETURNS corte_caja
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v corte_caja;
BEGIN
    UPDATE corte_caja
       SET efectivo_declarado     = p_efectivo_declarado,
           observaciones          = COALESCE(p_observaciones, observaciones),
           cerrado_por_usuario_id = p_usuario,
           estado                 = 'cerrado'
     WHERE id = p_corte
    RETURNING * INTO v;
    RETURN v;
END $$;

-- ---------- 05b, 10 · Cancelaciones ----------------------------------
CREATE FUNCTION tg_cancelacion_validar() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
DECLARE
    v_det record; v_com record;
BEGIN
    IF NEW.tipo = 'producto' THEN
        SELECT d.*, fn_importe_linea(d.id) AS importe INTO v_det FROM detalle_comanda d WHERE d.id = NEW.detalle_comanda_id;
        IF v_det.estado = 'sin_enviar' THEN
            RAISE EXCEPTION 'Un producto sin enviar no se cancela: se quita de la comanda.';
        ELSIF v_det.estado = 'cancelado' THEN
            RAISE EXCEPTION 'Ese producto ya estaba cancelado.';
        END IF;
        NEW.comanda_id := v_det.comanda_id;
        IF NEW.monto = 0 THEN NEW.monto := v_det.importe; END IF;
    END IF;
    SELECT folio, estado INTO v_com FROM comanda WHERE id = NEW.comanda_id;
    IF NEW.tipo = 'producto' AND v_com.estado = 'por_cobrar' THEN
        RAISE EXCEPTION 'La cuenta ya se pidió: la cajera cancela el pre-ticket (la comanda vuelve a Abierta) y después se cancela el producto.';
    END IF;
    IF v_com.estado NOT IN ('abierta','por_cobrar') THEN
        RAISE EXCEPTION 'La comanda % ya está %: no se cancela.', v_com.folio, lower(fn_etiqueta('estado_comanda', v_com.estado::text));
    END IF;
    IF NEW.tipo = 'comanda' THEN
        IF EXISTS (SELECT 1 FROM pago WHERE comanda_id = NEW.comanda_id) THEN
            RAISE EXCEPTION 'La comanda % ya tiene pagos: se termina de cobrar, no se cancela.', v_com.folio;
        END IF;
        IF NEW.monto = 0 THEN NEW.monto := fn_subtotal_comanda(NEW.comanda_id, true); END IF;
    END IF;
    PERFORM fn_exigir_permiso(NEW.autorizado_por_usuario_id, 'comanda.cancelar', 'autorizar cancelaciones');
    RETURN NEW;
END $$;
CREATE TRIGGER tg_cancelacion_validar BEFORE INSERT ON cancelacion
    FOR EACH ROW EXECUTE FUNCTION tg_cancelacion_validar();

-- Registrar la cancelación ES cancelar
CREATE FUNCTION tg_cancelacion_aplicar() RETURNS trigger
LANGUAGE plpgsql SET search_path = kitchenlink, public AS $$
BEGIN
    IF NEW.tipo = 'producto' THEN
        UPDATE detalle_comanda SET estado = 'cancelado' WHERE id = NEW.detalle_comanda_id;
    ELSE
        DELETE FROM detalle_comanda WHERE comanda_id = NEW.comanda_id AND estado = 'sin_enviar';
        UPDATE detalle_comanda SET estado = 'cancelado' WHERE comanda_id = NEW.comanda_id AND estado <> 'cancelado';
        UPDATE comanda SET estado = 'cancelada' WHERE id = NEW.comanda_id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_cancelacion_aplicar AFTER INSERT ON cancelacion
    FOR EACH ROW EXECUTE FUNCTION tg_cancelacion_aplicar();


-- ---------------------------------------------------------------------
-- 11. ÍNDICES DE APOYO (cada uno responde a una consulta de pantalla)
-- ---------------------------------------------------------------------
CREATE INDEX ix_detalle_panel       ON detalle_comanda (estado) WHERE estado IN ('por_preparar','en_preparacion','listo');      -- 06
CREATE INDEX ix_detalle_comanda     ON detalle_comanda (comanda_id);
CREATE INDEX ix_detalle_envio       ON detalle_comanda (envio_id);
CREATE INDEX ix_detalle_producto    ON detalle_comanda (producto_id);
CREATE INDEX ix_comanda_mesero      ON comanda (mesero_usuario_id) WHERE estado IN ('abierta','por_cobrar');                      -- 05a
CREATE INDEX ix_comanda_fechas      ON comanda (abierta_en, cerrada_en);                                                          -- 08, 10
CREATE INDEX ix_reservacion_agenda  ON reservacion (fecha_hora) WHERE estado IN ('por_confirmar','confirmada');                   -- 03a
CREATE INDEX ix_reservacion_mesa    ON reservacion (mesa_id, apartado_desde);
CREATE INDEX ix_espera_activa       ON lista_espera (llegada_en) WHERE estado = 'en_espera';                                      -- 03b
CREATE INDEX ix_pago_comanda        ON pago (comanda_id);                                                                         -- 07
CREATE INDEX ix_pago_corte          ON pago (corte_caja_id);                                                                      -- 08
CREATE INDEX ix_producto_categoria  ON producto (categoria_id) WHERE activo;
CREATE INDEX ix_bitacora_entidad    ON bitacora (entidad, entidad_id);
CREATE INDEX ix_cancelacion_fecha   ON cancelacion (registrada_en);                                                              -- 10
CREATE INDEX ix_sesion_abierta      ON sesion (usuario_id) WHERE cerrada_en IS NULL;                                              -- 02a


-- ---------------------------------------------------------------------
-- 12. VISTAS · una o más por pantalla, con los mismos datos y textos.
--     Los tickets y los reportes salen de aquí: son consultas, no tablas.
-- ---------------------------------------------------------------------

-- 02a · Usuarios (el Pendiente aparece al final)
CREATE VIEW v_usuarios AS
SELECT  u.id, u.nombre_completo, u.nombre_usuario, r.nombre AS rol, u.telefono,
        u.estado, e.etiqueta AS estado_etiqueta, e.tono AS estado_tono,
        EXISTS (SELECT 1 FROM sesion s WHERE s.usuario_id = u.id AND s.cerrada_en IS NULL AND s.expira_en > fn_ahora()) AS en_linea,
        u.ultimo_acceso,
        u.requiere_cambio_pw,
        CASE WHEN u.estado = 'pendiente' THEN 'Aún no inicia sesión por primera vez'
             WHEN u.requiere_cambio_pw  THEN 'Contraseña restablecida: la cambia al entrar' END AS aviso
FROM usuario u
JOIN rol r ON r.id = u.rol_id
LEFT JOIN etiqueta_estado e ON e.dominio = 'estado_usuario' AND e.valor = u.estado::text
ORDER BY CASE u.estado WHEN 'activo' THEN 1 WHEN 'dado_de_baja' THEN 2 ELSE 3 END, u.id;

-- 02c · Lista de roles
CREATE VIEW v_roles AS
SELECT  r.id, r.nombre, r.descripcion, r.es_sistema, r.activo,
        COUNT(u.id)                                             AS usuarios,
        COUNT(u.id) FILTER (WHERE u.estado = 'dado_de_baja')    AS usuarios_dados_de_baja,
        COUNT(u.id) || CASE WHEN COUNT(u.id) = 1 THEN ' usuario' ELSE ' usuarios' END
          || CASE WHEN COUNT(u.id) FILTER (WHERE u.estado = 'dado_de_baja') = 0 THEN ''
                  WHEN COUNT(u.id) = 1 THEN ' (dado de baja)'
                  ELSE ' (' || COUNT(u.id) FILTER (WHERE u.estado = 'dado_de_baja') || ' dado de baja)' END AS usuarios_texto,
        (SELECT COUNT(*) FROM rol_permiso rp WHERE rp.rol_id = r.id) AS permisos_activos,
        (SELECT COUNT(*) FROM permiso)                                AS permisos_totales,
        (SELECT COUNT(*) FROM rol_permiso rp WHERE rp.rol_id = r.id) || ' de ' || (SELECT COUNT(*) FROM permiso) || ' permisos activos' AS permisos_texto,
        (NOT r.es_sistema AND COUNT(u.id) FILTER (WHERE u.estado <> 'dado_de_baja') = 0) AS se_puede_dar_de_baja
FROM rol r
LEFT JOIN usuario u ON u.rol_id = r.id
GROUP BY r.id
ORDER BY r.id;

-- 02c · Casillas de permisos por módulo de cada rol
CREATE VIEW v_permisos_rol AS
SELECT  r.id AS rol_id, r.nombre AS rol, p.modulo, p.orden, p.clave, p.nombre AS permiso,
        EXISTS (SELECT 1 FROM rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id) AS marcado
FROM rol r CROSS JOIN permiso p
ORDER BY r.id, p.orden;

-- 04, 05a · Mapa de mesas
CREATE VIEW v_mapa_mesas AS
SELECT  m.id, m.numero, m.capacidad, m.estado, e.etiqueta AS estado_etiqueta, e.tono AS estado_tono,
        m.libre_desde, m.motivo_bloqueo,
        c.id AS comanda_id, c.folio, c.mesero_usuario_id, u.nombre_completo AS mesero, c.numero_personas, c.abierta_en,
        floor(EXTRACT(EPOCH FROM fn_ahora() - c.abierta_en) / 60)::int                       AS minutos_abierta,
        CASE WHEN c.id IS NOT NULL THEN fn_total_comanda(c.id) END                          AS total,
        c.cuenta_pedida_en,
        (SELECT COUNT(*) FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado = 'sin_enviar')                    AS productos_sin_enviar,
        (SELECT COALESCE(SUM(d.cantidad), 0) FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado = 'listo')     AS platillos_listos,
        g.nombre AS grupo_por_atender, g.personas AS personas_por_atender, g.sentada_en,
        floor(EXTRACT(EPOCH FROM fn_ahora() - g.sentada_en) / 60)::int                      AS minutos_sentados,
        rp.nombre_cliente AS proxima_reservacion, rp.fecha_hora AS proxima_reservacion_hora, rp.tolerancia_hasta AS se_libera_si_no_llega
FROM mesa m
LEFT JOIN etiqueta_estado e ON e.dominio = 'estado_mesa' AND e.valor = m.estado::text
LEFT JOIN comanda c ON c.mesa_id = m.id AND c.estado IN ('abierta','por_cobrar')
LEFT JOIN usuario u ON u.id = c.mesero_usuario_id
LEFT JOIN LATERAL (SELECT x.nombre, x.personas, x.sentada_en FROM (
                       SELECT r.nombre_cliente AS nombre, r.numero_personas AS personas, r.sentada_en
                       FROM reservacion r WHERE r.mesa_id = m.id AND r.estado = 'sentada'
                         AND NOT EXISTS (SELECT 1 FROM comanda k WHERE k.reservacion_id = r.id)
                       UNION ALL
                       SELECT l.nombre_cliente, l.numero_personas, l.sentada_en
                       FROM lista_espera l WHERE l.mesa_id = m.id AND l.estado = 'sentada'
                         AND NOT EXISTS (SELECT 1 FROM comanda k WHERE k.lista_espera_id = l.id)) x
                   WHERE m.estado = 'por_atender'
                   ORDER BY x.sentada_en DESC LIMIT 1) g ON TRUE
LEFT JOIN LATERAL (SELECT r.nombre_cliente, r.fecha_hora, r.tolerancia_hasta FROM reservacion r
                   WHERE r.mesa_id = m.id AND r.estado IN ('por_confirmar','confirmada') AND r.tolerancia_hasta >= fn_ahora()
                   ORDER BY r.fecha_hora LIMIT 1) rp ON TRUE
WHERE m.activo
ORDER BY m.numero;

-- 03a · Agenda de reservaciones ("En tolerancia" se calcula aquí)
CREATE VIEW v_reservaciones AS
SELECT  x.*, e.etiqueta AS estado_etiqueta, e.tono AS estado_tono
FROM (
    SELECT  r.id, r.fecha_hora, r.nombre_cliente, r.numero_personas, m.numero AS mesa, r.telefono, r.solicitudes_especiales,
            r.estado,
            CASE WHEN r.estado IN ('por_confirmar','confirmada') AND fn_ahora() >  r.tolerancia_hasta THEN 'no_se_presento'
                 WHEN r.estado IN ('por_confirmar','confirmada') AND fn_ahora() >= r.fecha_hora       THEN 'en_tolerancia'
                 ELSE r.estado::text END                                              AS estado_pantalla,
            r.apartado_desde, r.apartado_hasta, r.tolerancia_hasta, r.sentada_en, r.finalizada_en,
            (r.estado = 'confirmada' AND r.apartado_desde <= fn_ahora())             AS mesa_apartada,
            CASE WHEN r.estado IN ('por_confirmar','confirmada') AND fn_ahora() BETWEEN r.fecha_hora AND r.tolerancia_hasta
                 THEN ceil(EXTRACT(EPOCH FROM r.tolerancia_hasta - fn_ahora()) / 60)::int END AS minutos_para_liberar
    FROM reservacion r JOIN mesa m ON m.id = r.mesa_id
) x
LEFT JOIN etiqueta_estado e ON e.dominio = 'estado_reservacion' AND e.valor = x.estado_pantalla
ORDER BY x.fecha_hora;

-- 03b · Lista de espera (posición = orden de llegada)
CREATE VIEW v_lista_espera AS
SELECT  l.id,
        row_number() OVER (ORDER BY l.llegada_en)::int                              AS posicion,
        l.nombre_cliente, l.numero_personas, COALESCE(l.telefono, 'sin teléfono')   AS telefono, l.nota,
        l.llegada_en,
        floor(EXTRACT(EPOCH FROM fn_ahora() - l.llegada_en) / 60)::int              AS minutos_esperando,
        GREATEST(l.espera_estimada_min - floor(EXTRACT(EPOCH FROM fn_ahora() - l.llegada_en) / 60)::int, 0) AS minutos_estimados,
        (l.reservacion_origen_id IS NOT NULL)                                      AS venia_con_reservacion
FROM lista_espera l
WHERE l.estado = 'en_espera'
ORDER BY l.llegada_en;

-- 05b, 09 · Menú: cada producto con su categoría y dónde se prepara
CREATE VIEW v_menu AS
SELECT  p.id, k.nombre AS categoria, k.orden AS orden_categoria, p.nombre, p.descripcion, p.precio,
        k.destino, ed.etiqueta AS se_prepara_en,
        p.disponible, CASE WHEN p.disponible THEN 'Disponible' ELSE 'Asignado 86' END AS estado_texto,
        p.motivo_no_disponible
FROM producto p
JOIN categoria k ON k.id = p.categoria_id
LEFT JOIN etiqueta_estado ed ON ed.dominio = 'destino_produccion' AND ed.valor = k.destino::text
WHERE p.activo AND k.activo
ORDER BY k.orden, p.id;

-- 05b · Encabezado y totales de la comanda
CREATE VIEW v_comanda_resumen AS
SELECT  c.id, c.folio, m.numero AS mesa, c.numero_personas, c.abierta_en, u.nombre_completo AS mesero,
        c.estado, e.etiqueta AS estado_etiqueta, c.nota_general,
        fn_subtotal_comanda(c.id, true)                                     AS subtotal_enviado,
        fn_subtotal_comanda(c.id) - fn_subtotal_comanda(c.id, true)        AS subtotal_sin_enviar,
        fn_subtotal_comanda(c.id)                                           AS subtotal,
        fn_iva_comanda(c.id)                                                AS iva,
        fn_total_comanda(c.id)                                              AS total,
        fn_pagado_comanda(c.id)                                             AS pagado,
        (SELECT COUNT(*) FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado = 'sin_enviar') AS productos_sin_enviar,
        (SELECT COUNT(*) FROM envio v WHERE v.comanda_id = c.id)                                       AS envios
FROM comanda c
JOIN mesa m    ON m.id = c.mesa_id
JOIN usuario u ON u.id = c.mesero_usuario_id
LEFT JOIN etiqueta_estado e ON e.dominio = 'estado_comanda' AND e.valor = c.estado::text;

-- 05b · Productos de la comanda, agrupados por envío y "Sin enviar"
CREATE VIEW v_comanda_detalle AS
SELECT  d.id, d.comanda_id, c.folio,
        CASE WHEN d.estado = 'sin_enviar' THEN 'SIN ENVIAR' ELSE 'ENVIADO A COCINA Y BARRA' END   AS seccion,
        v.numero AS envio_numero, v.enviado_en, v.es_adicional,
        CASE WHEN v.id IS NOT NULL THEN 'Envío ' || v.numero || ' · ' || to_char(v.enviado_en, 'HH24:MI')
                                       || CASE WHEN v.es_adicional THEN ' · pedido adicional' ELSE '' END END AS envio_texto,
        d.cantidad, d.nombre_producto, fn_importe_linea(d.id) AS importe, k.destino, d.tiempo, d.nota,
        concat_ws(' · ',
            CASE WHEN k.destino = 'barra' THEN 'Barra'
                 ELSE CASE d.tiempo WHEN 1 THEN '1er tiempo' WHEN 2 THEN '2º tiempo' ELSE '3er tiempo' END END,
            d.nota)                                                                               AS detalle_texto,
        d.estado, e.etiqueta AS estado_etiqueta, e.tono AS estado_tono
FROM detalle_comanda d
JOIN comanda c    ON c.id = d.comanda_id
JOIN producto p   ON p.id = d.producto_id
JOIN categoria k  ON k.id = p.categoria_id
LEFT JOIN envio v ON v.id = d.envio_id
LEFT JOIN etiqueta_estado e ON e.dominio = 'estado_linea' AND e.valor = d.estado::text
ORDER BY d.comanda_id, (d.envio_id IS NULL), v.numero, d.id;

-- 06 · Panel de cocina y barra: una tarjeta por envío y destino
CREATE VIEW v_panel_produccion AS
WITH tarjeta AS (
    SELECT  d.envio_id, k.destino, MIN(d.estado) AS estado, MAX(d.listo_en) AS listo_en,
            string_agg(d.cantidad || '× ' || d.nombre_producto, ' | ' ORDER BY d.tiempo, d.id) AS productos,
            SUM(d.cantidad) AS piezas
    FROM detalle_comanda d
    JOIN producto p  ON p.id = d.producto_id
    JOIN categoria k ON k.id = p.categoria_id
    WHERE d.estado IN ('por_preparar','en_preparacion','listo')
    GROUP BY d.envio_id, k.destino
)
SELECT  t.destino, t.envio_id, m.numero AS mesa, v.numero AS envio_numero, v.es_adicional,
        CASE t.estado WHEN 'por_preparar' THEN 'Por preparar' WHEN 'en_preparacion' THEN 'En preparación' ELSE 'Listo para entregar' END AS columna,
        t.estado,
        u.nombre_completo AS mesero, v.enviado_en,
        floor(EXTRACT(EPOCH FROM fn_ahora() - v.enviado_en) / 60)::int                                   AS minutos_desde_envio,
        CASE WHEN t.estado = 'listo' THEN floor(EXTRACT(EPOCH FROM fn_ahora() - t.listo_en) / 60)::int END AS minutos_desde_listo,
        t.productos, t.piezas, c.nota_general AS nota_mesa,
        CASE t.estado WHEN 'por_preparar' THEN 'Empezar a preparar' WHEN 'en_preparacion' THEN 'Marcar como listo' ELSE 'Marcar como entregado' END AS accion
FROM tarjeta t
JOIN envio v   ON v.id = t.envio_id
JOIN comanda c ON c.id = v.comanda_id
JOIN mesa m    ON m.id = c.mesa_id
JOIN usuario u ON u.id = c.mesero_usuario_id
WHERE c.estado <> 'cancelada'
ORDER BY t.destino, t.estado, v.enviado_en;

-- 07 · Cuentas por cobrar (lo que ve caja)
CREATE VIEW v_cuentas_por_cobrar AS
SELECT  c.id AS comanda_id, c.folio, m.numero AS mesa, c.numero_personas, u.nombre_completo AS mesero,
        c.cuenta_pedida_en,
        fn_subtotal_comanda(c.id) AS subtotal,
        fn_iva_comanda(c.id)      AS iva,
        fn_total_comanda(c.id)    AS total,
        fn_pagado_comanda(c.id)   AS pagado,
        fn_total_comanda(c.id) - fn_pagado_comanda(c.id) AS falta
FROM comanda c
JOIN mesa m    ON m.id = c.mesa_id
JOIN usuario u ON u.id = c.mesero_usuario_id
WHERE c.estado = 'por_cobrar'
ORDER BY c.cuenta_pedida_en;

-- 07, 08 · EL TICKET (y el pre-ticket) se GENERA aquí: no hay tabla de tickets.
--          Pre-ticket = comanda Por cobrar; Ticket = comanda Cerrada (pagada).
CREATE VIEW v_ticket AS
SELECT  c.id AS comanda_id, c.folio,
        CASE c.estado WHEN 'por_cobrar' THEN 'Pre-ticket' ELSE 'Ticket' END  AS tipo,
        fn_config_txt('restaurante.nombre')    AS restaurante,
        fn_config_txt('restaurante.sucursal')  AS sucursal,
        fn_config_txt('restaurante.rfc')       AS rfc,
        m.numero AS mesa, c.numero_personas, u.nombre_completo AS mesero,
        COALESCE(c.cerrada_en, c.cuenta_pedida_en) AS fecha,
        c.cuenta_pedida_en, c.cerrada_en,
        (SELECT COUNT(*) FROM detalle_comanda d WHERE d.comanda_id = c.id AND d.estado <> 'cancelado') AS productos,
        fn_subtotal_comanda(c.id) AS subtotal,
        c.tasa_impuesto,
        fn_iva_comanda(c.id)      AS iva,
        fn_total_comanda(c.id)    AS total,
        ROUND(fn_subtotal_comanda(c.id) * fn_config_num('propina.sugerida', 0.10), 2) AS propina_sugerida,
        fn_pagado_comanda(c.id)   AS pagado,
        fn_total_comanda(c.id) - fn_pagado_comanda(c.id) AS falta,
        (SELECT COUNT(*) FROM pago p WHERE p.comanda_id = c.id) AS pagos,
        (SELECT CASE WHEN COUNT(DISTINCT p.metodo) > 1 THEN 'Mixto' ELSE MAX(fn_etiqueta('metodo_pago', p.metodo::text)) END
         FROM pago p WHERE p.comanda_id = c.id) AS metodo
FROM comanda c
JOIN mesa m    ON m.id = c.mesa_id
JOIN usuario u ON u.id = c.mesero_usuario_id
WHERE c.estado IN ('por_cobrar','cerrada');

-- 07, 08 · Renglones del ticket (lo cancelado no se imprime)
CREATE VIEW v_ticket_lineas AS
SELECT  d.comanda_id, c.folio, d.id AS linea, d.cantidad, d.nombre_producto, d.precio_unitario, fn_importe_linea(d.id) AS importe
FROM detalle_comanda d
JOIN comanda c ON c.id = d.comanda_id
WHERE c.estado IN ('por_cobrar','cerrada') AND d.estado <> 'cancelado'
ORDER BY d.comanda_id, d.id;

-- 07, 08 · Pagos del ticket. El cambio se calcula, no se guarda.
CREATE VIEW v_ticket_pagos AS
SELECT  p.id, p.comanda_id, c.folio, p.metodo, fn_etiqueta('metodo_pago', p.metodo::text) AS metodo_etiqueta,
        p.monto, p.monto_recibido, (p.monto_recibido - p.monto) AS cambio, p.referencia,
        p.registrado_en, u.nombre_completo AS cobro, k.folio AS corte
FROM pago p
JOIN comanda c    ON c.id = p.comanda_id
JOIN usuario u    ON u.id = p.registrado_por_usuario_id
JOIN corte_caja k ON k.id = p.corte_caja_id
ORDER BY p.comanda_id, p.id;

-- 08 · "Tickets del día": las comandas pagadas, del más reciente al más antiguo
CREATE VIEW v_tickets AS
SELECT  comanda_id, folio, mesa, mesero, metodo, cerrada_en AS hora, total, pagos,
        CASE WHEN pagos = 1 THEN '1 pago' ELSE pagos || ' pagos' END AS pagos_texto
FROM v_ticket
WHERE tipo = 'Ticket'
ORDER BY cerrada_en DESC;

-- 08 · Cortes Z: los totales se calculan de los pagos del corte
CREATE VIEW v_cortes_caja AS
SELECT  k.id, k.folio, u.nombre_completo AS cajera, k.turno, k.abierto_en, k.cerrado_en,
        k.estado, e.etiqueta AS estado_etiqueta,
        k.monto_apertura,
        s.efectivo, s.tarjeta, s.transferencia, s.efectivo + s.tarjeta + s.transferencia AS total_cobrado, s.operaciones,
        k.monto_apertura + s.efectivo                              AS efectivo_esperado,
        k.efectivo_declarado,
        k.efectivo_declarado - (k.monto_apertura + s.efectivo)     AS diferencia
FROM corte_caja k
JOIN usuario u ON u.id = k.cajero_usuario_id
LEFT JOIN etiqueta_estado e ON e.dominio = 'estado_corte' AND e.valor = k.estado::text
CROSS JOIN LATERAL (SELECT COALESCE(SUM(p.monto) FILTER (WHERE p.metodo = 'efectivo'), 0)      AS efectivo,
                           COALESCE(SUM(p.monto) FILTER (WHERE p.metodo = 'tarjeta'), 0)       AS tarjeta,
                           COALESCE(SUM(p.monto) FILTER (WHERE p.metodo = 'transferencia'), 0) AS transferencia,
                           COUNT(p.id) AS operaciones
                    FROM pago p WHERE p.corte_caja_id = k.id) s
ORDER BY k.abierto_en DESC;

-- 08 · Corte por mesero (cuánto cobró caja de las mesas de cada mesero)
CREATE VIEW v_corte_meseros AS
SELECT  p.corte_caja_id, u.id AS mesero_id, u.nombre_completo AS mesero,
        COUNT(DISTINCT c.id) AS cuentas, SUM(p.monto) AS total_cobrado
FROM pago p
JOIN comanda c ON c.id = p.comanda_id
JOIN usuario u ON u.id = c.mesero_usuario_id
GROUP BY p.corte_caja_id, u.id, u.nombre_completo;

-- 10 · Ventas por producto
CREATE VIEW v_ventas_por_producto AS
SELECT  d.producto_id, d.nombre_producto, cat.nombre AS categoria,
        date_trunc('day', c.cerrada_en) AS dia,
        SUM(d.cantidad)                 AS unidades_vendidas,
        SUM(fn_importe_linea(d.id))     AS importe
FROM detalle_comanda d
JOIN comanda c     ON c.id = d.comanda_id
JOIN producto p    ON p.id = d.producto_id
JOIN categoria cat ON cat.id = p.categoria_id
WHERE d.estado <> 'cancelado' AND c.estado = 'cerrada'
GROUP BY d.producto_id, d.nombre_producto, cat.nombre, date_trunc('day', c.cerrada_en);

-- 10 · Rotación de mesas
CREATE VIEW v_rotacion_mesas AS
SELECT  x.*,
        CASE WHEN x.minutos_promedio <= fn_config_num('reporte.rotacion_optima_min', 60)  THEN 'Óptimo'
             WHEN x.minutos_promedio <= fn_config_num('reporte.rotacion_critica_min', 90) THEN 'Alto'
             ELSE 'Crítico' END AS nivel
FROM (
    SELECT  m.id AS mesa_id, m.numero AS mesa, date_trunc('day', c.abierta_en) AS dia,
            COUNT(c.id) AS servicios,
            ROUND(AVG(EXTRACT(EPOCH FROM c.cerrada_en - c.abierta_en) / 60)) AS minutos_promedio
    FROM mesa m
    JOIN comanda c ON c.mesa_id = m.id AND c.estado = 'cerrada'
    GROUP BY m.id, m.numero, date_trunc('day', c.abierta_en)
) x;

-- 08, 10 · Resumen del día: ventas, métodos de pago, cancelaciones, comensales y rotación
CREATE VIEW v_resumen_dia AS
WITH dias AS (SELECT DISTINCT date_trunc('day', abierta_en) AS dia FROM comanda)
SELECT  d.dia,
        v.ventas, v.tickets, ROUND(v.ventas / NULLIF(v.tickets, 0), 2) AS ticket_promedio,
        p.efectivo, p.operaciones_efectivo, p.tarjeta, p.operaciones_tarjeta, p.transferencia, p.operaciones_transferencia,
        k.monto_cancelado, k.cancelaciones,
        v.comensales, v.tickets AS servicios,
        ROUND(v.tickets::numeric / NULLIF((SELECT COUNT(*) FROM mesa WHERE activo), 0), 1) AS rotacion_veces
FROM dias d
CROSS JOIN LATERAL (SELECT COALESCE(SUM(fn_total_comanda(c.id)), 0) AS ventas, COUNT(*) AS tickets,
                           COALESCE(SUM(c.numero_personas), 0) AS comensales
                    FROM comanda c WHERE c.estado = 'cerrada' AND date_trunc('day', c.cerrada_en) = d.dia) v
CROSS JOIN LATERAL (SELECT COALESCE(SUM(pa.monto) FILTER (WHERE pa.metodo = 'efectivo'), 0)      AS efectivo,
                           COUNT(*) FILTER (WHERE pa.metodo = 'efectivo')                          AS operaciones_efectivo,
                           COALESCE(SUM(pa.monto) FILTER (WHERE pa.metodo = 'tarjeta'), 0)       AS tarjeta,
                           COUNT(*) FILTER (WHERE pa.metodo = 'tarjeta')                           AS operaciones_tarjeta,
                           COALESCE(SUM(pa.monto) FILTER (WHERE pa.metodo = 'transferencia'), 0) AS transferencia,
                           COUNT(*) FILTER (WHERE pa.metodo = 'transferencia')                     AS operaciones_transferencia
                    FROM pago pa WHERE date_trunc('day', pa.registrado_en) = d.dia) p
CROSS JOIN LATERAL (SELECT COALESCE(SUM(monto), 0) AS monto_cancelado, COUNT(*) AS cancelaciones
                    FROM cancelacion WHERE date_trunc('day', registrada_en) = d.dia) k
ORDER BY d.dia DESC;

-- 10 · Ventas por hora
CREATE VIEW v_ventas_por_hora AS
SELECT  date_trunc('day', c.cerrada_en) AS dia, EXTRACT(HOUR FROM c.cerrada_en)::int AS hora,
        SUM(fn_total_comanda(c.id)) AS ventas, COUNT(*) AS tickets
FROM comanda c
WHERE c.estado = 'cerrada'
GROUP BY 1, 2
ORDER BY 1, 2;

-- 10 · Reporte de cancelaciones
CREATE VIEW v_cancelaciones AS
SELECT  k.id, k.registrada_en AS hora, k.tipo, e.etiqueta AS tipo_etiqueta, c.folio AS comanda, m.numero AS mesa,
        d.nombre_producto AS producto, d.cantidad, k.motivo, k.monto,
        us.nombre_completo AS solicito, ua.nombre_completo AS autorizo
FROM cancelacion k
JOIN comanda c              ON c.id = k.comanda_id
JOIN mesa m                 ON m.id = c.mesa_id
LEFT JOIN detalle_comanda d ON d.id = k.detalle_comanda_id
JOIN usuario us             ON us.id = k.solicitado_por_usuario_id
JOIN usuario ua             ON ua.id = k.autorizado_por_usuario_id
LEFT JOIN etiqueta_estado e ON e.dominio = 'tipo_cancelacion' AND e.valor = k.tipo::text
ORDER BY k.registrada_en;


-- ---------------------------------------------------------------------
-- 13. DATOS SEMILLA (catálogos que usan las pantallas)
-- ---------------------------------------------------------------------
INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('restaurante.nombre',              'KitchenLink',        'Nombre que aparece en el ticket'),
    ('restaurante.sucursal',            'Sucursal Centro',    'Sucursal impresa en el ticket'),
    ('restaurante.rfc',                 'KIT240101XY9',       'RFC impreso en el ticket'),
    ('restaurante.direccion',           'Av. Principal 123',  'Dirección impresa en el ticket'),
    ('impuesto.tasa',                   '0.1600',             'Tasa de IVA (se congela en la comanda al pedir la cuenta)'),
    ('propina.sugerida',                '0.1000',             '07 · Propina sugerida en el pre-ticket (no se suma)'),
    ('reservacion.tolerancia_min',      '15',                 '03a · Tolerancia de llegada'),
    ('reservacion.duracion_min',        '120',                '03a · Duración de la reservación'),
    ('reservacion.apartado_previo_min', '30',                 '03a · La mesa se aparta N minutos antes'),
    ('reporte.rotacion_optima_min',     '60',                 '10 · Hasta este promedio la rotación es Óptima'),
    ('reporte.rotacion_critica_min',    '90',                 '10 · Arriba de este promedio es Crítica (entre ambos: Alta)'),
    ('folio.comanda.prefijo',           'C-',                 'Prefijo del folio de comanda (también es el folio del ticket)'),
    ('folio.corte.prefijo',             'Z-',                 'Prefijo de folio de corte de caja');

-- Texto y color de cada estado tal como aparecen en Figma
INSERT INTO etiqueta_estado (dominio, valor, etiqueta, tono, orden, calculado) VALUES
    ('estado_usuario','pendiente','Pendiente','warn',1,false),
    ('estado_usuario','activo','Activo','ok',2,false),
    ('estado_usuario','dado_de_baja','Dado de baja','gray',3,false),
    ('estado_mesa','libre','Libre','ok',1,false),
    ('estado_mesa','reservada','Reservada','info',2,false),
    ('estado_mesa','por_atender','Por atender','info',3,false),
    ('estado_mesa','comanda_abierta','Comanda abierta','purple',4,false),
    ('estado_mesa','por_cobrar','Por cobrar','warn',5,false),
    ('estado_mesa','bloqueada','Bloqueada','bad',6,false),
    ('estado_reservacion','por_confirmar','Por confirmar','gray',1,false),
    ('estado_reservacion','confirmada','Confirmada','info',2,false),
    ('estado_reservacion','en_tolerancia','En tolerancia','warn',3,true),
    ('estado_reservacion','sentada','Sentada','ok',4,false),
    ('estado_reservacion','no_se_presento','No se presentó','bad',5,false),
    ('estado_reservacion','cancelada','Cancelada','gray',6,false),
    ('estado_espera','en_espera','En espera','warn',1,false),
    ('estado_espera','sentada','Sentada','ok',2,false),
    ('estado_espera','retirada','Retirada','gray',3,false),
    ('estado_comanda','abierta','Abierta','ok',1,false),
    ('estado_comanda','por_cobrar','Por cobrar','warn',2,false),
    ('estado_comanda','cerrada','Cerrada','gray',3,false),
    ('estado_comanda','cancelada','Cancelada','bad',4,false),
    ('estado_linea','sin_enviar','Sin enviar','purple',1,false),
    ('estado_linea','por_preparar','Por preparar','gray',2,false),
    ('estado_linea','en_preparacion','En preparación','warn',3,false),
    ('estado_linea','listo','Listo','ok',4,false),
    ('estado_linea','entregado','Entregado','ok',5,false),
    ('estado_linea','cancelado','Cancelado','bad',6,false),
    ('destino_produccion','cocina','Cocina','gray',1,false),
    ('destino_produccion','barra','Barra','gray',2,false),
    ('metodo_pago','efectivo','Efectivo','gray',1,false),
    ('metodo_pago','tarjeta','Tarjeta','gray',2,false),
    ('metodo_pago','transferencia','Transferencia','gray',3,false),
    ('estado_corte','abierto','Abierto','ok',1,false),
    ('estado_corte','cerrado','Cerrado','gray',2,false),
    ('tipo_cancelacion','producto','Producto','bad',1,false),
    ('tipo_cancelacion','comanda','Comanda','bad',2,false);

-- Roles de 02c (Gerente es del sistema)
INSERT INTO rol (nombre, descripcion, es_sistema) VALUES
    ('Gerente',            'Acceso total al sistema',                          TRUE),
    ('Hostess',            'Reservaciones, lista de espera y estado de mesas', FALSE),
    ('Mesero',             'Toma y da seguimiento a las comandas de sus mesas', FALSE),
    ('Jefe de cocina',     'Panel de cocina y productos 86',                   FALSE),
    ('Encargado de barra', 'Panel de barra',                                   FALSE),
    ('Cajera',             'Pre-tickets, cobro, tickets y cortes de caja',     FALSE);

-- Los 17 permisos de 02c, con el texto y el módulo de la pantalla.
-- (El trigger tg_permiso_nuevo se los asigna todos al Gerente.)
INSERT INTO permiso (clave, nombre, modulo, orden) VALUES
    ('comanda.abrir',             'Abrir y modificar comandas',                 'Servicio',        1),
    ('comanda.pedir_cuenta',      'Pedir la cuenta',                            'Servicio',        2),
    ('comanda.cancelar',          'Cancelar productos o comandas',              'Servicio',        3),
    ('mesa.ver',                  'Ver el estado de las mesas',                 'Salón',           4),
    ('mesa.administrar',          'Crear y bloquear mesas',                     'Salón',           5),
    ('reservacion.gestionar',     'Gestionar reservaciones y lista de espera',  'Recepción',       6),
    ('produccion.ver',            'Ver el panel de cocina y barra',             'Cocina y barra',  7),
    ('produccion.cambiar_estado', 'Cambiar el estado de los platillos',         'Cocina y barra',  8),
    ('pago.registrar',            'Registrar pagos',                            'Caja',            9),
    ('ticket.pre_ticket',         'Generar y cancelar pre-tickets',             'Caja',           10),
    ('ticket.emitir',             'Emitir y reimprimir tickets',                'Caja',           11),
    ('caja.corte',                'Arqueo y cortes de caja',                    'Caja',           12),
    ('menu.administrar',          'Administrar menú y productos',               'Gerencia',       13),
    ('menu.asignar_86',           'Asignar 86 a productos',                     'Gerencia',       14),
    ('reporte.ver',               'Consultar reportes',                         'Gerencia',       15),
    ('usuario.administrar',       'Administrar usuarios',                       'Seguridad',      16),
    ('rol.administrar',           'Administrar roles y permisos',               'Seguridad',      17);
UPDATE permiso SET descripcion = 'Autoriza cancelaciones. También deja atender o transferir la comanda de otro mesero (es el permiso de supervisión del gerente).'
WHERE clave = 'comanda.cancelar';
UPDATE permiso SET descripcion = 'Imprimir el pre-ticket (se genera de la comanda) y cancelarlo: la comanda vuelve a Abierta.'
WHERE clave = 'ticket.pre_ticket';
UPDATE permiso SET descripcion = 'El ticket se genera de la comanda y sus pagos; no se guarda. Reimprimir = volver a generarlo.'
WHERE clave = 'ticket.emitir';

INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
FROM rol r JOIN permiso p ON (r.nombre, p.clave) IN (
    ('Hostess','mesa.ver'), ('Hostess','mesa.administrar'), ('Hostess','reservacion.gestionar'),   -- 04: "Bloqueada por Hostess"
    ('Mesero','comanda.abrir'), ('Mesero','comanda.pedir_cuenta'), ('Mesero','mesa.ver'),
    ('Jefe de cocina','produccion.ver'), ('Jefe de cocina','produccion.cambiar_estado'), ('Jefe de cocina','menu.asignar_86'),
    ('Encargado de barra','produccion.ver'), ('Encargado de barra','produccion.cambiar_estado'),
    ('Cajera','mesa.ver'), ('Cajera','pago.registrar'), ('Cajera','ticket.pre_ticket'), ('Cajera','ticket.emitir'), ('Cajera','caja.corte'));

COMMIT;

-- Recomendado una sola vez (para no escribir "kitchenlink." en cada consulta):
--   ALTER DATABASE kitchenlink SET search_path TO kitchenlink, public;
-- =====================================================================
--  FIN DEL SCRIPT
-- =====================================================================
