# Menú, categorías y productos (pantalla 09)

Caso de uso **Gestionar menú, categorías y productos**. La misma pantalla tiene tres usos, según los
permisos del rol:

| Quién | Menú lateral | Qué puede hacer |
|---|---|---|
| Gerente («Administrar menú y productos») | Menú y productos | Todo: productos, categorías, 86 |
| Jefe de cocina («Asignar 86 a productos») | Productos 86 | Asignar o quitar el 86 |
| Mesero (toma comandas) | Menú | Consultar qué hay y qué está agotado |

```
09 Productos ── categorías (con Cocina / Barra) ── productos de la categoría ── buscar en todo el menú
   ├─ Nuevo producto / Editar ── categoría, nombre, descripción, precio ── Quitar del menú (se puede regresar)
   ├─ Asignar 86 ── motivo ──► "Asignado 86": sigue en el menú pero no se puede capturar en 05b
   └─ Quitar 86 ──► Disponible
09 Categorías ── nombre, "Se prepara en" (Cocina | Barra), orden en el menú ── Dar de baja (solo vacía) · Reactivar
```

## Rutas de la API

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/menu` | menú, 86, comandas o panel de cocina | `{ categorias, productos }` (quien administra ve también lo dado de baja) |
| `POST /api/menu/categorias` · `PUT /api/menu/categorias/:id` | `menu.administrar` | `{ nombre, descripcion, destino, orden }` |
| `POST /api/menu/categorias/:id/dar-de-baja` · `/reactivar` | `menu.administrar` | |
| `POST /api/menu/productos` · `PUT /api/menu/productos/:id` | `menu.administrar` | `{ categoria_id, nombre, descripcion, precio }` |
| `POST /api/menu/productos/:id/dar-de-baja` · `/reactivar` | `menu.administrar` | "Quitar del menú" / "Regresar al menú" |
| `POST /api/menu/productos/:id/asignar-86` · `/quitar-86` | `menu.asignar_86` | `{ motivo }` al asignar |

## Decisiones (y por qué)

**Cocina o barra lo decide la categoría, no el producto** (esquema v3). Por eso el formulario de producto
no pregunta el destino: lo explica la ayuda del selector de categoría.

**El precio se guarda exacto.** Llega como texto (`"$1,250.5"` se acepta) y se guarda en `NUMERIC(10,2)`
sin pasar por punto flotante. Cambiar el precio **no altera** las comandas ya capturadas: el precio se
congela en la línea al capturarla (lo hace la base).

**Nada se borra.** Un producto se "quita del menú" (`activo = false`) y una categoría se da de baja, porque
las comandas y los reportes los usan. Una categoría con productos no se da de baja: primero se mueven o se
quitan del menú.

**Nombres sin repetirse**, sin importar mayúsculas: no puede haber "Bebidas" y "BEBIDAS", ni dos
"Margarita" en Bar (sí una en Bar y otra en Bebidas).

**El 86 pide motivo** y queda en la bitácora con quién lo hizo (lo registra el trigger
`tg_producto_bitacora`). La base también revisa el permiso. Con 86, el mesero ve "86 · agotado" y la base
rechaza capturarlo.

**Todo cambio queda en la bitácora**: altas, ediciones (con el valor anterior y el nuevo) y bajas.

**El término de la carne o "sin cebolla" no son productos**: van en la nota de cada producto al tomar la
orden (05b). Un extra con costo se da de alta como producto.

## Pruebas automáticas (`npm test`)

`backend/test/menu.test.js` — 14 pruebas: catálogo con categorías, destino y 86; quién consulta y quién
cambia; nueva categoría al final y en la bitácora; nombres repetidos y datos inválidos; editar "Se prepara
en"; dar de baja una categoría; nuevo producto con el precio exacto; el cambio de precio no altera comandas;
asignar y quitar 86; quitar del menú y regresarlo. Al mismo tiempo: dar de baja una categoría mientras le
agregan un producto, y la misma categoría creada dos veces.
