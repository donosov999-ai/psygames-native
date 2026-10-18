import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supportOperator} from './remote-sudoku.mjs';
const id='11111111-1111-4111-8111-111111111111';
const grant={owner_id:id,grant_id:id,grant_revision:2,profile:'women',road:'normal',expires_at:'2099-01-01T00:00:00Z'};
const options={email:'synthetic@example.invalid',profile:'women',road:'normal',target:80,requestId:id,reason:'Synthetic recovery'};
function fixture(rows=[grant]) {
  const calls=[];
  const api=supportOperator({credential:'synthetic-only-'.repeat(20),fetcher:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return Response.json(url.endsWith('lookup')?rows:id);
  }});
  return {api,calls};
}
test('dry run never queues or exposes credentials',async()=>{
  const {api,calls}=fixture();const result=await api.queue(options);
  assert.equal(result.dry_run,true);assert.equal(calls.length,1);
  assert.equal(JSON.stringify(result).includes('synthetic-only'),false);
});
test('confirmed queue binds exact owner/grant revision and is not device proof',async()=>{
  const {api,calls}=fixture();const r=await api.queue({...options,confirm:true});
  assert.equal(r.device_applied,false);assert.equal(calls[1].body.p_revision,2);
  assert.equal(calls[1].body.p_owner,id);assert.equal(calls[1].body.p_target,80);
});
test('missing or ambiguous permission never queues',async()=>{
  for(const rows of [[],[grant,grant]]) {
    const {api,calls}=fixture(rows);
    await assert.rejects(api.queue({...options,confirm:true}),/EXACT_LIVE/);assert.equal(calls.length,1);
  }
});
test('invalid target/request/reason never contacts server',async()=>{
  for(const bad of [{target:0},{target:181},{target:1.5},{requestId:'new'},{reason:'\nprivate'}]) {
    const {api,calls}=fixture();await assert.rejects(api.queue({...options,...bad}),/INVALID_CORRECTION/);assert.equal(calls.length,0);
  }
});
test('network and rejected requests never retry or leak provider response',async()=>{
  for(const fetcher of [async()=>{throw Error('private');},async()=>new Response('private',{status:403})]) {
    let n=0;const api=supportOperator({credential:'synthetic-only-'.repeat(20),fetcher:async(...args)=>{n++;return fetcher(...args);}});
    await assert.rejects(api.lookup(options.email),e=>!e.message.includes('private'));assert.equal(n,1);
  }
});
