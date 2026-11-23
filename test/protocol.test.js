import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoomCode,validCode,publicRoomState,isAllowedOrigin,CODE_LENGTH} from '../src/protocol.js';

test('códigos de sala con longitud exacta y alfabeto seguro',()=>{
  assert.equal(makeRoomCode(Uint8Array.from([0,1,2,3,4,5,6,7])), 'ABCDEFGH');
  assert.ok(validCode('ABCDEFGH'));
  assert.equal(validCode('ABCD-IJK'),false);
  assert.equal(validCode('AAAAAAAO'),false);
  assert.equal(validCode('1234567'),false);
  assert.equal(makeRoomCode(new Uint8Array(CODE_LENGTH)).length,8);
});
test('la respuesta pública no contiene credenciales',()=>{
  const result=publicRoomState({code:'ABCDEFGH',phase:'ready',A:'private-A',B:'private-B'},['A']);
  assert.deepEqual(result.seats,{A:true,B:true});
  assert.deepEqual(result.online,{A:true,B:false});
  assert.equal(JSON.stringify(result).includes('private-'),false);
});
test('CORS específico al sitio publicado',()=>{
  assert.equal(isAllowedOrigin('https://henry-hughes89.github.io'),true);
  assert.equal(isAllowedOrigin('https://example.org'),false);
  assert.equal(isAllowedOrigin('https://henry-hughes89.github.io.attacker.test'),false);
});
