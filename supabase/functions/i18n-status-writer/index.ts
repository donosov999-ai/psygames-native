import {createStatusWriter} from './handler.mjs';
Deno.serve(createStatusWriter({
  url:Deno.env.get('SUPABASE_URL'),
  serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  // SHA256 of a random 384-bit server-only capability. This digest is not a key.
  expectedDigest:'c7de7a0af1d04186798978e5cb3b7f68da375a74e347f0ceb74ecd9ad6cc2510',
}));
