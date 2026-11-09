import { afterEach, describe, expect, test } from "bun:test";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { buildCsp, securityHeaders, supabaseConnectOrigin } from "../server/security/http.ts";

const root = join(import.meta.dir, "..");
const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
});

function* walk(dir: string, accept: (path: string) => boolean): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".git", "docs", "doc", "out", "tools", "tests"].includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path, accept);
    else if (accept(path)) yield path;
  }
}

// Known remaining third-party script, tracked so no new one slips in. It blocks
// enforcing script-src 'self' on architecture.html until it is self-hosted too.
// It is not on any login, account, or checkout page.
const KNOWN_THIRD_PARTY_SCRIPTS = ["src/js/mermaid-render.js"];

describe("self-hosted scripts", () => {
  test("no page or script imports code from a third-party origin beyond the tracked exception", () => {
    const offenders: string[] = [];
    for (const file of walk(root, (path) => /\.(html|js)$/.test(path))) {
      const text = readFileSync(file, "utf8");
      // Module imports, dynamic imports, and <script src> pointing off-origin.
      if (/(?:\bfrom\s*["']https?:\/\/|import\(\s*["']https?:\/\/|<script[^>]+src=["']https?:\/\/)/.test(text)) {
        offenders.push(file.slice(root.length + 1));
      }
    }
    expect(offenders.sort()).toEqual(KNOWN_THIRD_PARTY_SCRIPTS);
  });

  test("auth, account, and checkout code loads nothing from a third-party origin", () => {
    for (const file of walk(join(root, "src/js/forge"), (path) => path.endsWith(".js"))) {
      expect(readFileSync(file, "utf8")).not.toMatch(/https?:\/\/(?!localhost)[^"'\s]+\.(?:m?js)\b/);
    }
  });

  test("the Supabase client loads from the vendored bundle", () => {
    const loader = readFileSync(join(root, "src/js/forge/supabase.js"), "utf8");
    expect(loader).toContain('from "../vendor/supabase-js.js"');
    const bundle = readFileSync(join(root, "src/js/vendor/supabase-js.js"), "utf8");
    expect(bundle.startsWith("/*! @supabase/supabase-js 2.45.0")).toBe(true);
    expect(bundle).toMatch(/export\s*\{[^}]*createClient/);
  });
});

describe("content security policy", () => {
  test("allows scripts from this origin only", () => {
    expect(buildCsp("https://example.supabase.co")).toContain("script-src 'self';");
  });

  test("allows exactly the configured Supabase origin for connections", () => {
    const csp = buildCsp("https://example.supabase.co");
    expect(csp).toContain("connect-src 'self' https://example.supabase.co;");
  });

  test("stays same-origin when Supabase is not configured", () => {
    expect(buildCsp(null)).toContain("connect-src 'self';");
  });

  test("derives only the origin, never a path, from SUPABASE_URL", () => {
    expect(supabaseConnectOrigin("https://example.supabase.co/auth/v1?x=1")).toBe("https://example.supabase.co");
  });

  test("refuses plain-http or malformed Supabase URLs outside local development", () => {
    expect(supabaseConnectOrigin("http://example.supabase.co")).toBeNull();
    expect(supabaseConnectOrigin("not a url")).toBeNull();
    expect(supabaseConnectOrigin(undefined)).toBeNull();
    expect(supabaseConnectOrigin("http://localhost:54321")).toBe("http://localhost:54321");
  });
});

describe("HSTS", () => {
  test("is sent when BDS_ENABLE_HSTS is true", () => {
    delete process.env.NODE_ENV;
    process.env.BDS_ENABLE_HSTS = "true";
    expect(securityHeaders()["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains; preload");
  });

  test("is pinned on in the Render blueprint", () => {
    const blueprint = readFileSync(join(root, "render.yaml"), "utf8");
    expect(blueprint).toMatch(/- key: BDS_ENABLE_HSTS\s*\n\s*value: "true"/);
  });
});
