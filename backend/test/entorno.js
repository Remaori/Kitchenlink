// Se importa ANTES que todo en cada prueba: usa una base aparte para no
// borrar los datos de desarrollo, y límites chicos para probar rápido.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_PRUEBAS || 'kitchenlink_pruebas';
process.env.BCRYPT_COSTO = '4';
process.env.INTENTOS_MAX = '3';
process.env.INTENTOS_MAX_EQUIPO = '6';
process.env.SESION_HORAS = '12';
