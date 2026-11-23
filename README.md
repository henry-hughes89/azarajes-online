# AZARAJES online — Paso 2: salas y conexión

Este paquete prepara **solo el servidor de salas**. Todavía NO permite mover autómatas ni lanzar dados en línea. No reemplaza el HTML local v0.4.4.

## Requisitos
- Cuenta gratuita de Cloudflare: https://dash.cloudflare.com/
- Node.js y npm instalados en un ordenador.

## Despliegue
1. Descomprime el paquete en tu ordenador.
2. Abre una terminal en esa carpeta.
3. Ejecuta `npm install`.
4. Ejecuta `npm run check` (comprobaciones sintácticas y pruebas unitarias).
5. Ejecuta `npx wrangler login` y autoriza tu cuenta en el navegador.
6. Ejecuta `npm run deploy`.
7. Anota el dominio real que entregue Cloudflare, por ejemplo `https://azarajes-online.<TU-SUBDOMINIO>.workers.dev`.
8. Comprueba la dirección `/health`: debe devolver `{"ok":true,"service":"AZARAJES salas v0.1","rulesEngine":false}`.

Cloudflare permite Durable Objects de almacenamiento SQLite en Workers Free (con límites). La configuración utiliza el mecanismo moderno `exports`, no las migraciones antiguas.

## Endpoints disponibles
- `GET /health`: verificación del servicio.
- `POST /api/rooms`: crea una sala, devuelve código, puesto A y token privado.
- `POST /api/rooms/CODIGO/join`: une al segundo jugador, puesto B y token privado.
- `GET /api/rooms/CODIGO/state`: requiere `Authorization: Bearer TOKEN`.
- `POST /api/rooms/CODIGO/ws-ticket`: requiere `Authorization: Bearer TOKEN`; devuelve ticket de un solo uso, válido durante 60 segundos.
- `GET /api/rooms/CODIGO/ws?ticket=...`: conexión WebSocket, envía `welcome`, `room_state`, y admite `ping`/`pong`.

No publiques ni compartas el token privado de jugador. El enlace para invitar al rival debe contener **solo el código**, nunca el token.

## Falta para partidas reales (paso 3)
1. Extraer un motor único de reglas v0.6 y validarlo en el servidor.
2. Sincronizar lanzamientos, decisiones compartidas, cadenas y cierre de ronda.
3. Integrar el cliente online en la v0.4.4 sin alterar el modo local.
4. Pruebas con dos navegadores, reconexiones, carreras y acciones duplicadas.

**Estado de verificación:** las pruebas unitarias se ejecutaron con Node local. El Worker todavía no se ha desplegado en Cloudflare ni probado en su runtime real. No se ofrece como servidor listo para partidas.
