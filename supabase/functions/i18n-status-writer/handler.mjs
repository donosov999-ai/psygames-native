// Narrow service-to-service bridge. No caller can select another RPC/table.
const KEYS=['p_site','p_lang','p_slug','p_hash','p_status','p_fields','p_warnings','p_error'];
const response=(status,code)=>new Response(JSON.stringify({code}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createStatusWriter({url,serviceRoleKey,expectedDigest,fetchImpl=fetch}) {
  if(!/^https:\/\/[^/]+$/.test(url)||!serviceRoleKey||!/^[a-f0-9]{64}$/.test(expectedDigest))throw Error('Invalid writer configuration');
  return async request=>{
    if(request.method!=='POST')return response(405,'METHOD_NOT_ALLOWED');
    if(request.headers.has('Origin'))return response(403,'SERVER_ONLY');
    const match=/^Bearer ([A-Za-z0-9_-]{64})$/.exec(request.headers.get('Authorization')??'');
    if(!match)return response(401,'UNAUTHORIZED');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(match[1]))),b=>b.toString(16).padStart(2,'0')).join('');
    let different=0;for(let i=0;i<64;i++)different|=digest.charCodeAt(i)^expectedDigest.charCodeAt(i);
    if(different)return response(401,'UNAUTHORIZED');
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))return response(415,'JSON_REQUIRED');
    const length=request.headers.get('Content-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>65536))return response(413,'TOO_LARGE');
    let body;
    try{
      const text=await request.text();if(new TextEncoder().encode(text).length>65536)return response(413,'TOO_LARGE');
      body=JSON.parse(text);
      if(!body||Array.isArray(body)||Object.keys(body).length!==8||KEYS.some(k=>!Object.hasOwn(body,k)))return response(400,'INVALID_PAYLOAD');
      for(const key of KEYS){
        const value=body[key];
        if(['p_fields','p_warnings'].includes(key)){
          if(value!==null&&(!Number.isInteger(value)||value<-2147483648||value>2147483647))return response(400,'INVALID_PAYLOAD');
        }else if(value!==null&&(typeof value!=='string'||value.length>16384))return response(400,'INVALID_PAYLOAD');
      }
      if(!body.p_site||!body.p_slug)return response(400,'INVALID_PAYLOAD');
    }catch{return response(400,'INVALID_PAYLOAD');}
    try{
      const result=await fetchImpl(url+'/rest/v1/rpc/translation_status_set',{method:'POST',headers:{apikey:serviceRoleKey,Authorization:'Bearer '+serviceRoleKey,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
      return result.ok?response(200,'STATUS_SAVED'):response(502,'REGISTRY_WRITE_FAILED');
    }catch{return response(502,'REGISTRY_UNAVAILABLE');}
  };
}
