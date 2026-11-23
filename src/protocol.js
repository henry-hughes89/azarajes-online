// Funciones puras y comprobables por separado del runtime de Cloudflare.
export const CODE_LENGTH = 8;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
export const MAX_WS_MESSAGE_BYTES = 2048;
export const WS_TICKET_TTL_MS = 60_000;
export const APP_ORIGIN = "https://henry-hughes89.github.io";

export function makeRoomCode(randomBytes) {
  if (randomBytes.length < CODE_LENGTH) throw new Error("Faltan bytes aleatorios");
  return Array.from(randomBytes.slice(0, CODE_LENGTH), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export function validCode(code) {
  return typeof code === "string" && ROOM_CODE_RE.test(code);
}
export function isAllowedOrigin(origin, expected = APP_ORIGIN) {
  return origin === expected;
}
export function publicRoomState(state, connected = []) {
  return {
    code: state.code,
    phase: state.phase,
    seats: { A: true, B: Boolean(state.B) },
    online: { A: connected.includes("A"), B: connected.includes("B") },
    rules: "v0.6",
    gameMode: "1v1-two-automata-per-player",
  };
}
