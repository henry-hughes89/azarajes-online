# AZARAJES Online v0.5 — Servidor Cloudflare

Motor de reglas **v0.6** independiente del navegador. Una sala contiene dos asientos, A y B; cada asiento controla dos autómatas. El Durable Object `Room` almacena el estado oficial y transmite las actualizaciones.

## Archivos para el repositorio `henry-hughes89/azarajes-online`

- `src/index.js` — Worker, salas, autenticación, WebSockets y acciones.
- `src/engine.js` — motor determinista de reglas v0.6. **Nuevo y obligatorio.**
- `src/board.js` — configuración exacta de las 40 estaciones. **Nuevo y obligatorio.**
- `src/protocol.js` — funciones del protocolo; sin modificaciones importantes respecto de v0.1.
- `package.json` — scripts actualizados para verificar el motor.
- `wrangler.jsonc` — conserva el Worker existente `azarajes-online` y su Durable Object `Room` (no crear otro Worker).
- `test/*.test.js` — 20 pruebas (unitarias y de 200 partidas simuladas).
- `.gitignore` — evita subir nuevos `node_modules` al repositorio; no borra los ya registrados.

### Actualización sin terminal (desde Chrome)

1. Abrir https://github.com/henry-hughes89/azarajes-online/tree/main/src y usar **Add file → Upload files**. Elegir, desde la carpeta `src` descomprimida, los tres archivos `index.js`, `engine.js`, `board.js`. Deben quedar exactamente en `src/`, NO en la raíz.
2. En la raíz del repositorio, reemplazar `package.json` por el del paquete (opcional para el funcionamiento, recomendado para que Cloudflare ejecute los tests nuevos).
3. En https://github.com/henry-hughes89/azarajes-online/tree/main/test, subir `engine.test.js` y `stress.test.js`. El `protocol.test.js` existente puede conservarse (opcional si los tests actuales todavía no se actualizaron).
4. Confirmar los cambios en la rama `main`. Cloudflare tiene compilación automática configurada: `npm run check` y despliegue `npx wrangler deploy`.
5. Comprobar el historial de compilación de `azarajes-online` en Cloudflare. Debe estar correcto y **ser posterior a la subida**.
6. Abrir https://azarajes-online.cerconexo-piloto-h89.workers.dev/health . La respuesta correcta debe incluir `"rulesEngine":true` y `"service":"AZARAJES Online v0.5"`.

**No borrar** el Worker, no cambiar el nombre `azarajes-online`, ni cambiar el dominio de la cuenta (compartido con CERCONEXO). `wrangler.jsonc` conserva el esquema declarativo de Durable Objects que ya funciona en Cloudflare. La vista previa permanece deshabilitada.

## Protocolo básico

- `POST /api/rooms`: crea sala y credencial privada del equipo A.
- `POST /api/rooms/CODIGO/join`: otorga credencial B si aún no hay rival.
- `GET /api/rooms/CODIGO/state`: consulta estado, con `Authorization: Bearer <token>`.
- `POST /api/rooms/CODIGO/ws-ticket`: entrega boleto WebSocket de un uso para ese asiento.
- `GET /api/rooms/CODIGO/ws?ticket=...`: actualizaciones de presencia, turnos, tablero y decisiones.
- `POST /api/rooms/CODIGO/action`: acciones autenticadas `{revision,action}` con validación de turno y fase. Acciones: `roll`, `declare`, `special`, `shared`.

Al desconectarse uno de los dos participantes, las acciones quedan pausadas; el progreso permanece guardado para reingresar. No existe un modo de observador ni un tercer asiento.

## Pruebas locales

`npm install` y `npm run check` ejecutan 20 pruebas sin necesidad de Cloudflare. Se verifican casos de paridad, orden de movimientos, compartidas, reaplicación de funciones, Meta y 200 partidas completas reproducibles.

## Advertencias

Este paquete se probó localmente pero **no se ha desplegado ni verificado en la cuenta Cloudflare real** desde este entorno. La prueba completa con dos dispositivos debe hacerse tras la publicación de frontend y backend. Los estados de los autómatas se muestran al recibir la respuesta oficial; las transiciones cinemáticas en tiempo real se encuentran simplificadas frente al modo local v0.4.4.
