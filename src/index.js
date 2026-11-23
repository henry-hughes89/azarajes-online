import { DurableObject } from 'cloudflare:workers';
import {APP_ORIGIN, CODE_LENGTH, makeRoomCode, validCode, isAllowedOrigin, MAX_WS_MESSAGE_BYTES, WS_TICKET_TTL_MS, publicRoomState} from './protocol.js';

const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control':'no-store'}});
const fail = (message, status = 400) => json({ok:false, error:message}, status);
const randomSecret = () => crypto.randomUUID() + '-' + crypto.randomUUID();
const auth = (r) => /^Bearer (.+)$/.exec(r.headers.get('authorization') || '')?.[1] || '';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const cors = {'Access-Control-Allow-Origin':env.APP_ORIGIN || APP_ORIGIN,
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':'Authorization,Content-Type',
      'Vary':'Origin', 'Cache-Control':'no-store'};
    const headers = (response) => {
      const h = new Headers(response.headers);
      for (const [k,v] of Object.entries(cors)) h.set(k,v);
      return new Response(response.body,{status:response.status,headers:h});
    };
    if (origin && !isAllowedOrigin(origin, env.APP_ORIGIN || APP_ORIGIN)) return fail('Origen no autorizado',403);
    if (request.method === 'OPTIONS') return new Response(null, {status:204,headers:cors});
    if (url.pathname === '/health' && request.method === 'GET') return headers(json({ok:true, service:'AZARAJES salas v0.1', rulesEngine:false}));

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let i=0;i<6;i++) {
        const code = makeRoomCode(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)));
        const token = randomSecret();
        const stub = env.ROOMS.getByName(code);
        const resp = await stub.fetch(new Request('https://room/internal/create', {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,token})
        }));
        if (resp.status === 409) continue;
        return headers(resp);
      }
      return headers(fail('No fue posible crear la sala',503));
    }

    const match = /^\/api\/rooms\/([A-Z0-9]{8})\/(join|state|ws-ticket|ws)$/.exec(url.pathname);
    if (!match || !validCode(match[1])) return headers(fail('Ruta o código de sala inválido',404));
    const [,,code,operation] = match;
    const upgrade = operation === 'ws';
    if (upgrade && !(request.headers.get('upgrade') || '').toLowerCase().includes('websocket')) {
      return headers(fail('Se requiere WebSocket',426));
    }
    if (!upgrade && ((operation==='state'&&request.method!=='GET')||(operation!=='state'&&request.method!=='POST'))) {
      return headers(fail('Método no permitido',405));
    }
    const stub = env.ROOMS.getByName(code);
    const forwarded = new URL(request.url);
    forwarded.pathname = '/internal/' + operation;
    const response = await stub.fetch(new Request(forwarded,request));
    // WebSocket 101 debe devolverse íntegro: no reconstruir su Response.
    return upgrade ? response : headers(response);
  }
};

export class Room extends DurableObject {
  async load() { return await this.ctx.storage.get('room'); }
  async save(state) { await this.ctx.storage.put('room',state); }
  activeSeats() {
    return this.ctx.getWebSockets().map(ws => ws.deserializeAttachment()?.seat).filter(Boolean);
  }
  broadcast(state) {
    const payload=JSON.stringify({type:'room_state', room:publicRoomState(state,this.activeSeats())});
    for(const ws of this.ctx.getWebSockets()) {
      try{ws.send(payload);}catch{}
    }
  }
  async fetch(request) {
    const url = new URL(request.url);
    const endpoint=url.pathname;
    if (endpoint==='/internal/create'&&request.method==='POST') {
      if(await this.load()) return fail('La sala ya existe',409);
      const {code,token}=await request.json();
      if (!validCode(code)||typeof token!=='string'||token.length<30) return fail('Datos incorrectos');
      const room={code,phase:'waiting',A:token,B:null,createdAt:Date.now()};
      await this.save(room);
      return json({ok:true,code,seat:'A',token,phase:'waiting'},201);
    }
    const room=await this.load();
    if (!room) return fail('La sala no existe',404);
    if(endpoint==='/internal/join'&&request.method==='POST') {
      if(room.B) return fail('Sala completa',409);
      room.B=randomSecret();room.phase='ready';
      await this.save(room);
      this.broadcast(room);
      return json({ok:true,code:room.code,seat:'B',token:room.B,phase:room.phase});
    }
    if(endpoint==='/internal/ws'&&request.method==='GET') {
      const ticket=url.searchParams.get('ticket')||'';
      const record=await this.ctx.storage.get('ticket:'+ticket);
      if(!ticket||!record||record.expiresAt<Date.now()) return fail('Invitación de conexión expirada',401);
      await this.ctx.storage.delete('ticket:'+ticket);
      const pair=new WebSocketPair();
      const client=pair[0], server=pair[1];
      const seat=record.seat;
      for(const previous of this.ctx.getWebSockets()) {
        if(previous.deserializeAttachment()?.seat===seat) previous.close(4001,'Reconexión desde otra ventana');
      }
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({seat});
      server.send(JSON.stringify({type:'welcome',seat,room:publicRoomState(room,this.activeSeats())}));
      this.broadcast(room);
      return new Response(null,{status:101,webSocket:client});
    }
    const token=auth(request);
    const seat=token===room.A?'A':(token===room.B?'B':null);
    if(!seat) return fail('Credencial inválida',401);
    if(endpoint==='/internal/state'&&request.method==='GET') {
      return json({ok:true,seat,room:publicRoomState(room,this.activeSeats())});
    }
    if(endpoint==='/internal/ws-ticket'&&request.method==='POST') {
      const ticket=randomSecret();
      await this.ctx.storage.put('ticket:'+ticket,{seat,expiresAt:Date.now()+WS_TICKET_TTL_MS});
      return json({ok:true,ticket,expiresInSeconds:60});
    }
    return fail('Acción no disponible',404);
  }
  async webSocketMessage(ws,message) {
    if(typeof message!=='string'||new TextEncoder().encode(message).byteLength>MAX_WS_MESSAGE_BYTES){
      ws.send(JSON.stringify({type:'error',message:'Mensaje no válido'}));return;
    }
    let data;try{data=JSON.parse(message)}catch {ws.send(JSON.stringify({type:'error',message:'JSON inválido'}));return}
    if(data?.type==='ping') {
      ws.send(JSON.stringify({type:'pong'}));return;
    }
    // Aún no se admiten jugadas: deben validarse por el motor de reglas del servidor.
    ws.send(JSON.stringify({type:'not_ready',message:'La sincronización de jugadas se implementará en el siguiente paso.'}));
  }
  async webSocketClose(ws) {
    const room=await this.load();
    if(room) this.broadcast(room);
  }
  async webSocketError(ws) {
    try{ws.close(1011,'Error de conexión')}catch{}
    const room=await this.load();
    if(room) this.broadcast(room);
  }
}
