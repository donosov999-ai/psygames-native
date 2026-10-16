// Release-only public client config. Never accepts or emits a server credential.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export function buildDefines({enabled='',url='',key=''}) {
  if(!['','false','true'].includes(enabled))throw Error('Invalid cloud build switch');
  if(enabled!=='true')return {PSY_CLOUD_PILOT:false};
  if(url!=='https://iuvvheeocobhiothfgei.supabase.co'||
    !/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(key)) {
    throw Error('Cloud build requires the approved public client configuration');
  }
  return {PSY_CLOUD_PILOT:true,PSY_SUPABASE_URL:url,PSY_SUPABASE_PUBLISHABLE_KEY:key};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const defines=buildDefines({enabled:process.env.CLOUD_ENABLED,
    url:process.env.PSY_SUPABASE_URL,key:process.env.PSY_SUPABASE_PUBLISHABLE_KEY});
  const output=process.argv[2];
  if(!output)throw Error('Build config output path required');
  fs.writeFileSync(output,JSON.stringify(defines),{mode:0o600});
  console.log(`Cloud build configuration: ${defines.PSY_CLOUD_PILOT?'available, explicit user opt-in required':'OFF'}`);
}
