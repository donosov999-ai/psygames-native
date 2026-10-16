// Server-only G2 candidate. Importing this file does not deploy/enable deletion.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,code)=>new Response(JSON.stringify({code}),{status,headers});

async function confirmation(request){
  const declared=request.headers.get('Content-Length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>1024))return reply(413,'REQUEST_TOO_LARGE');
  const reader=request.body?.getReader();
  if(!reader)return reply(400,'CONFIRMATION_REQUIRED');
  let timer;
  const timedOut=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),3000);});
  try{
    const chunks=[];let size=0;
    for(;;){const part=await Promise.race([reader.read(),timedOut]);if(part.done)break;size+=part.value.byteLength;if(size>1024)return reply(413,'REQUEST_TOO_LARGE');chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!value||Array.isArray(value)||Object.keys(value).length!==2||value.confirm!=='DELETE_ACCOUNT'||value.scope!=='all_ecosystem_apps')return reply(400,'CONFIRMATION_REQUIRED');
    return null;
  }catch{return reply(400,'INVALID_REQUEST');}
  finally{
    clearTimeout(timer);
    // Cleanup must not await an untrusted underlying cancel() promise.
    void reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

export function createDeleteHandler({url,publishableKey,serviceRoleKey,fetchImpl=fetch,now=()=>Date.now()}){
  let origin;
  try{
    const endpoint=new URL(url);
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['','/'].includes(endpoint.pathname))throw Error();
    origin=endpoint.origin;
  }catch{throw Error('Invalid deletion endpoint configuration');}
  if(typeof publishableKey!=='string'||!publishableKey||typeof serviceRoleKey!=='string'||!serviceRoleKey||publishableKey===serviceRoleKey)throw Error('Missing server-only deletion credentials');
  const call=(path,options)=>fetchImpl(`${origin}${path}`,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  return async request=>{
    if(request.method!=='POST')return reply(405,'METHOD_NOT_ALLOWED');
    // Native-only pilot; no permissive browser CORS surface.
    if(request.headers.has('Origin'))return reply(403,'NATIVE_ONLY');
    const bearer=request.headers.get('Authorization')??'';
    if(!/^Bearer [A-Za-z0-9_.-]{32,8192}$/.test(bearer))return reply(401,'AUTH_REQUIRED');
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))return reply(415,'JSON_REQUIRED');
    const invalid=await confirmation(request);if(invalid)return invalid;
    let logoutDispatched=false;
    try{
      const callerHeaders={apikey:publishableKey,Authorization:bearer,'Content-Type':'application/json'};
      // Provider verifies the token; local decode below is ONLY an extra scope check.
      const verified=await call('/auth/v1/user',{method:'GET',headers:callerHeaders});
      if(verified.status===401||verified.status===403)return reply(401,'AUTH_REQUIRED');
      if(!verified.ok)return reply(503,'IDENTITY_UNAVAILABLE');
      const user=await verified.json();
      if(!UUID.test(user?.id??'')||user.is_anonymous!==false)return reply(403,'REGISTERED_ACCOUNT_REQUIRED');
      let claims;
      try{
        const parts=bearer.slice(7).split('.');if(parts.length!==3)throw Error();
        const raw=parts[1].replace(/-/g,'+').replace(/_/g,'/');
        claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.padEnd(Math.ceil(raw.length/4)*4,'=')),c=>c.charCodeAt(0))));
      }catch{return reply(401,'INVALID_IDENTITY');}
      if(claims.sub!==user.id||claims.iss!==`${origin}/auth/v1`||claims.aud!=='authenticated'||claims.role!=='authenticated'||claims.is_anonymous!==false||!UUID.test(claims.session_id??'')||!Number.isSafeInteger(claims.exp)||claims.exp<=Math.floor(now()/1000))return reply(401,'INVALID_IDENTITY');
      // No caller-supplied user ID; absent RPC/migration or revoked session FAIL CLOSED.
      const active=await call('/rest/v1/rpc/ecosystem_account_session_active',{method:'POST',headers:callerHeaders,body:'{}'});
      if(!active.ok)return reply(503,'SESSION_CHECK_UNAVAILABLE');
      if(await active.json()!==true)return reply(401,'SESSION_REVOKED');
      logoutDispatched=true;
      const logout=await call('/auth/v1/logout?scope=global',{method:'POST',headers:callerHeaders});
      if(!logout.ok)return reply(503,'SIGNOUT_UNAVAILABLE');
      const deleted=await call(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`,{method:'DELETE',headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,'Content-Type':'application/json'},body:JSON.stringify({should_soft_delete:false})});
      if(!deleted.ok)return reply(503,'DELETE_NOT_CONFIRMED_SIGN_IN_TO_RETRY');
      // No tokens, keys, upstream bodies, profile data or user ID in the response/logs.
      return reply(200,'ACCOUNT_DELETED');
    }catch{return reply(503,logoutDispatched?'DELETE_NOT_CONFIRMED_SIGN_IN_TO_RETRY':'DELETE_NOT_CONFIRMED');}
  };
}
