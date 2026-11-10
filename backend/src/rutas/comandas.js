// /api/comandas · 05a Abrir comanda · 05b Comanda · historial de comandas
//   Trabajar la comanda: «Abrir y modificar comandas» (y la base revisa que sea su mesero o el gerente).
//   Consultar: también caja y reportes.
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import { exigirModulo, habilitado } from '../cronograma.js';
import { ErrorHttp } from '../errores.js';
import * as comandas from '../servicios/comandas.js';
import { cambia, id, tiene, yo } from './ayudantes.js';

const router = Router();
router.use(autenticar());

const comanda = id('comanda');
const linea = (req) => id('producto en la comanda')({ params: { id: req.params.linea } });
const consulta = exigirPermiso('comanda.abrir', 'pago.registrar', 'ticket.pre_ticket', 'reporte.ver');
const trabaja = exigirPermiso('comanda.abrir');
const modulo = exigirModulo('comandas');
const temas = ['comandas', 'mesas'];
const conCocina = ['comandas', 'mesas', 'produccion'];

// El mesero ve sus comandas; quien supervisa (cancela), cobra o ve reportes, todas
const soloLasSuyas = (req) => tiene(req, 'comanda.abrir') && !tiene(req, 'comanda.cancelar')
  && !tiene(req, 'pago.registrar') && !tiene(req, 'ticket.pre_ticket') && !tiene(req, 'reporte.ver');

router.get('/', consulta, async (req, res) => {
  const vista = req.query.vista === 'historial' ? 'historial' : 'activas';
  // Comandas abiertas: Gestionar comanda (4 nov) · historial del día: Historial de comandas (11 nov)
  if (!habilitado(vista === 'historial' ? 'historial_comandas' : 'comandas')) {
    throw new ErrorHttp(404, 'NO_ENCONTRADO', `No existe GET ${req.originalUrl}`);
  }
  res.json(await comandas.listar({ vista, fecha: req.query.fecha, meseroId: soloLasSuyas(req) ? yo(req) : null }));
});

router.get('/meseros', modulo, trabaja, async (_req, res) => res.json(await comandas.meseros()));
router.get('/:id', modulo, consulta, async (req, res) => res.json(await comandas.detalle(comanda(req), yo(req))));

router.post('/', modulo, trabaja, cambia(temas, (req) => comandas.abrir(req.body, yo(req)), 201));
router.post('/:id/productos', modulo, trabaja, cambia(temas, (req) => comandas.agregarProducto(comanda(req), req.body, yo(req))));
router.put('/:id/productos/:linea', modulo, trabaja, cambia(temas, (req) => comandas.editarProducto(comanda(req), linea(req), req.body, yo(req))));
router.delete('/:id/productos/:linea', modulo, trabaja, cambia(temas, (req) => comandas.quitarProducto(comanda(req), linea(req), yo(req))));
router.post('/:id/productos/:linea/cancelar', modulo, trabaja,
  cambia(conCocina, (req) => comandas.cancelarProducto(comanda(req), linea(req), req.body, yo(req), req.ip)));
router.post('/:id/enviar', modulo, trabaja, cambia(conCocina, (req) => comandas.enviar(comanda(req), yo(req))));
router.post('/:id/entregar', modulo, trabaja, cambia(conCocina, (req) => comandas.entregar(comanda(req), req.body, yo(req))));
router.post('/:id/pedir-cuenta', modulo, exigirPermiso('comanda.pedir_cuenta'),
  cambia([...temas, 'caja'], (req) => comandas.pedirCuenta(comanda(req), yo(req))));
router.put('/:id/nota', modulo, trabaja, cambia(conCocina, (req) => comandas.cambiarNota(comanda(req), req.body, yo(req))));
router.post('/:id/transferir', modulo, trabaja, cambia(temas, (req) => comandas.transferir(comanda(req), req.body, yo(req))));
router.post('/:id/cancelar', modulo, trabaja,
  cambia([...conCocina, 'caja'], (req) => comandas.cancelarComanda(comanda(req), req.body, yo(req), req.ip)));

// Operaciones de mesas (28 oct): cambio de mesa o de personas
const operaciones = exigirModulo('operaciones_mesas');
router.put('/:id/mesa', operaciones, trabaja, cambia(conCocina, (req) => comandas.cambiarMesa(comanda(req), req.body, yo(req))));
router.put('/:id/personas', operaciones, trabaja, cambia(temas, (req) => comandas.cambiarPersonas(comanda(req), req.body, yo(req))));

export default router;
