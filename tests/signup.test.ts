import { describe, expect, mock, test } from "bun:test";
import { signUpWithEmailDelivery } from "../src/js/forge/signup.js";

const input = {
  email: "account@example.test",
  password: "synthetic-fixture-only",
  redirectTo: "https://bds.example.test/account.html",
};
const emailAccepted = { data: { user: null, session: null }, error: null };

function client(response: unknown, emailResponse: unknown = emailAccepted) {
  return {
    auth: {
      signUp: mock(async () => response),
      signInWithOtp: mock(async () => emailResponse),
    },
  };
}

describe("signup email delivery", () => {
  test("new accounts keep the signup confirmation and account return destination", async () => {
    const response = { data: { user: { identities: [{ provider: "email" }] }, session: null }, error: null };
    const supabase = client(response);
    expect(await signUpWithEmailDelivery(supabase, input)).toBe(response);
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: input.redirectTo },
    });
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  test("an obfuscated duplicate signup sends one usable sign-in email", async () => {
    const supabase = client({ data: { user: { identities: [] }, session: null }, error: null });
    expect(await signUpWithEmailDelivery(supabase, input)).toBe(emailAccepted);
    expect(supabase.auth.signUp).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: input.email,
      options: { shouldCreateUser: false, emailRedirectTo: input.redirectTo },
    });
  });

  test("an explicit already-registered response uses the same sign-in email path", async () => {
    const supabase = client({ data: { user: null, session: null }, error: { code: "user_already_exists" } });
    expect(await signUpWithEmailDelivery(supabase, input)).toBe(emailAccepted);
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  test("signup delivery failures and rate limits are returned without a fallback attempt", async () => {
    const response = { data: { user: null, session: null }, error: { message: "Email delivery rate limit", status: 429 } };
    const supabase = client(response);
    expect(await signUpWithEmailDelivery(supabase, input)).toBe(response);
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  test("a failed fallback email is surfaced instead of the duplicate-signup success", async () => {
    const failedEmail = { data: { user: null, session: null }, error: { message: "Delivery unavailable", status: 503 } };
    const supabase = client({ data: { user: { identities: [] }, session: null }, error: null }, failedEmail);
    expect(await signUpWithEmailDelivery(supabase, input)).toBe(failedEmail);
  });

  test("a network failure cannot turn into an email-sent result", async () => {
    const supabase = client({ data: { user: { identities: [] }, session: null }, error: null });
    supabase.auth.signInWithOtp = mock(async () => { throw new Error("Network unavailable"); });
    await expect(signUpWithEmailDelivery(supabase, input)).rejects.toThrow("Network unavailable");
  });

  test("an authenticated signup continues directly without a second email", async () => {
    const response = { data: { user: { identities: [] }, session: { user: { id: "synthetic-user" } } }, error: null };
    const supabase = client(response);
    expect(await signUpWithEmailDelivery(supabase, input)).toBe(response);
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });
});
