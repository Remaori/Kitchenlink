# Cómo contribuir

## Flujo de trabajo

1. `main` siempre funciona: cada cambio entra por Pull Request y la
   [integración continua](.github/workflows/pruebas.yml) corre las pruebas antes de integrarlo.
2. Cada tarea va en su propia rama, con prefijo: `feat/`, `fix/`, `docs/`, `test/`, `refactor/` o
   `chore/`. Por ejemplo, `feat/usuarios` o `fix/login-mensaje`.
   ```bash
   git switch main
   git pull
   git switch -c feat/lo-que-sea
   ```
3. Los commits son chicos y llevan prefijo ([Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/)),
   con el área opcional: `feat(api): …`, `fix(web): …`, `feat(bd): …`, `docs: …`, `test: …`, `chore: …`.
4. `git push -u origin feat/lo-que-sea` y abre el Pull Request en GitHub. La plantilla pide qué cambia y
   cómo se probó. Otra persona del equipo lo revisa antes del *merge*.

## Antes de abrir el Pull Request

- `npm test` y `npm run build` pasan en tu equipo. Las pruebas usan su propia base (`kitchenlink_pruebas`),
  así que no tocan tus datos.
- Si cambia algo que se ve, agrega una captura al Pull Request.
- Si cambia el comportamiento, actualiza la documentación del módulo en `docs/` y anota el cambio en
  [CHANGELOG.md](CHANGELOG.md).

## Convenciones del código

- **Idioma:** código, nombres, mensajes y documentación en español, como el resto del proyecto.
- **Formato:** UTF-8, finales de línea LF y 2 espacios (lo aplica [.editorconfig](.editorconfig)).
- **Reglas del negocio:** viven también en la base de datos (triggers en `database/01_esquema_v3.sql`).
  La API valida los datos y los permisos, pero la base es la última barrera.
- **Escrituras:** toda escritura pasa por `conTransaccion(usuarioId, …)` (`backend/src/db.js`), que le dice
  a la base quién hace la operación para que quede en la bitácora.
- **Errores:** la API responde con `ErrorHttp` (`backend/src/errores.js`): un código para el programa y un
  mensaje listo para mostrarse en pantalla.
- **Pruebas:** cada funcionalidad nueva lleva pruebas en `backend/test/` (node:test + supertest), y el
  archivo nuevo se agrega al script `test` de `backend/package.json`.

## Versiones

Las versiones siguen [Versionado Semántico](https://semver.org/lang/es/). En cada entrega:

1. Sube `version` en los tres `package.json` (raíz, `backend` y `frontend`).
2. Pasa los cambios de `CHANGELOG.md` a la nueva versión, con su fecha.
3. Crea la etiqueta y súbela:
   ```bash
   git tag -a v0.3.0 -m "KitchenLink 0.3.0"
   git push origin v0.3.0
   ```
4. Publica el release en GitHub (**Releases → Draft a new release**) con las notas del `CHANGELOG`.
