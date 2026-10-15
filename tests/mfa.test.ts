import { describe, expect, mock, test } from "bun:test";

// Match the pinned auth-js 2.64.4 response: the SVG inside this data URI is raw,
// including quotes and fragment characters. No real factor or credential is used.
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><path fill="#000" d="M0 0h180v180H0z"/><text>fixture &amp; café</text></svg>';
let response: { data: unknown; error: unknown };
const enrollFactor = mock(async () => response);
mock.module("../src/js/forge/supabase.js", () => ({
  getSupabase: async () => ({ auth: { mfa: { enroll: enrollFactor } } }),
}));
const { enroll } = await import("../src/js/forge/mfa.js");

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
    expect(enrollFactor).toHaveBeenCalledWith({ factorType: "totp" });
  });

  test("returns enrollment failures without presenting setup data", async () => {
    const error = new Error("Synthetic enrollment unavailable");
    response = { data: null, error };
    await expect(enroll()).rejects.toThrow(error.message);
  });
});
