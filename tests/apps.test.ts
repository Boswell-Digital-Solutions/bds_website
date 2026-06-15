import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { handleAppsRoute } from "../server/apps.ts";

// Fixture catalog: one publicly-visible product, one with a future go-live (must
// be filtered out), and one hidden product (must be filtered out). go-live dates
// are far past/future so the tests are not time-dependent.
const PRODUCTS = [
  {
    schema: "WebsiteProductManifest.v1",
    slug: "visible-app",
    name: "Visible App",
    status: "live",
    visibility: "public",
    version: "1.0.0",
    summary: "A publicly visible application.",
    source: { provider: "github", repoOwner: "Boswecw", repoName: "Visible-App", commitSha: "aaa111" },
    links: { launchUrl: "https://visible.example.com" },
    access: { requiresLogin: false, requiresEntitlement: false, publicListing: true },
    timestamps: {
      goLiveAt: "2020-01-01T00:00:00-05:00",
      goLiveTimezone: "America/New_York",
      updatedAt: "2020-01-01T00:00:00-05:00",
    },
  },
  {
    schema: "WebsiteProductManifest.v1",
    slug: "future-app",
    name: "Future App",
    status: "scheduled",
    visibility: "public",
    summary: "Scheduled for the future; must not list yet.",
    source: { provider: "github", repoOwner: "Boswecw", repoName: "Future-App", commitSha: "bbb222" },
    links: { launchUrl: "https://future.example.com" },
    access: { requiresLogin: false, requiresEntitlement: false, publicListing: true },
    timestamps: {
      goLiveAt: "2090-01-01T00:00:00-05:00",
      goLiveTimezone: "America/New_York",
      updatedAt: "2026-01-01T00:00:00-05:00",
    },
  },
  {
    schema: "WebsiteProductManifest.v1",
    slug: "hidden-app",
    name: "Hidden App",
    status: "live",
    visibility: "hidden",
    summary: "Hidden visibility; must not list.",
    source: { provider: "github", repoOwner: "Boswecw", repoName: "Hidden-App", commitSha: "ccc333" },
    links: { launchUrl: "https://hidden.example.com" },
    access: { requiresLogin: false, requiresEntitlement: false, publicListing: true },
    timestamps: {
      goLiveAt: "2020-01-01T00:00:00-05:00",
      goLiveTimezone: "America/New_York",
      updatedAt: "2020-01-01T00:00:00-05:00",
    },
  },
];

let rootDir: string;

beforeAll(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "bds-apps-test-"));
  await mkdir(join(rootDir, "src/lib/products"), { recursive: true });
  await writeFile(
    join(rootDir, "src/lib/products/products.json"),
    JSON.stringify(PRODUCTS),
    "utf8"
  );
});

afterAll(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead(status: number, headers?: Record<string, string>): CapturedResponse;
  end(body?: string): void;
}

function makeResponse(): CapturedResponse {
  const res: CapturedResponse = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      res.statusCode = status;
      res.headers = { ...res.headers, ...headers };
      return res;
    },
    end(body) {
      if (body !== undefined) res.body = body;
    },
  };
  return res;
}

async function route(method: string, path: string) {
  const request = { method, headers: {} } as unknown as IncomingMessage;
  const response = makeResponse();
  const url = new URL(`http://localhost${path}`);
  const handled = await handleAppsRoute(
    request,
    response as unknown as ServerResponse,
    url,
    rootDir,
    "test-correlation"
  );
  return { handled, response };
}

describe("apps route", () => {
  test("does not handle non-/apps paths", async () => {
    const { handled } = await route("GET", "/pricing.html");
    expect(handled).toBe(false);
  });

  test("listing renders only publicly-visible products (go-live + visibility filter)", async () => {
    const { handled, response } = await route("GET", "/apps");
    expect(handled).toBe(true);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Visible App");
    expect(response.body).not.toContain("Future App"); // future go-live
    expect(response.body).not.toContain("Hidden App"); // hidden visibility
  });

  test("detail renders a visible product", async () => {
    const { response } = await route("GET", "/apps/visible-app");
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Visible App");
    expect(response.body).toContain("Boswecw/Visible-App");
  });

  test("detail of a non-public product is 404", async () => {
    const { response } = await route("GET", "/apps/future-app");
    expect(response.statusCode).toBe(404);
  });

  test("detail of an unknown slug is 404", async () => {
    const { response } = await route("GET", "/apps/does-not-exist");
    expect(response.statusCode).toBe(404);
  });

  test("launch redirects (302) to the product's primary href", async () => {
    const { response } = await route("GET", "/apps/visible-app/launch");
    expect(response.statusCode).toBe(302);
    // safePublicHref normalizes via new URL().href, which appends the root slash.
    expect(response.headers.location).toBe("https://visible.example.com/");
  });

  test("non-GET methods are rejected with 405", async () => {
    const { response } = await route("POST", "/apps");
    expect(response.statusCode).toBe(405);
  });
});
