import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDefines} from './build-defines.mjs';
test('default/OFF builds contain no provider key or activation',()=>{
 for(const enabled of ['',undefined,'false'])assert.deepEqual(buildDefines({enabled,key:'server-secret'}),{PSY_CLOUD_PILOT:false});
});
test('ON config permits only the exact approved URL and publishable key',()=>{
 const config={enabled:'true',url:'https://iuvvheeocobhiothfgei.supabase.co',key:'sb_publishable_synthetic_key_for_unit_tests_only'};
 const result=buildDefines(config);assert.equal(result.PSY_CLOUD_PILOT,true);
 assert.equal(result.PSY_SUPABASE_PUBLISHABLE_KEY,config.key);
 for(const patch of [{url:'https://other.supabase.co'},{url:config.url+'/'},{key:'service-role'},{key:'eyJserver.role.token'},{key:''},{enabled:'yes'}])assert.throws(()=>buildDefines({...config,...patch}));
});
