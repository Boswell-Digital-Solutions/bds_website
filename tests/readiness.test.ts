import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  checkBaseUrl,
  checkSupabaseAnonKey,
  isDeployed,
  readinessReport,
} from "../server/readiness.ts";

// Every value below is a synthetic dummy. None is a real key or project.
const DUMMY_REF = "abcdefghijklmnopqrst";
const DUMMY_SUPABASE_URL = `https://${DUMMY_REF}.supabase.co`;
const DUMMY_PUBLISHABLE = "sb_publishable_DUMMYdummyDUMMYdummy0000";
const DUMMY_SECRET = "sb_secret_DUMMYdummyDUMMYdummy0000";
const DUMMY_FORGE = "https://forgecustomer.example.test";

function dummyJwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.ZHVtbXlzaWduYXR1cmU`;
}

const VALID_ENV = {
  RENDER: "true",
  FORGECUSTOMER_API_BASE: DUMMY_FORGE,
  SUPABASE_URL: DUMMY_SUPABASE_URL,
  SUPABASE_ANON_KEY: DUMMY_PUBLISHABLE,
};

describe("readiness report", () => {
  test("valid deployed config is ready; an unset intake lane is advisory only", () => {
    const report = readinessReport(VALID_ENV);
    expect(report.ready).toBe(true);
    expect(report.failed).toEqual([]);
    expect(report.advisory).toEqual([{ setting: "BDS_INTAKE_URL", reason: "missing" }]);
    expect(report.checked).toEqual([
      "FORGECUSTOMER_API_BASE",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "BDS_INTAKE_URL",
    ]);
  });

  test("a legacy anon JWT for the same project is accepted", () => {
    const key = dummyJwt({ role: "anon", ref: DUMMY_REF, iss: "supabase" });
    expect(readinessReport({ ...VALID_ENV, SUPABASE_ANON_KEY: key }).ready).toBe(true);
  });

  test("missing critical settings fail by name", () => {
    const report = readinessReport({ RENDER: "true" });
    expect(report.ready).toBe(false);
    expect(report.failed).toEqual([
      { setting: "FORGECUSTOMER_API_BASE", reason: "missing" },
      { setting: "SUPABASE_URL", reason: "missing" },
      { setting: "SUPABASE_ANON_KEY", reason: "missing" },
    ]);
  });

  test("an empty or whitespace value counts as missing", () => {
    const report = readinessReport({ ...VALID_ENV, FORGECUSTOMER_API_BASE: "   " });
    expect(report.failed).toEqual([{ setting: "FORGECUSTOMER_API_BASE", reason: "missing" }]);
  });

  test("edge token is critical only when edge authentication is on", () => {
    expect(readinessReport({ ...VALID_ENV, BDS_REQUIRE_EDGE_TOKEN: "true" }).failed).toEqual([
      { setting: "BDS_EDGE_TOKEN", reason: "missing" },
    ]);
    expect(readinessReport({ ...VALID_ENV, BDS_REQUIRE_EDGE_TOKEN: "true", BDS_EDGE_TOKEN: "dummy" }).ready).toBe(
      true
    );
  });

  test("a set but unusable intake URL is reported, still without failing readiness", () => {
    const report = readinessReport({ ...VALID_ENV, BDS_INTAKE_URL: "http://intake.example.test/v1" });
    expect(report.ready).toBe(true);
    expect(report.advisory).toEqual([{ setting: "BDS_INTAKE_URL", reason: "insecure_scheme" }]);
  });
});

describe("present but unusable values", () => {
  const deployed = { deployed: true, allowPath: false, allowedHosts: [] as string[] };

  test.each([
    ["not a url", "malformed"],
    ["forgecustomer.example.test", "malformed"],
    [" https://forgecustomer.example.test", "malformed"],
    ["ftp://forgecustomer.example.test", "malformed"],
    ["http://forgecustomer.example.test", "insecure_scheme"],
    ["https://user:pass@forgecustomer.example.test", "has_credentials"],
    ["https://forgecustomer.example.test/?x=1", "has_query_or_fragment"],
    ["https://forgecustomer.example.test/#x", "has_query_or_fragment"],
    ["https://forgecustomer.example.test/v1", "has_path"],
    ["https://localhost", "host_not_allowed"],
    ["http://127.0.0.1:8080", "insecure_scheme"],
  ])("base URL %p -> %p", (value, reason) => {
    expect(checkBaseUrl(value, deployed)).toBe(reason as never);
  });

  test("local development allows plain HTTP to localhost only", () => {
    const local = { deployed: false, allowPath: false, allowedHosts: [] as string[] };
    expect(checkBaseUrl("http://127.0.0.1:8080", local)).toBeNull();
    expect(checkBaseUrl("http://forgecustomer.example.test", local)).toBe("insecure_scheme");
  });

  test("an allowed-hosts pin refuses another host", () => {
    const pinned = { deployed: true, allowPath: false, allowedHosts: ["forgecustomer.example.test"] };
    expect(checkBaseUrl(DUMMY_FORGE, pinned)).toBeNull();
    expect(checkBaseUrl("https://other.example.test", pinned)).toBe("host_not_allowed");
  });

  test("deployed mode is RENDER=true or NODE_ENV=production", () => {
    expect(isDeployed({ RENDER: "true" })).toBe(true);
    expect(isDeployed({ NODE_ENV: "production" })).toBe(true);
    expect(isDeployed({})).toBe(false);
  });

  test("a secret key or service_role JWT in SUPABASE_ANON_KEY is refused", () => {
    expect(checkSupabaseAnonKey(DUMMY_SECRET, DUMMY_SUPABASE_URL)).toBe("secret_key_shape");
    expect(
      checkSupabaseAnonKey(dummyJwt({ role: "service_role", ref: DUMMY_REF }), DUMMY_SUPABASE_URL)
    ).toBe("secret_key_shape");
  });

  test("wrong-shape anon keys are refused", () => {
    expect(checkSupabaseAnonKey("not-a-key", DUMMY_SUPABASE_URL)).toBe("malformed");
    expect(checkSupabaseAnonKey("sb_publishable_", DUMMY_SUPABASE_URL)).toBe("malformed");
    expect(checkSupabaseAnonKey("aaa.!!!.ccc", DUMMY_SUPABASE_URL)).toBe("malformed");
    expect(checkSupabaseAnonKey("aaaa.bbbb.cccc", DUMMY_SUPABASE_URL)).toBe("malformed");
    expect(checkSupabaseAnonKey(dummyJwt({ role: "authenticated" }), DUMMY_SUPABASE_URL)).toBe("role_not_anon");
    expect(checkSupabaseAnonKey(dummyJwt({ role: "anon", ref: "zzzzzzzzzzzzzzzzzzzz" }), DUMMY_SUPABASE_URL)).toBe(
      "project_mismatch"
    );
  });
});

// End-to-end: the real server, real routing, real allowlist, synthetic env.
async function startServer(env: Record<string, string>) {
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const proc = Bun.spawn(["bun", "run", "dev-server.ts"], {
    cwd: `${import.meta.dir}/..`,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", HOST: "127.0.0.1", PORT: String(port), ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(`${base}/healthz`);
      return { base, proc };
    } catch {
      await Bun.sleep(50);
    }
  }
  proc.kill();
  throw new Error("server did not start");
}

describe("GET /readyz on the running server", () => {
  let configured: Awaited<ReturnType<typeof startServer>>;
  let broken: Awaited<ReturnType<typeof startServer>>;
  // A plain-HTTP forge base and a secret-shaped key: present, but unusable.
  const BROKEN_ENV = {
    RENDER: "true",
    FORGECUSTOMER_API_BASE: "http://forgecustomer.example.test",
    SUPABASE_URL: DUMMY_SUPABASE_URL,
    SUPABASE_ANON_KEY: DUMMY_SECRET,
  };

  beforeAll(async () => {
    configured = await startServer(VALID_ENV);
    broken = await startServer(BROKEN_ENV);
  });
  afterAll(() => {
    configured?.proc.kill();
    broken?.proc.kill();
  });

  test("returns 200 for a usable config without contacting ForgeCustomer", async () => {
    const response = await fetch(`${configured.base}/readyz`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.failed).toEqual([]);
  });

  test("returns 503 naming each failed setting, with no value in the body", async () => {
    const response = await fetch(`${broken.base}/readyz`);
    expect(response.status).toBe(503);
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body.status).toBe("not_ready");
    expect(body.failed).toEqual([
      { setting: "FORGECUSTOMER_API_BASE", reason: "insecure_scheme" },
      { setting: "SUPABASE_ANON_KEY", reason: "secret_key_shape" },
    ]);
    for (const value of Object.values(BROKEN_ENV).filter((v) => v !== "true")) {
      expect(text.includes(value)).toBe(false);
    }
    expect(text).not.toContain("forgecustomer.example.test");
    expect(text).not.toContain("sb_secret");
    expect(text).not.toContain(DUMMY_REF);
  });

  test("the static site keeps serving while readiness fails", async () => {
    const response = await fetch(`${broken.base}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  test("public-config withholds a secret-shaped key instead of serving it", async () => {
    const text = await (await fetch(`${broken.base}/api/public-config`)).text();
    expect(text).not.toContain("sb_secret");
    const body = JSON.parse(text);
    expect(body.supabaseAnonKey).toBe("");
    expect(body.forgeConfigured).toBe(false);
    expect(body.supabaseUrl).toBe(DUMMY_SUPABASE_URL);
  });

  test("public-config serves the public values when configured", async () => {
    const body = await (await fetch(`${configured.base}/api/public-config`)).json();
    expect(body).toEqual({
      supabaseUrl: DUMMY_SUPABASE_URL,
      supabaseAnonKey: DUMMY_PUBLISHABLE,
      forgeConfigured: true,
    });
  });

  test("readiness does not expose server code through the public surface", async () => {
    for (const path of ["/server/readiness.ts", "/readyz/../server/readiness.ts", "/readyz.ts"]) {
      const response = await fetch(`${configured.base}${path}`);
      expect(response.status, path).not.toBe(200);
      expect(await response.text()).not.toContain("readinessReport");
    }
  });

  test("readiness rejects mutating methods", async () => {
    const response = await fetch(`${configured.base}/readyz`, { method: "POST" });
    expect(response.status).toBe(405);
  });

  test("BFF with no ForgeCustomer base returns 503 INTEGRATION_UNCONFIGURED for a dummy bearer", async () => {
    const unconfigured = await startServer({ RENDER: "true" });
    try {
      const response = await fetch(`${unconfigured.base}/api/forge/v1/account`, {
        headers: { authorization: "Bearer probe.dummy.token" },
      });
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe("INTEGRATION_UNCONFIGURED");
    } finally {
      unconfigured.proc.kill();
    }
  });
});
