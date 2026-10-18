// Operator-only configuration location is injected by the local environment.
// No machine-private directory names or server credentials belong in Git.
import fs from 'node:fs';
import {isAbsolute} from 'node:path';

export function readOperatorConfig(file,reader=fs.readFileSync) {
  if(typeof file!=='string'||!isAbsolute(file))throw Error('SUPPORT_CREDENTIAL_FILE_REQUIRED');
  let config;
  try{config=JSON.parse(reader(file,'utf8'))['personal-nzt'];}
  catch{throw Error('SUPPORT_CREDENTIAL_FILE_UNAVAILABLE');}
  if(config?.project_ref!=='iuvvheeocobhiothfgei')throw Error('SUPPORT_PROJECT_MISMATCH');
  if(typeof config.service_role_key!=='string'||config.service_role_key.length<100)throw Error('SUPPORT_CREDENTIAL_UNAVAILABLE');
  return config;
}
