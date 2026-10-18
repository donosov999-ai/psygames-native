// Opt-in synthetic-only end-to-end acceptance. No real player access.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {supportOperator} from './remote-sudoku.mjs';
if(process.argv[2]!=='--synthetic-only')throw Error('Explicit --synthetic-only required');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=path.join(root,'_local/ecosystem-cloud');
const config=JSON.parse(fs.readFileSync(path.join(directory,'personal-nzt.client.json'),'utf8'));
const secrets=JSON.parse(fs.readFileSync('/Users/denisonosov/.sdt_secrets/supabase_db.json','utf8'))['personal-nzt'];
const url='https://iuvvheeocobhiothfgei.supabase.co';
if(config.supabase_url!==url||secrets.project_ref!=='iuvvheeocobhiothfgei')throw Error('SYNTHETIC_PROJECT_MISMATCH');
const run=crypto.randomUUID(),owned=[],receipt={run,started_utc:new Date().toISOString(),checks:{}};
const manifest=path.join(directory,`support-owned-${run}.json`);
const fixtureFile=path.join(directory,`support-private-${run}.json`);
const op=supportOperator({credential:secrets.service_role_key});
function check(name,value){receipt.checks[name]=value;if(value!==true)throw Error(`CHECK_FAILED_${name}`);}
async function call(route,{admin=false,method='GET',body,token}={}) {
  const key=admin?secrets.service_role_key:config.publishable_key;
  const r=await fetch(url+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{
    apikey:key,'Content-Type':'application/json',Prefer:'return=representation',
    ...(admin?{Authorization:`Bearer ${key}`}:(token?{Authorization:`Bearer ${token}`} : {})),
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await r.json();}catch{data=null;}return {ok:r.ok,status:r.status,data};
}
async function create() {
  const email=`psygames-support-${crypto.randomUUID()}@example.invalid`,password=crypto.randomBytes(36).toString('base64url');
  const c=await call('/auth/v1/admin/users',{admin:true,method:'POST',body:{email,password,email_confirm:true,app_metadata:{purpose:'psygames-support-synthetic',run}}});
  if(!c.ok||!c.data?.id)throw Error(`OWN_CREATE_${c.status}`);
  const id=c.data.id;owned.push(id);fs.writeFileSync(manifest,JSON.stringify({run,owned}),{mode:0o600});
  const s=await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  if(!s.ok||!s.data?.access_token)throw Error(`OWN_LOGIN_${s.status}`);
  return {id,email,session:s.data,token:s.data.access_token};
}
try {
  const a=await create(),b=await create();receipt.synthetic_owners=[a.id,b.id];
  check('no_grant_no_lookup',(await op.lookup(a.email)).length===0);
  const c=await call('/rest/v1/ecosystem_app_consents',{method:'POST',token:a.token,body:{owner_id:a.id,app_id:'psygames',issuer:url+'/auth/v1',enabled:true,policy_version:1}});
  check('synthetic_cloud_consent',c.ok);
  const sessionGuard=await call('/rest/v1/rpc/ecosystem_account_session_active',{method:'POST',token:a.token,body:{}});
  check('live_registered_session',sessionGuard.ok&&sessionGuard.data===true);
  const g=await call('/rest/v1/psygames_support_grants',{method:'POST',token:a.token,body:{owner_id:a.id,profile:'women',road:'normal',enabled:true,expires_at:new Date(Date.now()+86400000).toISOString()}});
  receipt.grant_response={status:g.status,code:typeof g.data?.code==='string'&&/^[A-Z0-9]+$/.test(g.data.code)?g.data.code:null};
  check('explicit_support_grant',g.ok&&g.data.length===1);
  const grant=g.data[0];
  const anon=await call('/rest/v1/psygames_support_grants');check('anonymous_denied',anon.status===401||anon.status===403);
  const foreign=await call('/rest/v1/psygames_support_grants?select=id',{token:b.token});check('cross_owner_hidden',foreign.ok&&foreign.data.length===0);
  const invalid=await call('/rest/v1/rpc/psygames_queue_sudoku_unlock',{method:'POST',token:a.token,body:{}});check('owner_cannot_operator_queue',!invalid.ok);
  const queued=await op.queue({email:a.email,profile:'women',road:'normal',target:80,requestId:crypto.randomUUID(),reason:'Synthetic progression recovery',confirm:true});
  check('operator_queued_not_device_applied',queued.queued&&queued.device_applied===false);
  fs.writeFileSync(fixtureFile,JSON.stringify({synthetic_only:true,url,publishable_key:config.publishable_key,owner:a.id,session:a.session,grant_id:grant.id,correction_id:queued.correction_id}),{mode:0o600});
  const execute=promisify(execFile);
  try {
    const output=await execute('/opt/homebrew/bin/flutter',['test','--no-pub','test/live_sudoku_support_test.dart','--reporter','expanded'],{cwd:path.join(root,'flutter'),env:{...process.env,PSY_SYNTHETIC_SUPPORT_FILE:fixtureFile},timeout:120000,maxBuffer:1024*1024});
    fs.writeFileSync(path.join(directory,`support-host-output-${run}.txt`),output.stdout,{mode:0o600});
    check('real_sdk_host_apply80_ack_and_revoke',output.stdout.includes('All tests passed!'));
  } catch(e) {
    fs.writeFileSync(path.join(directory,`support-host-output-${run}.txt`),String(e.stdout??'')+String(e.stderr??''),{mode:0o600});
    throw Error('HOST_ACCEPTANCE_FAILED');
  }
  check('revoked_lookup_empty',(await op.lookup(a.email)).length===0);
  const rows=await call('/rest/v1/psygames_support_corrections?select=id,status&owner_id=eq.'+a.id,{token:a.token});
  check('owner_applied_receipt',rows.ok&&rows.data.length===1&&rows.data[0].status==='applied');
  const snapshot=await call('/rest/v1/ecosystem_app_snapshots?select=id&owner_id=eq.'+a.id,{token:a.token});
  check('no_snapshot_replacement',snapshot.ok&&snapshot.data.length===0);
} catch(e){receipt.failure=/^(CHECK_FAILED_[A-Za-z_0-9]+|OWN_(CREATE|LOGIN)_[0-9]+|HOST_ACCEPTANCE_FAILED|SUPPORT_[A-Z_0-9]+)$/.test(e.message??'')?e.message:'SYNTHETIC_CHECK_FAILED';process.exitCode=1;}
finally {
  receipt.cleanup=[];
  for(const id of owned) {
    try {
      const user=await call('/auth/v1/admin/users/'+id,{admin:true});
      if(!user.ok||user.data?.app_metadata?.run!==run||user.data?.app_metadata?.purpose!=='psygames-support-synthetic')throw Error('OWNERSHIP');
      const deleted=await call('/auth/v1/admin/users/'+id,{admin:true,method:'DELETE',body:{should_soft_delete:false}});
      const checked=await call('/auth/v1/admin/users/'+id,{admin:true});
      receipt.cleanup.push({id,deleted:deleted.ok&&checked.status===404});
    }catch{receipt.cleanup.push({id,deleted:false});}
  }
  if(fs.existsSync(fixtureFile))fs.unlinkSync(fixtureFile);
  receipt.private_fixture_removed=!fs.existsSync(fixtureFile);receipt.finished_utc=new Date().toISOString();
  receipt.passed=!receipt.failure&&receipt.cleanup.every(r=>r.deleted);
  if(!receipt.passed)process.exitCode=1;
  fs.writeFileSync(path.join(directory,`support-live-receipt-${run}.json`),JSON.stringify(receipt,null,2),{mode:0o600});
  console.log(JSON.stringify(receipt));
}
