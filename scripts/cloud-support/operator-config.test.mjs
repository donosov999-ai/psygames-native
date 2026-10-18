import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readOperatorConfig} from './operator-config.mjs';

test('requires an explicit absolute operator config file before reading',()=>{
  for(const path of [undefined,'','relative-file.json']) {
    assert.throws(()=>readOperatorConfig(path,()=>{throw Error('must not read');}),/SUPPORT_CREDENTIAL_FILE_REQUIRED/);
  }
});
test('rejects another project or an absent credential',()=>{
  for(const config of [{project_ref:'another'},{project_ref:'iuvvheeocobhiothfgei'}]) {
    assert.throws(()=>readOperatorConfig('/synthetic/config.json',()=>JSON.stringify({'personal-nzt':config})),/^Error: SUPPORT_/);
  }
});
test('file and parser errors never disclose their input or path',()=>{
  for(const read of [()=>{throw Error('private-filename-or-contents');},()=>'{private-input']) {
    assert.throws(()=>readOperatorConfig('/synthetic/config.json',read),e=>e.message==='SUPPORT_CREDENTIAL_FILE_UNAVAILABLE');
  }
});
test('accepts only the explicitly selected project configuration',()=>{
  const config={project_ref:'iuvvheeocobhiothfgei',service_role_key:'synthetic-only-'.repeat(20)};
  assert.deepEqual(readOperatorConfig('/synthetic/config.json',()=>JSON.stringify({'personal-nzt':config})),config);
});
