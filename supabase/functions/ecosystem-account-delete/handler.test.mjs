import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeleteHandler} from './handler.mjs';

const url='https://test-project.supabase.co';
const owner='11111111-1111-4111-8111-111111111111';
const session='22222222-2222-4222-8222-222222222222';
const now=1800000000000;
const defaults={sub:owner,iss:`${url}/auth/v1`,aud:'authenticated',role:'authenticated',is_anonymous:false,session_id:session,exp:now/1000+60};
const token=claims=>`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic-signature-only`;
const body=JSON.stringify({confirm:'DELETE_ACCOUNT',scope:'all_ecosystem_apps'});
function fixture({claims=defaults,responses=[],user={id:owner,is_anonymous:false},active=true}={}){
  const calls=[];
  const fetchImpl=async(path,options)=>{
    calls.push({path,options});const n=calls.length;
    if(responses[n-1] instanceof Error)throw responses[n-1];
    if(responses[n-1])return responses[n-1];
    if(n===1)return Response.json(user);
    if(n===2)return Response.json(active);
    return new Response(null,{status:204});
  };
  const handle=createDeleteHandler({url,publishableKey:'test-public',serviceRoleKey:'test-server-only',fetchImpl,now:()=>now});
  const request=(overrides={})=>new Request(`${url}/functions/v1/ecosystem-account-delete`,{method:'POST',headers:{Authorization:`Bearer ${token(claims)}`,'Content-Type':'application/json'},body,...overrides});
  return {handle,calls,request};
}
test('verified caller + live session + confirmation deletes own account, signout first',async()=>{
  const f=fixture();const response=await f.handle(f.request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{code:'ACCOUNT_DELETED'});
  assert.deepEqual(f.calls.map(c=>new URL(c.path).pathname),['/auth/v1/user','/rest/v1/rpc/ecosystem_account_session_active','/auth/v1/logout',`/auth/v1/admin/users/${owner}`]);
  assert.equal(f.calls[2].options.headers.apikey,'test-public');assert.equal(f.calls[3].options.headers.apikey,'test-server-only');
  assert.deepEqual(JSON.parse(f.calls[3].options.body),{should_soft_delete:false});assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.ok(f.calls.every(c=>c.options.redirect==='error'));
});
test('missing/mixed credentials and insecure endpoint fail before serving',()=>{
  assert.throws(()=>createDeleteHandler({url,publishableKey:'same',serviceRoleKey:'same'}));
  assert.throws(()=>createDeleteHandler({url,publishableKey:'p'}));
  assert.throws(()=>createDeleteHandler({url:'http://insecure.invalid',publishableKey:'p',serviceRoleKey:'s'}));
  assert.throws(()=>createDeleteHandler({url:`${url}/other`,publishableKey:'p',serviceRoleKey:'s'}));
});
for(const [name,overrides,status] of [
  ['GET',{method:'GET',body:undefined},405],
  ['browser origin',{headers:{Origin:'https://unknown.invalid'}},403],
  ['no bearer',{headers:{'Content-Type':'application/json'}},401],
  ['wrong content type',{headers:{Authorization:`Bearer ${token(defaults)}`,'Content-Type':'text/plain'}},415],
  ['missing scope',{body:'{"confirm":"DELETE_ACCOUNT"}'},400],
  ['arbitrary owner selector',{body:JSON.stringify({confirm:'DELETE_ACCOUNT',scope:'all_ecosystem_apps',user_id:'victim'})},400],
  ['wrong confirmation',{body:'{"confirm":"yes","scope":"all_ecosystem_apps"}'},400],
  ['malformed JSON',{body:'{'},400],
  ['oversized chunked body',{body:' '.repeat(1025)},413],
])test(`reject ${name} without network`,async()=>{const f=fixture();const r=await f.handle(f.request(overrides));assert.equal(r.status,status);assert.equal(f.calls.length,0);});
for(const [name,patch] of [
  ['foreign owner',{sub:'33333333-3333-4333-8333-333333333333'}],
  ['foreign issuer',{iss:'https://other.supabase.co/auth/v1'}],
  ['foreign audience',{aud:'other'}],
  ['anonymous claim',{is_anonymous:true}],['missing anonymous claim',{is_anonymous:undefined}],
  ['service role',{role:'service_role'}],['expired',{exp:now/1000}],['missing session',{session_id:undefined}],
])test(`reject identity ${name}`,async()=>{const f=fixture({claims:{...defaults,...patch}});assert.equal((await f.handle(f.request())).status,401);assert.equal(f.calls.length,1);});
test('anonymous provider user cannot delete',async()=>{const f=fixture({user:{id:owner,is_anonymous:true}});assert.equal((await f.handle(f.request())).status,403);assert.equal(f.calls.length,1);});
test('revoked session stops before signout/delete',async()=>{const f=fixture({active:false});assert.equal((await f.handle(f.request())).status,401);assert.equal(f.calls.length,2);});
for(const failedStep of [1,2,3,4])test(`HTTP failure at step ${failedStep} never reports deletion/leaks credentials`,async()=>{
  const responses=[];responses[failedStep-1]=new Response('private upstream credential payload',{status:500});const f=fixture({responses});const r=await f.handle(f.request());const text=await r.text();assert.equal(r.status,503);assert.equal(f.calls.length,failedStep);assert.ok(!text.includes('private'));assert.ok(!text.includes('test-server-only'));assert.ok(!text.includes(owner));
});
test('provider 401 never calls session guard/admin',async()=>{const f=fixture({responses:[new Response(null,{status:401})]});assert.equal((await f.handle(f.request())).status,401);assert.equal(f.calls.length,1);});
test('missing guard RPC does not bypass live session check',async()=>{const f=fixture({responses:[undefined,new Response(null,{status:404})]});assert.equal((await f.handle(f.request())).status,503);assert.equal(f.calls.length,2);});
test('RPC object is not treated as truthy boolean',async()=>{const f=fixture({responses:[undefined,Response.json({active:true})]});assert.equal((await f.handle(f.request())).status,401);assert.equal(f.calls.length,2);});
test('network exception returns sanitized failure',async()=>{const f=fixture({responses:[new Error('secret')]});const r=await f.handle(f.request());assert.equal(r.status,503);assert.equal(await r.text(),'{"code":"DELETE_NOT_CONFIRMED"}');assert.equal(f.calls.length,1);});
test('response loss after global signout does not claim delete; requests re-login',async()=>{const f=fixture({responses:[undefined,undefined,undefined,new Error('lost response')]});const r=await f.handle(f.request());assert.equal(r.status,503);assert.equal(await r.text(),'{"code":"DELETE_NOT_CONFIRMED_SIGN_IN_TO_RETRY"}');});
test('lost logout response requests re-login without attempting deletion',async()=>{const f=fixture({responses:[undefined,undefined,new Error('logout response lost')]});const r=await f.handle(f.request());assert.equal(r.status,503);assert.equal(await r.text(),'{"code":"DELETE_NOT_CONFIRMED_SIGN_IN_TO_RETRY"}');assert.equal(f.calls.length,3);});
test('oversized stream rejection never waits for stalled cancel cleanup',async()=>{
  const f=fixture();let cancelled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(1025));},cancel(){cancelled=true;return new Promise(()=>{});}});
  const response=await f.handle(f.request({body:stream,duplex:'half'}));
  assert.equal(response.status,413);assert.equal(cancelled,true);assert.equal(f.calls.length,0);
});
