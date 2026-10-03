// /api/usuarios · 02a (por ahora solo la lista; altas y cambios van en la siguiente tarea)
import { Router } from 'express';
import { consulta } from '../db.js';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';

const router = Router();

router.get('/', autenticar(), exigirPermiso('usuario.administrar'), async (_req, res) => {
  const { rows } = await consulta(
    `SELECT id, nombre_completo, nombre_usuario, rol, estado, estado_etiqueta, estado_tono,
            en_linea, ultimo_acceso, aviso
     FROM v_usuarios`);
  res.json(rows);
});

export default router;
