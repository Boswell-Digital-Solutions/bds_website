import { describe, expect, test } from "bun:test";

import {
  LIMITS,
  normalizeBearerAuthorization,
  normalizeIdempotencyKey,
  parseJsonObject,
} from "../server/security/http.ts";
import { resolvePublicFile } from "../server/security/publication.ts";

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
