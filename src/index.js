import {DurableObject} from 'cloudflare:workers';
import {APP_ORIGIN,CODE_LENGTH,makeRoomCode,validCode,isAllowedOrigin,MAX_WS_MESSAGE_BYTES,WS_TICKET_TTL_MS,publicRoomState} from './protocol.js';
import {newGame,applyAction,publicGame} from './engine.js';
const json=(d,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>json({ok:false,error:message},status);
const secret=()=>crypto.randomUUID()+'-'+crypto.randomUUID();
const bearer=r=>/^Bearer (.+)$/.exec(r.headers.get('authorization')||'')?.[1]||'';
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('origin');
  const cors={'Access-Control-Allow-Origin':env.APP_ORIGIN||APP_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Vary':'Origin','Cache-Control':'no-store'};
  const wrap=r=>{const h=new Headers(r.headers);for(const [k,v] of Object.entries(cors))h.set(k,v);return new Response(r.body,{status:r.status,headers:h});};
  if(origin&&!isAllowedOrigin(origin,env.APP_ORIGIN||APP_ORIGIN))return wrap(fail('Origen no autorizado',403));
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(url.pathname==='/health'&&request.method==='GET')return wrap(json({ok:true,service:'AZARAJES Online v0.5',rulesEngine:true,rules:'v0.6'}));
  if(url.pathname==='/api/rooms'&&request.method==='POST'){
   for(let n=0;n<8;n++){
    const code=makeRoomCode(crypto.getRandomValues(new Uint8Array(CODE_LENGTH))),token=secret();
    const stub=env.ROOMS.getByName(code);
    const r=await stub.fetch(new Request('https://room/internal/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,token})}));
    if(r.status===409)continue;
    return wrap(r);
   }
   return wrap(fail('No se pudo crear una sala',503));
  }
  const match=/^\/api\/rooms\/([A-Z0-9]{8})\/(join|state|ws-ticket|ws|action)$/.exec(url.pathname);
  if(!match||!validCode(match[1]))return wrap(fail('Ruta o código de sala inválido',404));
  const [,code,op]=match;
  if(op==='ws'){
   if(request.method!=='GET'||!request.headers.get('upgrade')?.toLowerCase().includes('websocket'))return wrap(fail('Se requiere WebSocket',426));
  }else if(op==='state'?request.method!=='GET':request.method!=='POST')return wrap(fail('Método no permitido',405));
  const forwarded=new URL(request.url);forwarded.pathname='/internal/'+op;
  const response=await env.ROOMS.getByName(code).fetch(new Request(forwarded,request));
  return op==='ws'?response:wrap(response);
 }
};
export class Room extends DurableObject {
 async load(){return await this.ctx.storage.get('room');}
 async save(room){await this.ctx.storage.put('room',room);}
 activeSeats(){return this.ctx.getWebSockets().map(ws=>ws.deserializeAttachment()?.seat).filter(Boolean);}
 roomPublic(room){return {...publicRoomState(room,this.activeSeats()),game:publicGame(room.game)};}
 broadcast(room){const p=JSON.stringify({type:'room_state',room:this.roomPublic(room)});for(const ws of this.ctx.getWebSockets()){try{ws.send(p)}catch{}}}
 async fetch(request){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/internal/create'&&request.method==='POST')return this.ctx.blockConcurrencyWhile(async()=>{
   if(await this.load())return fail('La sala ya existe',409);
   const {code,token}=await request.json();if(!validCode(code)||typeof token!=='string'||token.length<30)return fail('Datos incorrectos');
   const room={code,phase:'waiting',A:token,B:null,game:null,createdAt:Date.now()};await this.save(room);
   return json({ok:true,code,seat:'A',token,phase:'waiting'},201);
  });
  let room=await this.load();if(!room)return fail('La sala no existe',404);
  if(path==='/internal/join'&&request.method==='POST')return this.ctx.blockConcurrencyWhile(async()=>{
   room=await this.load();if(room.B)return fail('La sala ya tiene dos jugadores',409);
   room.B=secret();room.phase='ready';room.game=newGame();await this.save(room);this.broadcast(room);
   return json({ok:true,code:room.code,seat:'B',token:room.B,phase:'ready'});
  });
  if(path==='/internal/ws'&&request.method==='GET'){
   const ticket=url.searchParams.get('ticket')||'';
   const record=await this.ctx.storage.get('ticket:'+ticket);
   if(!ticket||!record||record.expiresAt<Date.now())return fail('La conexión expiró',401);
   await this.ctx.storage.delete('ticket:'+ticket);
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   for(const previous of this.ctx.getWebSockets())if(previous.deserializeAttachment()?.seat===record.seat)try{previous.close(4001,'Sesión abierta en otra ventana')}catch{}
   this.ctx.acceptWebSocket(server);server.serializeAttachment({seat:record.seat});
   server.send(JSON.stringify({type:'welcome',seat:record.seat,room:this.roomPublic(room)}));this.broadcast(room);
   return new Response(null,{status:101,webSocket:client});
  }
  const token=bearer(request),seat=token===room.A?'A':token===room.B?'B':null;
  if(!seat)return fail('Credencial inválida',401);
  if(path==='/internal/state'&&request.method==='GET')return json({ok:true,seat,room:this.roomPublic(room)});
  if(path==='/internal/ws-ticket'&&request.method==='POST'){
   const ticket=secret();await this.ctx.storage.put('ticket:'+ticket,{seat,expiresAt:Date.now()+WS_TICKET_TTL_MS});
   return json({ok:true,ticket,expiresInSeconds:60});
  }
  if(path==='/internal/action'&&request.method==='POST')return this.ctx.blockConcurrencyWhile(async()=>{
   room=await this.load();if(!room?.B||!room.game)return fail('Esperando al rival',409);
   const active=this.activeSeats();if(!active.includes('A')||!active.includes('B'))return fail('Partida pausada: ambos jugadores deben estar conectados',409);
   const curSeat=token===room.A?'A':token===room.B?'B':null;if(!curSeat)return fail('Credencial inválida',401);
   const input=await request.json().catch(()=>null);
   if(!input||typeof input!=='object'||JSON.stringify(input).length>3000)return fail('Acción no válida');
   if(input.revision!==room.game.revision)return json({ok:false,error:'El estado cambió. Se actualizará la partida.',room:this.roomPublic(room)},409);
   try{applyAction(room.game,curSeat,input.action);}catch(e){return json({ok:false,error:String(e?.message||e),room:this.roomPublic(room)},409);}
   await this.save(room);this.broadcast(room);return json({ok:true,room:this.roomPublic(room)});
  });
  return fail('Acción no disponible',404);
 }
 async webSocketMessage(ws,message){
  if(typeof message!=='string'||new TextEncoder().encode(message).byteLength>MAX_WS_MESSAGE_BYTES){ws.send(JSON.stringify({type:'error',message:'Mensaje no válido'}));return;}
  let data;try{data=JSON.parse(message)}catch{ws.send(JSON.stringify({type:'error',message:'JSON inválido'}));return;}
  if(data?.type==='ping'){ws.send(JSON.stringify({type:'pong'}));return;}
  ws.send(JSON.stringify({type:'error',message:'Envía las acciones mediante el endpoint autenticado.'}));
 }
 async webSocketClose(){const r=await this.load();if(r)this.broadcast(r);}
 async webSocketError(ws){try{ws.close(1011,'Error de conexión')}catch{}const r=await this.load();if(r)this.broadcast(r);}
}
