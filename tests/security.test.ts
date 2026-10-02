import { describe, expect, test } from "bun:test";

import { readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";

import {
  LIMITS,
  normalizeBearerAuthorization,
  normalizeIdempotencyKey,
  parseJsonObject,
  validateAllowedHost,
  validateSameOrigin,
} from "../server/security/http.ts";
import { resolvePublicFile } from "../server/security/publication.ts";
import { CHECKOUT_OPEN, findPolicy, validateCheckoutBody } from "../server/forge.ts";
import { validateContactPayload } from "../server/intake.ts";
import { validateMessage } from "../server/hud.ts";
import { findFormerDomainWebRefs } from "../tools/qc/canonical-domain.ts";
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

  test("publishes the Media Center at exactly three aliases (BDS-WEB-PR-v0.1 CP2)", () => {
    for (const path of ["/media", "/media/", "/media.html"]) {
      expect(resolvePublicFile(root, path).relativePath).toBe("media.html");
    }
    expect(() => resolvePublicFile(root, "/media/releases")).toThrow();
    expect(() => resolvePublicFile(root, "/media/../server/forge.ts")).toThrow();
    expect(() => resolvePublicFile(root, "/media/private.html")).toThrow();
    expect(() => resolvePublicFile(root, "/src/assets/../docs/plans/x.md")).toThrow();
  });
});

describe("Media Center navigation (BDS-WEB-PR-v0.1 CP2)", () => {
  const repo = join(import.meta.dir, "..");
  const pages = readdirSync(repo, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(".html") && !/^(node_modules|out|dist|docs)\//.test(path));

  test("every page with a Contact nav link also links Media directly before it", () => {
    let checked = 0;
    for (const page of pages) {
      const html = readFileSync(join(repo, page), "utf8");
      const contact = html.match(/<a href="[^"]*contact\.html" class="site-header__nav-link[^"]*">Contact<\/a>/);
      if (!contact || page.startsWith("account/")) continue;
      checked += 1;
      const before = html.slice(0, contact.index).trimEnd();
      expect(before.endsWith(">Media</a>"), page).toBe(true);
    }
    expect(checked).toBeGreaterThan(20);
  });

  test("the Media Center keeps its canonical and the business email", () => {
    const html = readFileSync(join(repo, "media.html"), "utf8");
    expect(html).toContain('<link rel="canonical" href="https://bds-digitalsolutions.com/media">');
    expect(html).toContain("mailto:charlesboswell@boswelldigitalsolutions.com");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
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
        return_url: "https://bds-digitalsolutions.com/account.html",
      })
    ).toEqual({ return_url: "https://bds-digitalsolutions.com/account.html" });
  });
});

describe("canonical website domain (BDS-WEB-PR-v0.1 CP1)", () => {
  // Built at runtime so the canonical-domain QC scan does not flag this file.
  const FORMER = ["boswelldigitalsolutions", "com"].join(".");
  const CANONICAL = "bds-digitalsolutions.com";

  function request(headers: Record<string, string>): IncomingMessage {
    return { headers } as unknown as IncomingMessage;
  }

  function withoutEnv(names: string[], run: () => void): void {
    const saved = names.map((name) => [name, process.env[name]] as const);
    for (const name of names) delete process.env[name];
    try {
      run();
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }

  test("checkout accepts success/cancel URLs on the canonical domain only", () => {
    const policy = { validateBody: validateCheckoutBody };
    const body = (host: string) => ({
      plan_key: "authorforge.pro",
      success_url: `https://${host}/checkout/success.html`,
      cancel_url: `https://${host}/checkout/cancel.html`,
    });
    expect(policy?.validateBody?.(body(CANONICAL))).toEqual(body(CANONICAL));
    expect(policy?.validateBody?.(body(`www.${CANONICAL}`))).toEqual(body(`www.${CANONICAL}`));
    expect(policy?.validateBody?.({ ...body(CANONICAL), success_url: "/checkout/success.html" })).toEqual({
      ...body(CANONICAL),
      success_url: "/checkout/success.html",
    });
    expect(() => policy?.validateBody?.(body(FORMER))).toThrow();
    expect(() => policy?.validateBody?.(body(`www.${FORMER}`))).toThrow();
    expect(() => policy?.validateBody?.(body(`${CANONICAL}.evil.example`))).toThrow();
    expect(() =>
      policy?.validateBody?.({ ...body(CANONICAL), success_url: `https://${CANONICAL}/account.html` })
    ).toThrow();
  });

  test("checkout is paused at the BFF until AuthorForge is released", () => {
    expect(CHECKOUT_OPEN).toBe(false);
    const policy = findPolicy("POST", "/v1/checkout");
    const body = {
      plan_key: "authorforge_pro",
      success_url: `https://${CANONICAL}/checkout/success.html`,
      cancel_url: `https://${CANONICAL}/checkout/cancel.html`,
    };
    expect(() => policy?.validateBody?.(body)).toThrow("Purchases are not open yet.");
    // The billing portal stays available for any existing customer.
    expect(
      findPolicy("POST", "/v1/billing-portal")?.validateBody?.({
        return_url: `https://${CANONICAL}/account.html`,
      })
    ).toEqual({ return_url: `https://${CANONICAL}/account.html` });
  });

  test("billing-portal rejects the former website domain", () => {
    const policy = findPolicy("POST", "/v1/billing-portal");
    expect(() => policy?.validateBody?.({ return_url: `https://${FORMER}/account.html` })).toThrow();
  });

  test("default host allowlist serves the canonical domain and refuses the former one", () => {
    withoutEnv(["BDS_ALLOWED_HOSTS"], () => {
      expect(() => validateAllowedHost(request({ host: CANONICAL }))).not.toThrow();
      expect(() => validateAllowedHost(request({ host: `www.${CANONICAL}` }))).not.toThrow();
      expect(() => validateAllowedHost(request({ host: FORMER }))).toThrow();
      expect(() => validateAllowedHost(request({ host: `www.${FORMER}` }))).toThrow();
    });
  });

  test("origin fallback accepts the canonical domain and refuses the former one", () => {
    withoutEnv(["BDS_ALLOWED_ORIGINS"], () => {
      const from = (origin: string) => request({ host: "internal.example:10000", origin });
      expect(() => validateSameOrigin(from(`https://${CANONICAL}`))).not.toThrow();
      expect(() => validateSameOrigin(from(`https://${FORMER}`))).toThrow();
      expect(() => validateSameOrigin(from(`http://${CANONICAL}`))).toThrow();
    });
  });

  test("domain scan flags former web hosts but exempts email addresses", () => {
    expect(findFormerDomainWebRefs(`<link rel="canonical" href="https://${FORMER}/">`)).toHaveLength(1);
    expect(findFormerDomainWebRefs(`"www.${FORMER}",`)).toHaveLength(1);
    expect(findFormerDomainWebRefs(`mailto:charlesboswell@${FORMER}`)).toHaveLength(0);
    expect(findFormerDomainWebRefs(`email contact@${FORMER}.`)).toHaveLength(0);
    expect(findFormerDomainWebRefs(`https://${CANONICAL}/media`)).toHaveLength(0);
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

describe("hud message payload", () => {
  test("accepts a bounded message and trims it", () => {
    expect(validateMessage({ message: "  hello there  " })).toEqual({ message: "hello there" });
  });

  test("allows newlines but rejects other control characters", () => {
    expect(validateMessage({ message: "line one\nline two" }).message).toBe("line one\nline two");
    expect(() => validateMessage({ message: "badbell" })).toThrow();
  });

  test("rejects empty, oversized, non-string, and unknown fields", () => {
    expect(() => validateMessage({ message: "   " })).toThrow();
    expect(() => validateMessage({ message: "x".repeat(5001) })).toThrow();
    expect(() => validateMessage({ message: 42 })).toThrow();
    expect(() => validateMessage({ message: "ok", author: "operator" })).toThrow();
  });
});
