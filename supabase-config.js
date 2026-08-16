import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://naykohnwagyxfjqzoosa.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YezKK1xEyzn0ZyF-hc3LhQ_xiTpxOR7';
export const CLIENT_DIAGNOSTIC_ENDPOINT = `${SUPABASE_URL}/functions/v1/client-diagnostic`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
