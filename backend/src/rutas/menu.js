// /api/menu · 09 Menú y productos
//   Consultar: quien administra el menú, asigna 86, toma comandas o ve el panel de cocina.
//   Cambiar: «Administrar menú y productos». Asignar o quitar 86 y su historial: «Asignar 86 a productos».
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import * as menu from '../servicios/menu.js';
import { cambia, id, tiene, yo } from './ayudantes.js';

const router = Router();
router.use(autenticar());

const categoria = id('categoría');
const producto = id('producto');
const administra = exigirPermiso('menu.administrar');

router.get('/', exigirPermiso('menu.administrar', 'menu.asignar_86', 'comanda.abrir', 'produccion.ver'),
  async (req, res) => res.json(await menu.catalogo({ todo: tiene(req, 'menu.administrar') })));

router.post('/categorias', administra, cambia(['menu'], (req) => menu.crearCategoria(req.body, yo(req)), 201));
router.put('/categorias/:id', administra, cambia(['menu'], (req) => menu.editarCategoria(categoria(req), req.body, yo(req))));
router.post('/categorias/:id/dar-de-baja', administra, cambia(['menu'], (req) => menu.darDeBajaCategoria(categoria(req), yo(req))));
router.post('/categorias/:id/reactivar', administra, cambia(['menu'], (req) => menu.reactivarCategoria(categoria(req), yo(req))));

router.post('/productos', administra, cambia(['menu'], (req) => menu.crearProducto(req.body, yo(req)), 201));
router.put('/productos/:id', administra, cambia(['menu'], (req) => menu.editarProducto(producto(req), req.body, yo(req))));
router.post('/productos/:id/dar-de-baja', administra, cambia(['menu'], (req) => menu.darDeBajaProducto(producto(req), yo(req))));
router.post('/productos/:id/reactivar', administra, cambia(['menu'], (req) => menu.reactivarProducto(producto(req), yo(req))));

const asigna86 = exigirPermiso('menu.asignar_86');
router.get('/86', exigirPermiso('menu.administrar', 'menu.asignar_86'), async (_req, res) => res.json(await menu.historial86()));
router.post('/productos/:id/asignar-86', asigna86, cambia(['menu'], (req) => menu.asignar86(producto(req), req.body, yo(req))));
router.post('/productos/:id/quitar-86', asigna86, cambia(['menu'], (req) => menu.quitar86(producto(req), yo(req))));

export default router;
