const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
}

async function retryFetch(input, init) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await globalThis.fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

module.exports = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: retryFetch }
});
