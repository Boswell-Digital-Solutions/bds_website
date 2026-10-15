// Supabase may acknowledge duplicate signup with an obfuscated user and no
// session. That response does not send a new confirmation email. Deliver a
// normal sign-in link instead, without replacing the existing password or
// revealing which account path was taken in the UI.
export async function signUpWithEmailDelivery(supabase, { email, password, redirectTo }) {
  const response = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });

  const identities = response.data?.user?.identities;
  const duplicate = response.error?.code === "user_already_exists" ||
    (!response.error && !response.data?.session && Array.isArray(identities) && identities.length === 0);
  if (!duplicate) {
    return response;
  }

  // Keep the backend's email rate limits and delivery failures visible. Do not
  // create a new user or silently reset credentials on this recovery path.
  return supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
}
