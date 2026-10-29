import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_KEY precisam estar definidos. ' +
    'Copie .env.example para .env.local e preencha.'
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});
