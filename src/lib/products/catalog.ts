import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  WebsiteProductManifestV1,
  WebsiteProductStatus,
  WebsiteProductVisibility,
} from "./types.ts";

export const PRODUCTS_MANIFEST_PATH = "src/lib/products/products.json";

const PRODUCT_STATUSES = new Set<WebsiteProductStatus>([
  "draft",
  "coming_soon",
  "scheduled",
  "live",
  "hidden",
  "retired",
]);

const PRODUCT_VISIBILITIES = new Set<WebsiteProductVisibility>(["hidden", "private", "public"]);

export interface ProductCatalog {
  products: WebsiteProductManifestV1[];
  invalidRecords: string[];
}

export async function loadProductCatalog(rootDir = process.cwd()): Promise<ProductCatalog> {
  const raw = await readFile(join(rootDir, PRODUCTS_MANIFEST_PATH), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("products.json must contain an array of WebsiteProductManifest.v1 records.");
  }

  const products: WebsiteProductManifestV1[] = [];
  const invalidRecords: string[] = [];

  parsed.forEach((item, index) => {
    const normalized = normalizeProduct(item);
    if (normalized) {
      products.push(normalized);
    } else {
      invalidRecords.push(`products[${index}]`);
    }
  });

  products.sort((a, b) => a.name.localeCompare(b.name));
  return { products, invalidRecords };
}

export function publicProducts(
  products: WebsiteProductManifestV1[],
  now = new Date()
): WebsiteProductManifestV1[] {
  return products.filter((product) => isPubliclyVisibleProduct(product, now));
}

export function isPubliclyVisibleProduct(
  product: WebsiteProductManifestV1,
  now = new Date()
): boolean {
  const goLiveAt = Date.parse(product.timestamps.goLiveAt);
  if (Number.isNaN(goLiveAt)) {
    return false;
  }
  return (
    product.visibility === "public" &&
    product.access.publicListing === true &&
    now.getTime() >= goLiveAt
  );
}

export function primaryProductHref(product: WebsiteProductManifestV1): string {
  return safePublicHref(product.links.launchUrl) ?? safePublicHref(product.links.downloadUrl) ?? "/products.html";
}

export function safePublicHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function normalizeProduct(value: unknown): WebsiteProductManifestV1 | null {
  if (!isRecord(value)) return null;
  if (value.schema !== "WebsiteProductManifest.v1") return null;

  const slug = stringField(value, "slug");
  const name = stringField(value, "name");
  const status = value.status;
  const visibility = value.visibility;
  const summary = stringField(value, "summary");
  const source = value.source;
  const links = value.links;
  const access = value.access;
  const timestamps = value.timestamps;

  if (!slug || !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug)) return null;
  if (!name || !summary) return null;
  if (!PRODUCT_STATUSES.has(status as WebsiteProductStatus)) return null;
  if (!PRODUCT_VISIBILITIES.has(visibility as WebsiteProductVisibility)) return null;
  if (!isRecord(source) || source.provider !== "github") return null;
  if (!stringField(source, "repoOwner") || !stringField(source, "repoName")) return null;
  if (!stringField(source, "commitSha")) return null;
  if (!isRecord(links) || !isRecord(access) || !isRecord(timestamps)) return null;
  if (typeof access.requiresLogin !== "boolean") return null;
  if (typeof access.requiresEntitlement !== "boolean") return null;
  if (typeof access.publicListing !== "boolean") return null;
  if (!stringField(timestamps, "goLiveAt") || !stringField(timestamps, "goLiveTimezone")) return null;
  if (!stringField(timestamps, "updatedAt")) return null;
  if (Number.isNaN(Date.parse(String(timestamps.goLiveAt)))) return null;

  return {
    schema: "WebsiteProductManifest.v1",
    slug,
    name,
    status: status as WebsiteProductStatus,
    visibility: visibility as WebsiteProductVisibility,
    version: optionalString(value, "version"),
    summary,
    description: optionalString(value, "description"),
    source: {
      provider: "github",
      repoOwner: stringField(source, "repoOwner"),
      repoName: stringField(source, "repoName"),
      defaultBranch: optionalString(source, "defaultBranch"),
      commitSha: stringField(source, "commitSha"),
    },
    links: {
      launchUrl: optionalString(links, "launchUrl"),
      downloadUrl: optionalString(links, "downloadUrl"),
      pricingUrl: optionalString(links, "pricingUrl"),
      supportUrl: optionalString(links, "supportUrl"),
      docsUrl: optionalString(links, "docsUrl"),
    },
    access: {
      requiresLogin: access.requiresLogin,
      requiresEntitlement: access.requiresEntitlement,
      publicListing: access.publicListing,
    },
    timestamps: {
      goLiveAt: stringField(timestamps, "goLiveAt"),
      goLiveTimezone: stringField(timestamps, "goLiveTimezone"),
      publishedAt: optionalString(timestamps, "publishedAt"),
      updatedAt: stringField(timestamps, "updatedAt"),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = stringField(record, key);
  return value || undefined;
}
