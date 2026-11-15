/**
 * Configuration readiness (guardrail (a), operator request 2026-11-14).
 *
 * On 2026-11-14 a wrong value in a Render setting left ForgeCustomer "healthy"
 * while every admin call failed. Presence is not usability: this module checks
 * that each setting the commerce surface needs is present AND has a usable
 * shape. It never contacts an upstream service, so site rollout does not depend
 * on ForgeCustomer or Supabase uptime.
 *
 * Output names settings and fixed reason codes only. It never contains a value,
 * a fragment of a value, or a length.
 */

export type ReadinessReason =
  | "missing"
  | "malformed"
  | "insecure_scheme"
  | "has_credentials"
  | "has_query_or_fragment"
  | "has_path"
  | "host_not_allowed"
  | "secret_key_shape"
  | "role_not_anon"
  | "project_mismatch";

export interface ReadinessFailure {
  setting: string;
  reason: ReadinessReason;
}

export interface ReadinessReport {
  ready: boolean;
  /** Critical settings that failed. Any entry makes the report not ready. */
  failed: ReadinessFailure[];
  /** Optional settings that are absent or unusable. They never fail readiness. */
  advisory: ReadinessFailure[];
  /** Every setting that was checked, in a fixed order. */
  checked: string[];
}

type Env = Record<string, string | undefined>;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Deployed mode: Render sets RENDER=true on every service. NODE_ENV is not set there. */
export function isDeployed(env: Env = process.env): boolean {
  return env.RENDER === "true" || env.NODE_ENV === "production";
}

interface BaseUrlRules {
  deployed: boolean;
  allowPath: boolean;
  allowedHosts: string[];
}

/** Check a configured service base URL. Returns a reason code, or null when usable. */
export function checkBaseUrl(value: string | undefined, rules: BaseUrlRules): ReadinessReason | null {
  if (value === undefined || value.trim() === "") {
    return "missing";
  }
  if (value !== value.trim()) {
    return "malformed";
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "malformed";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "malformed";
  }
  if (parsed.username || parsed.password) {
    return "has_credentials";
  }
  if (parsed.search || parsed.hash || value.includes("?") || value.includes("#")) {
    return "has_query_or_fragment";
  }
  if (!rules.allowPath && parsed.pathname !== "/" && parsed.pathname !== "") {
    return "has_path";
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    // Plain HTTP is a local-development convenience only.
    if (rules.deployed || !LOCAL_HOSTNAMES.has(hostname)) {
      return "insecure_scheme";
    }
  }
  if (rules.deployed && LOCAL_HOSTNAMES.has(hostname)) {
    return "host_not_allowed";
  }
  if (rules.allowedHosts.length > 0 && !rules.allowedHosts.includes(hostname)) {
    return "host_not_allowed";
  }
  return null;
}

const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{8,}$/;
const SECRET_KEY = /^sb_secret_/;
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Check the browser-facing Supabase key. Accepts a publishable key
 * (`sb_publishable_...`) or a legacy anon JWT. A secret key or a service_role
 * JWT is refused with `secret_key_shape`: that value must never reach a browser.
 */
export function checkSupabaseAnonKey(
  value: string | undefined,
  supabaseUrl: string | undefined
): ReadinessReason | null {
  if (value === undefined || value.trim() === "") {
    return "missing";
  }
  if (value !== value.trim()) {
    return "malformed";
  }
  if (SECRET_KEY.test(value)) {
    return "secret_key_shape";
  }
  if (PUBLISHABLE_KEY.test(value)) {
    return null;
  }
  if (!JWT_SHAPE.test(value)) {
    return "malformed";
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(Buffer.from(value.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "malformed";
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return "malformed";
  }

  if (payload.role === "service_role") {
    return "secret_key_shape";
  }
  if (payload.role !== "anon") {
    return "role_not_anon";
  }

  // A hosted project URL names its project ref; a legacy key names one too.
  const urlRef = supabaseProjectRef(supabaseUrl);
  if (urlRef && typeof payload.ref === "string" && payload.ref !== urlRef) {
    return "project_mismatch";
  }
  return null;
}

function supabaseProjectRef(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
    return match ? match[1] ?? null : null;
  } catch {
    return null;
  }
}

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/** Supabase URL check, shared by readiness and the browser/HUD config paths. */
export function supabaseUrlReason(env: Env = process.env): ReadinessReason | null {
  return checkBaseUrl(env.SUPABASE_URL, {
    deployed: isDeployed(env),
    allowPath: false,
    allowedHosts: csv(env.SUPABASE_ALLOWED_HOSTS),
  });
}

/** ForgeCustomer base URL check. Mirrors the no-path rule in server/forge.ts. */
export function forgeCustomerBaseReason(env: Env = process.env): ReadinessReason | null {
  return checkBaseUrl(env.FORGECUSTOMER_API_BASE, {
    deployed: isDeployed(env),
    allowPath: false,
    allowedHosts: csv(env.FORGECUSTOMER_ALLOWED_HOSTS),
  });
}

/** The anon key only when it has a usable, non-secret shape; otherwise "". */
export function usableSupabaseAnonKey(env: Env = process.env): string {
  return checkSupabaseAnonKey(env.SUPABASE_ANON_KEY, env.SUPABASE_URL) === null
    ? (env.SUPABASE_ANON_KEY as string)
    : "";
}

export function readinessReport(env: Env = process.env): ReadinessReport {
  const failed: ReadinessFailure[] = [];
  const advisory: ReadinessFailure[] = [];
  const checked: string[] = [];

  const critical = (setting: string, reason: ReadinessReason | null) => {
    checked.push(setting);
    if (reason) failed.push({ setting, reason });
  };
  const optional = (setting: string, reason: ReadinessReason | null) => {
    checked.push(setting);
    if (reason) advisory.push({ setting, reason });
  };

  // Commerce surface: the BFF (server/forge.ts) and login (Supabase).
  critical("FORGECUSTOMER_API_BASE", forgeCustomerBaseReason(env));
  critical("SUPABASE_URL", supabaseUrlReason(env));
  critical("SUPABASE_ANON_KEY", checkSupabaseAnonKey(env.SUPABASE_ANON_KEY, env.SUPABASE_URL));

  // Edge authentication is critical only once it is switched on. Same rule as
  // edgeTokenRequired() in server/security/http.ts, applied to the given env.
  const edgeRequired =
    env.BDS_REQUIRE_EDGE_TOKEN === "true" ||
    (env.BDS_REQUIRE_EDGE_TOKEN !== "false" && Boolean(env.BDS_EDGE_TOKEN));
  if (edgeRequired) {
    critical("BDS_EDGE_TOKEN", env.BDS_EDGE_TOKEN ? null : "missing");
  }

  // The intake lane is optional: every form falls back to email when it is
  // unset (KI-BDS-20261107-003). A set but unusable value is still reported.
  optional(
    "BDS_INTAKE_URL",
    checkBaseUrl(env.BDS_INTAKE_URL, {
      deployed: isDeployed(env),
      allowPath: true,
      allowedHosts: csv(env.BDS_INTAKE_ALLOWED_HOSTS),
    })
  );

  return { ready: failed.length === 0, failed, advisory, checked };
}
