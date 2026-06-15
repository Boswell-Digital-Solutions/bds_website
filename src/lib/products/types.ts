export type WebsiteProductStatus =
  | "draft"
  | "coming_soon"
  | "scheduled"
  | "live"
  | "hidden"
  | "retired";

export type WebsiteProductVisibility = "hidden" | "private" | "public";

export interface WebsiteProductManifestV1 {
  schema: "WebsiteProductManifest.v1";
  slug: string;
  name: string;
  status: WebsiteProductStatus;
  visibility: WebsiteProductVisibility;
  version?: string;
  summary: string;
  description?: string;
  source: {
    provider: "github";
    repoOwner: string;
    repoName: string;
    defaultBranch?: string;
    commitSha: string;
  };
  links: {
    launchUrl?: string;
    downloadUrl?: string;
    pricingUrl?: string;
    supportUrl?: string;
    docsUrl?: string;
  };
  access: {
    requiresLogin: boolean;
    requiresEntitlement: boolean;
    publicListing: boolean;
  };
  timestamps: {
    goLiveAt: string;
    goLiveTimezone: string;
    publishedAt?: string;
    updatedAt: string;
  };
}
