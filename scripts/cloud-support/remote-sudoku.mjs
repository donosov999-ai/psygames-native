// Privileged operator utility. Never ship this file or a service credential
// inside the app. No table/snapshot access: only the two scoped server RPCs.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const URL_ROOT='https://iuvvheeocobhiothfgei.supabase.co';
export function supportOperator({credential,fetcher=fetch}) {
  if(typeof credential!=='string'||credential.length<100)throw Error('SUPPORT_CREDENTIAL_UNAVAILABLE');
  async function rpc(name,body) {
    let response;
    try {
      response=await fetcher(`${URL_ROOT}/rest/v1/rpc/${name}`,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
        headers:{apikey:credential,Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},
        body:JSON.stringify(body),
      });
    } catch { throw Error('SUPPORT_REQUEST_UNCONFIRMED'); }
    // No automatic retry: a response can be lost after the queue committed.
    // Reuse the exact request UUID/arguments after explicit operator review.
    if(!response.ok)throw Error(`SUPPORT_HTTP_${response.status}`);
    try{return await response.json();}catch{throw Error('SUPPORT_RESPONSE_UNCONFIRMED');}
  }
  async function lookup(email) {
    if(typeof email!=='string'||email.length>320||!/^\S+@\S+\.\S+$/.test(email))throw Error('INVALID_EMAIL');
    const rows=await rpc('psygames_support_lookup',{p_email:email.trim()});
    if(!Array.isArray(rows))throw Error('SUPPORT_INVALID_LOOKUP');
    for(const r of rows) {
      if(!r||typeof r.owner_id!=='string'||typeof r.grant_id!=='string'||
        !Number.isSafeInteger(r.grant_revision)||r.grant_revision<1||
        !/^[a-z][a-z0-9-]{0,63}$/.test(r.profile)||!['easy','normal','hard'].includes(r.road)||
        !Number.isFinite(Date.parse(r.expires_at)))throw Error('SUPPORT_INVALID_LOOKUP');
    }
    return rows;
  }
  async function queue({email,profile,road,target,requestId,reason,confirm=false}) {
    if(!Number.isInteger(target)||target<1||target>180||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId??'')||
      typeof reason!=='string'||reason.trim().length<1||reason.length>500||/[\x00-\x1f\x7f]/.test(reason))throw Error('INVALID_CORRECTION');
    const matches=(await lookup(email)).filter(r=>r.profile===profile&&r.road===road);
    if(matches.length!==1)throw Error('EXACT_LIVE_SUPPORT_PERMISSION_REQUIRED');
    const g=matches[0];
    const body={p_owner:g.owner_id,p_grant:g.grant_id,p_revision:g.grant_revision,
      p_profile:profile,p_road:road,p_target:target,p_request:requestId,
      p_operator_label:'psygames-support',p_reason:reason};
    if(!confirm)return {dry_run:true,profile,road,target,request_id:requestId,grant_revision:g.grant_revision};
    const id=await rpc('psygames_queue_sudoku_unlock',body);
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw Error('SUPPORT_RESPONSE_UNCONFIRMED');
    return {queued:true,correction_id:id,request_id:requestId,profile,road,target,device_applied:false};
  }
  return {lookup,queue};
}

async function main() {
  const [action,email,...rest]=process.argv.slice(2);
  const config=JSON.parse(fs.readFileSync('/Users/denisonosov/.sdt_secrets/supabase_db.json','utf8'))['personal-nzt'];
  if(config.project_ref!=='iuvvheeocobhiothfgei')throw Error('SUPPORT_PROJECT_MISMATCH');
  const api=supportOperator({credential:config.service_role_key});
  if(action==='lookup') {
    const rows=await api.lookup(email);
    console.log(JSON.stringify(rows));
  } else if(action==='queue') {
    const [profile,road,rawTarget,requestId,reason,confirm]=rest;
    if(confirm!==undefined&&confirm!=='--confirm')throw Error('INVALID_CONFIRMATION');
    console.log(JSON.stringify(await api.queue({email,profile,road,target:Number(rawTarget),requestId,reason,confirm:confirm==='--confirm'})));
  } else throw Error('Use: lookup <email> OR queue <email> <profile> <road> <level> <requestUUID> <nonsecret reason> [--confirm]');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error(error instanceof Error&&/^[A-Z_0-9 ]+$/.test(error.message)?error.message:'SUPPORT_OPERATION_FAILED');process.exitCode=1;});
}
