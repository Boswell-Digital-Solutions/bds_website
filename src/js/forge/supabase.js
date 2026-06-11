// Thin wrapper around the Supabase JS client. Login is handled entirely on the
// client against Supabase (the same project ForgeCustomer validates JWTs for);
// the resulting access token is then forwarded to our own server, which proxies
// to ForgeCustomer. The browser never talks to ForgeCustomer directly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPublicConfig } from "./config.js";

let clientPromise = null;

export async function getSupabase() {
  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = (async () => {
    const config = await getPublicConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Supabase is not configured for this environment.");
    }
    return createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  })();

  return clientPromise;
}

/** Returns the current session, or null when signed out. */
export async function getSession() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** Returns a fresh access token, refreshing the session if needed. */
export async function getAccessToken({ forceRefresh = false } = {}) {
  const supabase = await getSupabase();
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      return null;
    }
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signOut() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
}

export async function onAuthStateChange(callback) {
  const supabase = await getSupabase();
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
