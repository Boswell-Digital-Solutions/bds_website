import type { IncomingMessage, ServerResponse } from "node:http";

import {
  loadProductCatalog,
  primaryProductHref,
  publicProducts,
  safePublicHref,
} from "../src/lib/products/catalog.ts";
import type { WebsiteProductManifestV1 } from "../src/lib/products/types.ts";
import { errorPayload, securityHeaders, sendJson, sendText } from "./security/http.ts";

export async function handleAppsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  rootDir: string,
  correlationId: string
): Promise<boolean> {
  const match = matchAppsPath(url.pathname);
  if (!match) {
    return false;
  }

  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    sendJson(
      response,
      405,
      errorPayload("METHOD_NOT_ALLOWED", "Method not allowed.", correlationId),
      { allow: "GET, HEAD" }
    );
    return true;
  }

  let catalog;
  try {
    catalog = await loadProductCatalog(rootDir);
  } catch {
    sendText(response, 503, "The application catalog is unavailable.");
    return true;
  }

  const products = publicProducts(catalog.products);

  if (match.kind === "listing") {
    sendHtml(response, method, 200, renderAppsListing(products));
    return true;
  }

  const product = products.find((item) => item.slug === match.slug);
  if (!product) {
    sendText(response, 404, "Application not found.");
    return true;
  }

  if (match.kind === "launch") {
    response.writeHead(302, {
      ...securityHeaders({
        "cache-control": "no-store",
        location: primaryProductHref(product),
      }),
    });
    response.end();
    return true;
  }

  sendHtml(response, method, 200, renderAppDetail(product));
  return true;
}

type AppsPathMatch =
  | { kind: "listing" }
  | { kind: "detail"; slug: string }
  | { kind: "launch"; slug: string };

function matchAppsPath(pathname: string): AppsPathMatch | null {
  if (pathname === "/apps" || pathname === "/apps/") {
    return { kind: "listing" };
  }

  const detail = pathname.match(/^\/apps\/([a-z0-9][a-z0-9-]{1,78}[a-z0-9])\/?$/);
  if (detail) {
    return { kind: "detail", slug: detail[1] };
  }

  const launch = pathname.match(/^\/apps\/([a-z0-9][a-z0-9-]{1,78}[a-z0-9])\/launch\/?$/);
  if (launch) {
    return { kind: "launch", slug: launch[1] };
  }

  return pathname.startsWith("/apps/") ? { kind: "detail", slug: "__missing__" } : null;
}

function sendHtml(response: ServerResponse, method: string, status: number, html: string): void {
  response.writeHead(status, {
    ...securityHeaders({
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    }),
    "content-length": String(Buffer.byteLength(html)),
  });
  response.end(method === "HEAD" ? undefined : html);
}

function renderAppsListing(products: WebsiteProductManifestV1[]): string {
  const cards =
    products.length === 0
      ? `<div class="apps-empty">No public applications are live yet.</div>`
      : products.map(renderAppCard).join("\n");

  return pageShell({
    title: "Applications - Boswell Digital Solutions",
    description: "Public application catalog for Boswell Digital Solutions products.",
    canonical: "https://boswelldigitalsolutions.com/apps",
    body: `
      <main id="main" class="content-page apps-page">
        <div class="container">
          <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span>/</span>
            <span aria-current="page">Applications</span>
          </nav>

          <section class="page-hero apps-page__hero">
            <div class="page-hero__eyebrow">Public Applications</div>
            <h1>Governed software surfaces from the Forge ecosystem.</h1>
            <p class="page-hero__lede">
              Listings appear here only after their go-live timestamp has arrived and their manifest is marked public.
            </p>
          </section>

          <section class="apps-grid" aria-label="Public application catalog">
            ${cards}
          </section>
        </div>
      </main>`,
  });
}

function renderAppDetail(product: WebsiteProductManifestV1): string {
  const launchHref = primaryProductHref(product);
  const pricingHref = safePublicHref(product.links.pricingUrl);
  const docsHref = safePublicHref(product.links.docsUrl);
  const supportHref = safePublicHref(product.links.supportUrl) ?? "/contact.html";

  return pageShell({
    title: `${product.name} - Boswell Digital Solutions`,
    description: product.summary,
    canonical: `https://boswelldigitalsolutions.com/apps/${product.slug}`,
    body: `
      <main id="main" class="content-page apps-page">
        <div class="container">
          <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span>/</span>
            <a href="/apps">Applications</a>
            <span>/</span>
            <span aria-current="page">${escapeHtml(product.name)}</span>
          </nav>

          <section class="page-hero apps-page__hero apps-page__hero--detail">
            <div class="page-hero__eyebrow">Application</div>
            <h1>${escapeHtml(product.name)}</h1>
            <p class="page-hero__lede">${escapeHtml(product.summary)}</p>
            <div class="apps-actions">
              <a href="${escapeAttribute(launchHref)}" class="btn btn-primary">Open ${escapeHtml(product.name)}</a>
              ${pricingHref ? `<a href="${escapeAttribute(pricingHref)}" class="btn btn-ghost">Pricing</a>` : ""}
            </div>
          </section>

          <section class="apps-detail-grid">
            <article class="apps-panel">
              <h2>Product Summary</h2>
              <p>${escapeHtml(product.description ?? product.summary)}</p>
              <div class="apps-meta">
                <span>Status: ${escapeHtml(product.status)}</span>
                <span>Version: ${escapeHtml(product.version ?? "unlabeled")}</span>
                <span>Go live: ${escapeHtml(formatDate(product.timestamps.goLiveAt))}</span>
              </div>
            </article>

            <article class="apps-panel">
              <h2>Release Source</h2>
              <p>${escapeHtml(product.source.repoOwner)}/${escapeHtml(product.source.repoName)}</p>
              <code>${escapeHtml(product.source.commitSha)}</code>
              <div class="apps-actions apps-actions--compact">
                ${docsHref ? `<a href="${escapeAttribute(docsHref)}" class="page-inline-link">Documentation</a>` : ""}
                <a href="${escapeAttribute(supportHref)}" class="page-inline-link">Support</a>
              </div>
            </article>
          </section>
        </div>
      </main>`,
  });
}

function renderAppCard(product: WebsiteProductManifestV1): string {
  return `
    <article class="apps-card">
      <div class="apps-card__topline">
        <span>${escapeHtml(product.status)}</span>
        <span>${escapeHtml(product.version ?? "unlabeled")}</span>
      </div>
      <h2>${escapeHtml(product.name)}</h2>
      <p>${escapeHtml(product.summary)}</p>
      <div class="apps-card__meta">
        <span>${escapeHtml(product.source.repoOwner)}/${escapeHtml(product.source.repoName)}</span>
        <span>${escapeHtml(formatDate(product.timestamps.goLiveAt))}</span>
      </div>
      <div class="apps-actions apps-actions--compact">
        <a href="/apps/${escapeAttribute(product.slug)}" class="btn btn-primary">View App</a>
        <a href="/apps/${escapeAttribute(product.slug)}/launch" class="btn btn-ghost">Launch</a>
      </div>
    </article>`;
}

function pageShell(input: {
  title: string;
  description: string;
  canonical: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeAttribute(input.description)}">
  <title>${escapeHtml(input.title)}</title>
  <link rel="canonical" href="${escapeAttribute(input.canonical)}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" href="/src/assets/images/bds-logo.png">
  <link rel="apple-touch-icon" href="/src/assets/images/bds-logo.png">
  <meta name="theme-color" content="#0F172A">
  <link rel="stylesheet" href="/src/styles/global.css">
  <link rel="stylesheet" href="/src/styles/header.css">
  <link rel="stylesheet" href="/src/styles/footer.css">
  <link rel="stylesheet" href="/src/styles/hud.css">
  <link rel="stylesheet" href="/src/styles/pages/site-pages.css">
  <link rel="stylesheet" href="/src/styles/pages/apps.css">
</head>
<body>
  <a href="#main" class="skip-link">Skip to main content</a>
  <header class="site-header" role="banner">
    <div class="site-header__inner">
      <a href="/" class="site-header__logo" aria-label="Boswell Digital Solutions - Home">
        <img src="/src/assets/images/bds-logo.png" alt="BDS" class="site-header__logo-img">
        <span>Boswell Digital Solutions</span>
      </a>
      <button class="site-header__menu-toggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="main-nav" id="menu-toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <nav class="site-header__nav" id="main-nav" aria-label="Main navigation">
        <a href="/products.html" class="site-header__nav-link">Products</a>
        <a href="/apps" class="site-header__nav-link site-header__nav-link--active">Apps</a>
        <a href="/pricing.html" class="site-header__nav-link">Pricing</a>
        <a href="/services.html" class="site-header__nav-link">Services</a>
        <a href="/security.html" class="site-header__nav-link">Security</a>
        <a href="/account.html" class="site-header__nav-link">Account</a>
        <a href="/contact.html" class="site-header__nav-link">Contact</a>
      </nav>
    </div>
  </header>
  ${input.body}
  <footer class="site-footer" role="contentinfo">
    <div class="site-footer__inner">
      <div class="site-footer__bottom">
        <span class="site-footer__copy">&copy; 2026 Boswell Digital Solutions LLC. All rights reserved.</span>
        <span class="site-footer__sdvosb">SDVOSB</span>
      </div>
    </div>
  </footer>
  <script type="module" src="/src/js/site.js"></script>
</body>
</html>`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
