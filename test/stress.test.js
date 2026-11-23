import test from 'node:test';import assert from 'node:assert/strict';
import {newGame,applyAction,validateAssignment} from '../src/engine.js';
test('200 partidas de principio a fin con dados reproducibles (invariantes)',()=>{
 let finished=0,maxActions=0;
 for(let trial=0;trial<200;trial++){
  let seed=(trial+1)*1949;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const die=()=>next()%6+1;
  const g=newGame();let actions=0;
  while(!['OVER','ERROR'].includes(g.phase)&&actions<3000){
   const seat=g.team===0?'A':'B';let action;
   if(g.phase==='ROLL')action={type:'roll'};
   else if(g.phase==='ASSIGN'){
    let options=[];let a=g.team*2;
    for(let i=a;i<a+2;i++)for(let j=a;j<a+2;j++){
     const assign=[i,j];try{validateAssignment(g,assign);options.push(assign);}catch{}
    }
    if(!options.length)throw Error('No quedó ninguna asignación legal');
    const assign=options[next()%options.length];
    action={type:'declare',assign,tieFirst:a+(next()%2)};
   }else if(g.phase==='SPECIAL')action={type:'special'};
   else if(g.phase==='SHARED')action={type:'shared',choice:next()%2?'solo':'ambos'};
   else throw Error('Fase no prevista '+g.phase);
   applyAction(g,seat,action,die);
   assert.ok(g.pos.every(p=>Number.isInteger(p)&&p>=0&&p<=40));
   assert.ok([0,1].includes(g.team));
   assert.ok(g.round>=1);actions++;
  }
  assert.notEqual(g.phase,'ERROR',g.error||'error desconocido');
  assert.equal(g.phase,'OVER',`La partida ${trial} no terminó en ${actions} acciones`);
  assert.deepEqual(g.scores,[g.pos[0]+g.pos[1],g.pos[2]+g.pos[3]]);
  assert.ok(g.finishPending);finished++;maxActions=Math.max(maxActions,actions);
 }
 assert.equal(finished,200);console.log('Máximo de acciones para terminar:',maxActions);
});
