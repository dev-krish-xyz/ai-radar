const TITLE_CASE: Record<string, string> = {
  MODEL_LAUNCH: "Model launch",
  MODEL_PREVIEW: "Model preview",
  AVAILABILITY_CHANGE: "Availability",
  CAPABILITY_CHANGE: "Capability",
  NEW_ENDPOINT: "New endpoint",
  API_CHANGE: "API change",
  DEV_FEATURE: "Dev feature",
  PRODUCT_FEATURE: "Product",
  PRICING_CHANGE: "Pricing",
  CONTEXT_WINDOW_CHANGE: "Context window",
  SDK_CHANGE: "SDK",
  GITHUB_CHANGE: "GitHub",
  NEW_PRODUCT: "New product",
  DEPRECATION: "Deprecation",
  OTHER: "Other",
  new_model_id: "New model",
  new_endpoint: "New endpoint",
  sdk_change: "SDK",
  doc_change: "Docs",
  pricing_change: "Pricing",
  model_catalog_change: "Catalog",
  github_release: "Release",
  capability_change: "Capability",
  availability_change: "Availability",
  deprecation: "Deprecation",
  product_launch: "Launch",
  other: "Other",
  blog: "Blog",
  docs: "Docs",
  changelog: "Changelog",
  model_catalog: "Catalog",
  api_reference: "API",
  pricing: "Pricing",
  github_repo: "GitHub",
  github_releases: "Releases",
  sdk_npm: "npm",
  sdk_pypi: "PyPI",
  product_page: "Product",
  social: "Social",
  tier1: "Tier 1",
  tier2: "Tier 2",
};

export function labelFor(value: string | null | undefined): string {
  if (!value) return "";
  if (TITLE_CASE[value]) return TITLE_CASE[value];
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
