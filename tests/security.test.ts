import { describe, expect, test } from "bun:test";

import {
  LIMITS,
  normalizeBearerAuthorization,
  normalizeIdempotencyKey,
  parseJsonObject,
} from "../server/security/http.ts";
import { resolvePublicFile } from "../server/security/publication.ts";
import { findPolicy } from "../server/forge.ts";
import { validateContactPayload } from "../server/intake.ts";
import {
  isPubliclyVisibleProduct,
  primaryProductHref,
  safePublicHref,
} from "../src/lib/products/catalog.ts";
import type { WebsiteProductManifestV1 } from "../src/lib/products/types.ts";

const root = "/tmp/bds_website";

describe("publication manifest", () => {
  test("allows declared pages and assets", () => {
    expect(resolvePublicFile(root, "/").relativePath).toBe("index.html");
    expect(resolvePublicFile(root, "/about.html").relativePath).toBe("about.html");
    expect(resolvePublicFile(root, "/src/js/site.js").relativePath).toBe("src/js/site.js");
    expect(resolvePublicFile(root, "/.well-known/security.txt").relativePath).toBe(
      ".well-known/security.txt"
    );
  });

  test("rejects private repo files and undeclared white papers", () => {
    expect(() => resolvePublicFile(root, "/server/forge.ts")).toThrow();
    expect(() => resolvePublicFile(root, "/docs/page-content-v1.md")).toThrow();
    expect(() => resolvePublicFile(root, "/white-papers/private.docx")).toThrow();
    expect(() => resolvePublicFile(root, "/src/js/../server/forge.ts")).toThrow();
  });
});

describe("request contracts", () => {
  test("rejects prototype keys in JSON bodies", () => {
    expect(() => parseJsonObject(Buffer.from('{"__proto__":{"polluted":true}}'))).toThrow();
  });

  test("validates bearer authorization syntax and size", () => {
    expect(normalizeBearerAuthorization("Bearer abc.def_123-456")).toBe(
      "Bearer abc.def_123-456"
    );
    expect(() => normalizeBearerAuthorization("Basic abc")).toThrow();
    expect(() => normalizeBearerAuthorization(`Bearer ${"a".repeat(LIMITS.authorizationHeaderBytes)}`)).toThrow();
  });

  test("enforces idempotency key mode", () => {
    expect(normalizeIdempotencyKey("checkout-user-plan-123", "required")).toBe(
      "checkout-user-plan-123"
    );
    expect(normalizeIdempotencyKey(undefined, "optional")).toBeUndefined();
    expect(() => normalizeIdempotencyKey(undefined, "required")).toThrow();
    expect(() => normalizeIdempotencyKey("present-key", "forbidden")).toThrow();
  });
});

describe("forge BFF allowlist", () => {
  test("billing-portal is an allowlisted, origin-locked customer POST", () => {
    const policy = findPolicy("POST", "/v1/billing-portal");
    expect(policy?.auth).toBe("customer");
    expect(policy?.originRequired).toBe(true);
  });

  test("admin and raw Stripe paths are never reachable through the website", () => {
    expect(findPolicy("GET", "/v1/admin/customers")).toBeUndefined();
    expect(findPolicy("POST", "/v1/admin/licenses")).toBeUndefined();
    expect(findPolicy("POST", "/v1/billing_portal/sessions")).toBeUndefined();
  });

  test("billing-portal locks return_url to the site account page", () => {
    const policy = findPolicy("POST", "/v1/billing-portal");
    expect(() =>
      policy?.validateBody?.({ return_url: "https://evil.example/account.html" })
    ).toThrow();
    expect(() => policy?.validateBody?.({ return_url: "https://x.com/elsewhere" })).toThrow();
    expect(
      policy?.validateBody?.({
        return_url: "https://boswelldigitalsolutions.com/account.html",
      })
    ).toEqual({ return_url: "https://boswelldigitalsolutions.com/account.html" });
  });
});

describe("website product manifest", () => {
  const baseProduct: WebsiteProductManifestV1 = {
    schema: "WebsiteProductManifest.v1",
    slug: "authorforge",
    name: "AuthorForge",
    status: "live",
    visibility: "public",
    version: "1.0.0",
    summary: "Local-first authoring operating system.",
    source: {
      provider: "github",
      repoOwner: "Boswecw",
      repoName: "Author-Forge",
      commitSha: "abc123",
    },
    links: {
      launchUrl: "https://authorforge.onrender.com",
    },
    access: {
      requiresLogin: false,
      requiresEntitlement: false,
      publicListing: true,
    },
    timestamps: {
      goLiveAt: "2026-06-15T09:30:00-04:00",
      goLiveTimezone: "America/New_York",
      updatedAt: "2026-06-15T09:20:00-04:00",
    },
  };

  test("filters public listings by goLiveAt and access flags", () => {
    expect(
      isPubliclyVisibleProduct(baseProduct, new Date("2026-06-15T13:29:59.000Z"))
    ).toBe(false);
    expect(
      isPubliclyVisibleProduct(baseProduct, new Date("2026-06-15T13:30:00.000Z"))
    ).toBe(true);
    expect(
      isPubliclyVisibleProduct(
        { ...baseProduct, access: { ...baseProduct.access, publicListing: false } },
        new Date("2026-06-15T13:30:00.000Z")
      )
    ).toBe(false);
  });

  test("uses safe product links and falls back when launch URLs are invalid", () => {
    expect(safePublicHref("javascript:alert(1)")).toBeUndefined();
    expect(safePublicHref("//evil.example/path")).toBeUndefined();
    expect(safePublicHref("/authorforge.html")).toBe("/authorforge.html");
    expect(primaryProductHref({ ...baseProduct, links: { launchUrl: "not a url" } })).toBe(
      "/products.html"
    );
  });
});

describe("intake contact payload", () => {
  const valid = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    reason: "General support",
    message: "Hello from the HUD.",
    source_page: "hud",
  };

  test("accepts the hud source page", () => {
    const payload = validateContactPayload({ ...valid });
    expect(payload.source_page).toBe("hud");
    expect(payload.email).toBe("ada@example.com");
  });

  test("still accepts the contact page source", () => {
    expect(validateContactPayload({ ...valid, source_page: "contact.html" }).source_page).toBe(
      "contact.html"
    );
  });

  test("rejects unlisted source pages and unknown reasons", () => {
    expect(() => validateContactPayload({ ...valid, source_page: "evil.html" })).toThrow();
    expect(() => validateContactPayload({ ...valid, reason: "Arbitrary" })).toThrow();
  });

  test("rejects unknown fields", () => {
    expect(() => validateContactPayload({ ...valid, role: "admin" })).toThrow();
  });
});
