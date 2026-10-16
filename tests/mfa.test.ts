import { beforeEach, describe, expect, mock, test } from "bun:test";

// Match the pinned auth-js 2.64.4 response: the SVG inside this data URI is raw,
// including quotes and fragment characters. No real factor or credential is used.
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><path fill="#000" d="M0 0h180v180H0z"/><text>fixture &amp; café</text></svg>';
let response: { data: unknown; error: unknown };
let factors: { id: string; factor_type: string; status: string; friendly_name: string }[];
let listError: Error | null;
let cleanupError: Error | null;
let operations: string[];
let assurance: { data: { currentLevel: string; nextLevel: string } | null; error: Error | null };
const enrollFactor = mock(async () => { operations.push("enroll"); return response; });
const removeFactor = mock(async ({ factorId }: { factorId: string }) => {
  operations.push(`remove:${factorId}`);
  return { error: cleanupError };
});
mock.module("../src/js/forge/supabase.js", () => ({
  getSupabase: async () => ({ auth: { mfa: {
    enroll: enrollFactor,
    listFactors: async () => ({ data: { all: factors }, error: listError }),
    unenroll: removeFactor,
    getAuthenticatorAssuranceLevel: async () => assurance,
  } } }),
}));
const { enroll, describeMfaError, hasPendingChallenge } = await import("../src/js/forge/mfa.js");

beforeEach(() => {
  factors = [];
  listError = null;
  cleanupError = null;
  operations = [];
  assurance = { data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null };
  enrollFactor.mockClear();
  removeFactor.mockClear();
  response = {
    data: { id: "synthetic-factor", totp: { qr_code: `data:image/svg+xml;utf-8,${svg}`, secret: "SYNTHETIC-ONLY" } },
    error: null,
  };
});

describe("MFA sign-in gate", () => {
  test("requires the authenticator after first-factor sign-in", async () => {
    factors = [{ id: "live", factor_type: "totp", status: "verified", friendly_name: "Live" }];
    expect(await hasPendingChallenge()).toBe(true);
  });
  test("allows a completed second factor", async () => {
    assurance.data = { currentLevel: "aal2", nextLevel: "aal2" };
    expect(await hasPendingChallenge()).toBe(false);
  });
  test("allows an account without an enrolled second factor", async () => {
    assurance.data = { currentLevel: "aal1", nextLevel: "aal1" };
    expect(await hasPendingChallenge()).toBe(false);
  });
  test("does not treat an assurance lookup failure as MFA complete", async () => {
    assurance = { data: null, error: new Error("Synthetic assurance lookup unavailable") };
    await expect(hasPendingChallenge()).rejects.toThrow("Synthetic assurance lookup unavailable");
  });
  test("does not treat a missing assurance result as MFA complete", async () => {
    assurance = { data: null, error: null };
    await expect(hasPendingChallenge()).rejects.toThrow("Could not determine sign-in verification status.");
  });
  test("allows replacement enrollment after an admin reset despite cached nextLevel aal2", async () => {
    expect(assurance.data?.nextLevel).toBe("aal2");
    factors = [];
    expect(await hasPendingChallenge()).toBe(false);
  });
  test("requires a factor enrolled elsewhere despite cached nextLevel aal1", async () => {
    assurance.data = { currentLevel: "aal1", nextLevel: "aal1" };
    factors = [{ id: "new-live", factor_type: "totp", status: "verified", friendly_name: "Live" }];
    expect(await hasPendingChallenge()).toBe(true);
  });
  test("ignores unverified enrollment records when deciding whether to challenge", async () => {
    factors = [{ id: "pending", factor_type: "totp", status: "unverified", friendly_name: "Pending" }];
    expect(await hasPendingChallenge()).toBe(false);
  });
  test("fails closed when current factor lookup fails", async () => {
    listError = new Error("Synthetic current factor lookup unavailable");
    await expect(hasPendingChallenge()).rejects.toThrow("Synthetic current factor lookup unavailable");
  });
});

describe("MFA QR image source", () => {
  test("encodes the SDK's raw SVG without losing quotes, colors or Unicode", async () => {
    response = {
      data: { id: "synthetic-factor", totp: { qr_code: `data:image/svg+xml;utf-8,${svg}`, secret: "SYNTHETIC-ONLY" } },
      error: null,
    };
    const result = await enroll();
    const [prefix, payload] = result.qrCode.split(",");
    expect(prefix).toBe("data:image/svg+xml;utf-8");
    expect(payload).not.toMatch(/[<>"#\s]/);
    expect(decodeURIComponent(payload)).toBe(svg);
    expect(result.factorId).toBe("synthetic-factor");
    expect(result.secret).toBe("SYNTHETIC-ONLY");
    expect(enrollFactor).toHaveBeenCalledWith({ factorType: "totp", friendlyName: "Authenticator 1" });
  });

  test("returns enrollment failures without presenting setup data", async () => {
    const error = new Error("Synthetic enrollment unavailable");
    response = { data: null, error };
    await expect(enroll()).rejects.toThrow(error.message);
  });
});

describe("MFA enrollment recovery", () => {
  test("removes abandoned TOTP enrollments before creating a replacement", async () => {
    factors = [{ id: "abandoned", factor_type: "totp", status: "unverified", friendly_name: "" }];
    await enroll();
    expect(operations).toEqual(["remove:abandoned", "enroll"]);
  });

  test("preserves verified authenticators and other factor types", async () => {
    factors = [
      { id: "active", factor_type: "totp", status: "verified", friendly_name: "Authenticator 1" },
      { id: "pending-phone", factor_type: "phone", status: "unverified", friendly_name: "Phone" },
      { id: "pending-totp", factor_type: "totp", status: "unverified", friendly_name: "Authenticator 2" },
    ];
    await enroll();
    expect(operations).toEqual(["remove:pending-totp", "enroll"]);
    expect(enrollFactor).toHaveBeenCalledWith({ factorType: "totp", friendlyName: "Authenticator 3" });
  });

  test("does not begin enrollment if listing factors fails", async () => {
    listError = new Error("Synthetic factor listing unavailable");
    await expect(enroll()).rejects.toThrow(listError.message);
    expect(operations).toEqual([]);
  });

  test("does not create another factor if abandoned-factor cleanup fails", async () => {
    factors = [{ id: "abandoned", factor_type: "totp", status: "unverified", friendly_name: "" }];
    cleanupError = new Error("Synthetic cleanup unavailable");
    await expect(enroll()).rejects.toThrow(cleanupError.message);
    expect(operations).toEqual(["remove:abandoned"]);
  });

  test("explains name conflicts without exposing raw provider error text", () => {
    expect(describeMfaError({ code: "mfa_factor_name_conflict", message: "private-provider-detail" }))
      .toBe("An authenticator with that name already exists. Try again to restart setup.");
    expect(describeMfaError(new Error("private-provider-detail")))
      .toBe("Couldn't load two-factor setup. Please try again.");
  });
});
