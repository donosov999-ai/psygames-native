import { createDeleteHandler } from './handler.mjs';

// Supabase Edge server environment; service role must NEVER enter app config.
Deno.serve(createDeleteHandler({
  url: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));
