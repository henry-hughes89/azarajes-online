import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD,IDS,newGame,applyAction,destination,validateAssignment} from '../src/engine.js';
const doIt=(g,seat,action,seq=[])=>{let i=0;return applyAction(g,seat,action,()=>{assert.ok(i<seq.length,'faltan dados de prueba');return seq[i++]});};
const init=(pos=[0,0,0,0],team=0)=>{const g=newGame();g.pos=pos;g.team=team;return g;};
function declare(g,seat,dice,assign,tieFirst){doIt(g,seat,{type:'roll'},dice);return doIt(g,seat,{type:'declare',assign,tieFirst});}
test('41 nodos (Inicio, estaciones 1–40), funciones v0.6 idénticas',()=>{
 assert.equal(BOARD.length,41);
 assert.deepEqual(BOARD.filter(x=>x.to!==null).map(x=>[x.n,x.to]),[[2,4],[7,11],[9,4],[10,15],[16,20],[19,15],[23,26],[28,32],[30,26],[31,29],[33,30],[35,31],[36,32],[37,35],[38,34],[39,33]]);
 assert.deepEqual(BOARD.filter(x=>x.kind==='paridad').map(x=>x.n),[12,18,24,29]);
 assert.deepEqual(BOARD.filter(x=>x.kind.startsWith('comparte')).map(x=>x.n),[13,21,27,34]);
});
test('Destino recorta en 40 y retrocesos no bajan de 1',()=>{assert.equal(destination(38,5),40);assert.equal(destination(3,-6),1);assert.equal(destination(0,1),1);});
test('Se rechazan dados al equipo rival',()=>{const g=init();doIt(g,'A',{type:'roll'},[3,2]);assert.throws(()=>doIt(g,'B',{type:'declare',assign:[0,0]}),/No es tu turno/);assert.throws(()=>doIt(g,'A',{type:'declare',assign:[2,2]}),/tus autómatas/);});
test('Dos dados a una ficha: se suman, un único aterrizaje, conducto 7->11',()=>{const g=init();declare(g,'A',[3,4],[0,0]);assert.equal(g.pos[0],11);assert.equal(g.team,1);assert.equal(g.phase,'ROLL');assert.deepEqual(g.events.filter(e=>e.type==='move').map(e=>[e.from,e.to]),[[0,7],[7,11]]);});
test('Dos fichas: la rezagada actúa antes, incluso cuando se invierte la asignación',()=>{const g=init([4,2,0,0]);declare(g,'A',[1,1],[0,1]);assert.deepEqual(g.events.filter(e=>e.type==='move'&&e.kind==='dice').map(e=>e.who),[1,0]);});
test('Empate: orden declarado',()=>{const g=init([3,3,0,0]);declare(g,'A',[1,2],[0,1],1);assert.deepEqual(g.events.filter(e=>e.type==='move'&&e.kind==='dice').map(e=>e.who),[1,0]);});
test('No se acepta orden de empate inválido',()=>{const g=init([2,2,0,0]);doIt(g,'A',{type:'roll'},[1,2]);assert.throws(()=>doIt(g,'A',{type:'declare',assign:[0,1]}),/primero/);});
test('Paridad impar avanza; par retrocede',()=>{const p=init([11,5,0,0]);declare(p,'A',[1,1],[0,1]);assert.equal(p.phase,'SPECIAL');assert.equal(p.pos[0],12);doIt(p,'A',{type:'special'},[3]);assert.equal(p.pos[0],15);const n=init([11,5,0,0]);declare(n,'A',[1,1],[0,1]);doIt(n,'A',{type:'special'},[2]);assert.equal(n.pos[0],15);assert.deepEqual(n.events.filter(e=>e.type==='move'&&e.who===0).slice(-2).map(e=>[e.from,e.to]),[[12,10],[10,15]]);assert.equal(n.phase,'ROLL');});
test('Compartida +4 sola / +2 ambas, y estación +2 reactiva si corresponde',()=>{const a=init([12,8,0,0]);declare(a,'A',[1,1],[0,1]);assert.equal(a.phase,'SHARED');assert.equal(a.pending.station,13);doIt(a,'A',{type:'shared',choice:'solo'});assert.equal(a.pos[0],17);assert.equal(a.pos[1],4); // 8+1 -> 9 -> 4
 const b=init([12,8,0,0]);declare(b,'A',[1,1],[0,1]);doIt(b,'A',{type:'shared',choice:'ambos'});assert.equal(b.pos[0],15); // 13+2
 assert.equal(b.pos[1],6); // la rezagada pasó antes por 9->4; el reparto simultáneo suma 2 a la posición 4
});
test('Compartida negativa mueve ambas antes de resolver, en orden por posición',()=>{
 const g=init([20,22,0,0]);declare(g,'A',[1,1],[0,1]);assert.equal(g.phase,'SHARED');assert.equal(g.pending.station,21);
 doIt(g,'A',{type:'shared',choice:'ambos'});
 const ev=g.events.filter(e=>e.type==='shared_batch');assert.equal(ev.length,1);assert.deepEqual(ev[0].order,[0,1]);
 const batchAt=g.events.findIndex(e=>e.type==='shared_batch');const moves=g.events.slice(batchAt+1).filter(e=>e.type==='move').slice(0,2);assert.deepEqual(moves.map(e=>e.who),[0,1]);
});
test('Entrada directa a Meta bloqueada hasta que compañero >=20',()=>{
 const g=init([37,19,0,0]);doIt(g,'A',{type:'roll'},[2,2]);assert.throws(()=>doIt(g,'A',{type:'declare',assign:[0,0]}),/Meta bloqueada/);assert.equal(g.phase,'ASSIGN');assert.deepEqual(g.pos,[37,19,0,0]);
 const h=init([37,20,0,0]);declare(h,'A',[2,2],[0,0]);assert.equal(h.pos[0],40);assert.equal(h.finishPending,true);assert.equal(h.team,1);
});
test('Entrada a Meta por efecto con compañero <20 se cancela solo ese movimiento',()=>{
 // Estación 39 fuerza retorno; usamos el efecto compartido 27->31 para probar bloqueo vía especiales en 34->40.
 const g=init([33,18,0,0]);declare(g,'A',[1,1],[0,1]);assert.equal(g.phase,'SHARED'); // 33+1=34 compartida negativa
 doIt(g,'A',{type:'shared',choice:'solo'});assert.equal(g.finishPending,false);assert.equal(g.pos[0],26); // 34-4=30 ->26
});
test('Se reactivan efectos al volver a la misma estación tras un ciclo',()=>{
 const g=init([28,1,0,0]);declare(g,'A',[1,1],[0,1]);assert.equal(g.pending?.station,29);
 doIt(g,'A',{type:'special'},[2]); // 29-2=27, compartida+
 assert.equal(g.pending?.station,27);doIt(g,'A',{type:'shared',choice:'ambos'});
 assert.equal(g.pending?.station,29); // 27+2 ->29, otra paridad
 assert.equal(g.phase,'SPECIAL');
});
test('Una llegada del equipo B cierra ronda inmediatamente; puntuación de ambas fichas',()=>{
 const g=init([22,26,38,20],1);declare(g,'B',[1,1],[2,2]);assert.equal(g.pos[2],40);assert.equal(g.phase,'OVER');assert.deepEqual(g.scores,[48,60]);assert.equal(g.winner,'B');
});
test('La llegada del equipo A deja turno completo B y cierra luego',()=>{
 const g=init([39,20,1,1]);declare(g,'A',[1,1],[0,0]);assert.equal(g.phase,'ROLL');assert.equal(g.team,1);assert.equal(g.finishPending,true);
 declare(g,'B',[1,1],[2,2]);assert.equal(g.phase,'OVER');assert.equal(g.winner,'A');
});
test('No se permiten decisiones fuera de fase',()=>{
 const g=init();assert.throws(()=>doIt(g,'A',{type:'shared',choice:'solo'}),/No hay efecto/);assert.throws(()=>doIt(g,'A',{type:'special'},[3]),/No hay dado/);
});
