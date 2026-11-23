// AZARAJES v0.5 — motor de reglas v0.6 autoritativo, sin dependencias de UI.
import {MAP,BOARD} from './board.js';
export const IDS=['A1','A2','B1','B2'];
const teammate=i=>i%2===0?i+1:i-1;
export const destination=(from,delta)=>Math.min(40,Math.max(from===0?0:1,from+delta));
export const parity=v=>v%2?v:-v;
export const rollDie=()=>{const b=new Uint32Array(1);do{crypto.getRandomValues(b)}while(b[0]>=4294967292);return b[0]%6+1};
const same=a=>JSON.parse(JSON.stringify(a));
export function newGame(){return {
 version:'0.5.0',rules:'v0.6',revision:0,phase:'ROLL',pos:[0,0,0,0],team:0,round:1,
 dice:[null,null],assign:[null,null],finishPending:false,pending:null,tasks:[],steps:0,
 events:[],nextEvent:1,scores:null,winner:null,error:null
};}
export function validateAssignment(g,assign){
 if(!Array.isArray(assign)||assign.length!==2||assign.some(i=>!Number.isInteger(i)||i!==g.team*2&&i!==g.team*2+1))
  throw Error('Asigna los dos dados únicamente a tus autómatas.');
 if(g.dice.some(v=>!Number.isInteger(v)||v<1||v>6))throw Error('Los dados todavía no están disponibles.');
 const moves=new Map();assign.forEach((who,k)=>moves.set(who,(moves.get(who)||0)+g.dice[k]));
 for(const [who,total] of moves){
  if(g.pos[who]===40)throw Error(`${IDS[who]} ya llegó a Meta. Asigna los dados a su compañero.`);
  if(destination(g.pos[who],total)===40&&g.pos[teammate(who)]<20)
   throw Error(`Meta bloqueada: ${IDS[teammate(who)]} necesita alcanzar la estación 20.`);
 }
 return moves;
}
function ev(g,type,fields={}){
 g.events.push({id:g.nextEvent++,type,round:g.round,team:g.team===0?'A':'B',pos:[...g.pos],...fields});
 if(g.events.length>320)g.events.splice(0,g.events.length-320);
}
function move(g,who,to,kind,source=null){
 const from=g.pos[who];if(from===40)return false;
 const dest=destination(from,to-from);
 if(dest===40&&g.pos[teammate(who)]<20){ev(g,'meta_blocked',{who,from,to:dest,kind,source});return false;}
 if(dest===from)return false;
 g.pos[who]=dest;ev(g,'move',{who,from,to:dest,kind,source});
 if(dest===40){g.finishPending=true;ev(g,'meta_reached',{who,mate:teammate(who)});}
 return true;
}
const task=(type,...fields)=>({type,...Object.fromEntries(fields)});
function run(g){
 g.phase='MOVING';g.pending=null;
 let count=0;
 try{
 while(g.tasks.length){
  if(++count>3000)throw Error('Cadena de efectos demasiado extensa; se interrumpió para diagnóstico, sin alterar el estado registrado.');
  const t=g.tasks.pop();
  if(t.type==='turn_end'){
   ev(g,'turn_completed',{scores:[g.pos[0]+g.pos[1],g.pos[2]+g.pos[3]]});
   if(g.team===1&&g.finishPending){g.phase='OVER';g.scores=[g.pos[0]+g.pos[1],g.pos[2]+g.pos[3]];g.winner=g.scores[0]===g.scores[1]?'EMPATE':g.scores[0]>g.scores[1]?'A':'B';ev(g,'game_over',{winner:g.winner,scores:g.scores});return;}
   const was=g.team;g.team=1-g.team;if(was===1)g.round++;
   g.dice=[null,null];g.assign=[null,null];g.phase='ROLL';ev(g,'turn_advanced',{nextTeam:g.team});return;
  }
  if(t.type==='move'){
   if(move(g,t.who,t.to,t.kind,t.source))g.tasks.push({type:'effect',who:t.who});
   continue;
  }
  if(t.type==='batch'){
   // Ambos destinos se calculan desde el estado anterior a cualquier efecto.
   const origin={};for(const who of t.order)origin[who]=g.pos[who];
   const targets=Object.fromEntries(t.order.map(who=>[who,destination(origin[who],t.delta)]));
   ev(g,'shared_batch',{station:t.station,from:origin,to:targets,order:[...t.order]});
   const landed=[];
   for(const who of t.order){if(move(g,who,targets[who],'special',t.station))landed.push(who);}
   for(let j=landed.length-1;j>=0;j--)g.tasks.push({type:'effect',who:landed[j]});
   continue;
  }
  if(t.type!=='effect')throw Error('Tarea de motor desconocida.');
  const who=t.who,at=g.pos[who],info=MAP[at];
  if(!info||['inicio','normal','meta'].includes(info.kind))continue;
  g.steps++;ev(g,'effect',{who,station:at,kind:info.kind});
  if(info.to!=null){g.tasks.push({type:'move',who,to:info.to,kind:'tube',source:at});continue;}
  if(info.kind==='paridad'){
   g.pending={kind:'paridad',who,station:at};g.phase='SPECIAL';return;
  }
  if(info.kind==='comparte+'||info.kind==='comparte-'){
   g.pending={kind:'shared',who,station:at,delta:info.kind==='comparte+'?4:-4};g.phase='SHARED';return;
  }
  throw Error(`Función de casilla desconocida: ${info.kind}`);
 }
 throw Error('Secuencia de turno sin finalización.');
 }catch(e){g.phase='ERROR';g.error=String(e.message||e);ev(g,'engine_error',{message:g.error});}
}
export function applyAction(g,seat,action,random=rollDie){
 if(!g||!['A','B'].includes(seat))throw Error('Sala no preparada.');
 if(!action||typeof action!=='object'||typeof action.type!=='string')throw Error('Acción inválida.');
 if(g.phase==='OVER'||g.phase==='ERROR')throw Error('La partida ya terminó o necesita revisión.');
 if(seat!==(g.team===0?'A':'B'))throw Error('No es tu turno.');
 switch(action.type){
 case 'roll':{
  if(g.phase!=='ROLL')throw Error('Los dados no pueden lanzarse en esta fase.');
  g.dice=[random(),random()];if(g.dice.some(v=>!Number.isInteger(v)||v<1||v>6))throw Error('Generador de dados inválido.');
  g.assign=[null,null];g.phase='ASSIGN';ev(g,'roll',{dice:[...g.dice]});break;
 }
 case 'declare':{
  if(g.phase!=='ASSIGN')throw Error('No corresponde asignar dados ahora.');
  validateAssignment(g,action.assign);
  g.assign=[...action.assign];
  const a=action.assign.map((who,k)=>({who,value:g.dice[k]}));
  if(a[0].who===a[1].who){a.splice(0,2,{who:a[0].who,value:a[0].value+a[1].value});}
  else if(g.pos[a[0].who]===g.pos[a[1].who]){
   const first=action.tieFirst;if(first!==a[0].who&&first!==a[1].who)throw Error('Indica qué autómata actúa primero en el empate.');
   a.sort((x,y)=>x.who===first?-1:1);
  }else a.sort((x,y)=>g.pos[x.who]-g.pos[y.who]);
  ev(g,'declare',{dice:[...g.dice],assign:[...g.assign],moves:same(a)});
  g.tasks=[{type:'turn_end'}];for(let i=a.length-1;i>=0;i--)g.tasks.push({type:'move',who:a[i].who,to:g.pos[a[i].who]+a[i].value,kind:'dice'});
  g.steps=0;run(g);break;
 }
 case 'special':{
  if(g.phase!=='SPECIAL'||g.pending?.kind!=='paridad')throw Error('No hay dado de paridad pendiente.');
  const {who,station}=g.pending,die=random();if(!Number.isInteger(die)||die<1||die>6)throw Error('Dado especial inválido.');
  const delta=parity(die);ev(g,'special_roll',{who,station,die,delta});
  g.tasks.push({type:'move',who,to:g.pos[who]+delta,kind:'special',source:station});run(g);break;
 }
 case 'shared':{
  if(g.phase!=='SHARED'||g.pending?.kind!=='shared')throw Error('No hay efecto compartido pendiente.');
  if(!['solo','ambos'].includes(action.choice))throw Error('Elige solo o ambos.');
  const {who,station,delta}=g.pending;ev(g,'shared_choice',{who,station,choice:action.choice,delta});
  if(action.choice==='solo')g.tasks.push({type:'move',who,to:g.pos[who]+delta,kind:'special',source:station});
  else{
   const mate=teammate(who),a=g.pos[who],b=g.pos[mate],order=a===b?[who,mate]:a<b?[who,mate]:[mate,who];
   g.tasks.push({type:'batch',station,delta:delta/2,order});
  }
  run(g);break;
 }
 default:throw Error('Acción no reconocida: '+action.type);
 }
 g.revision++;
 return g;
}
export function publicGame(g){if(!g)return null;return {
 version:g.version,rules:g.rules,revision:g.revision,phase:g.phase,pos:[...g.pos],team:g.team,round:g.round,
 dice:[...g.dice],assign:[...g.assign],finishPending:g.finishPending,pending:g.pending?same(g.pending):null,
 steps:g.steps,winner:g.winner,scores:g.scores,error:g.error,events:g.events.slice(-50).map(same)
};}
export {BOARD};
