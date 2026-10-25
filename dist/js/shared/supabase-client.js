const config = window.WEDDING_SUPABASE_CONFIG || {};

export const supabaseConfig = config;
export const isSupabaseConfigured = Boolean(config.url && config.publishableKey);

let clientPromise;

export const connectSupabase = () => {
  if (!isSupabaseConfigured) return Promise.resolve(null);

  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2')
      .then(({ createClient }) => createClient(config.url, config.publishableKey));
  }

  return clientPromise;
};
