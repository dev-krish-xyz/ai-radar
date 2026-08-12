import type { ProviderConfig } from "../types";

export const openai: ProviderConfig = {
  slug: "openai",
  name: "OpenAI",
  tier: "tier1",
  priority: 1,
  enabled: true,
  sources: [
    { name: "News / Blog", url: "https://openai.com/news/", type: "blog" },
    { name: "Model Catalog", url: "https://developers.openai.com/api/docs/models", type: "model_catalog" },
    { name: "API Changelog", url: "https://developers.openai.com/api/docs/changelog", type: "changelog" },
    { name: "Pricing", url: "https://openai.com/api/pricing/", type: "pricing" },
    { name: "openai-python releases", url: "https://github.com/openai/openai-python/releases", type: "github_releases" },
    { name: "openai-node releases", url: "https://github.com/openai/openai-node/releases", type: "github_releases" },
    { name: "npm: openai", url: "https://registry.npmjs.org/openai", type: "sdk_npm" },
    { name: "PyPI: openai", url: "https://pypi.org/pypi/openai/json", type: "sdk_pypi" },
  ],
};
