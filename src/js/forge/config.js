// Fetches the public, non-secret runtime configuration the browser needs
// (Supabase URL + anon key). These values are safe to expose to clients; no
// service-role key, Stripe secret, or operator credential is ever sent here.

let cached = null;

export async function getPublicConfig() {
  if (cached) {
    return cached;
  }

  const response = await fetch("/api/public-config", {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load public configuration (${response.status}).`);
  }

  cached = await response.json();
  return cached;
}
