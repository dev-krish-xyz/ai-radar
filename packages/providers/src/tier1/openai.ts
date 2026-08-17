import type { ProviderConfig } from "../types";

export const openai: ProviderConfig = {
  slug: "openai",
  name: "OpenAI",
  tier: "tier1",
  priority: 1,
  enabled: true,
  sources: [
    // HTML is CF-blocked (403); RSS works and is faster to diff.
    { name: "News / Blog", url: "https://openai.com/news/rss.xml", type: "blog" },
    { name: "Model Catalog", url: "https://developers.openai.com/api/docs/models", type: "model_catalog" },
    { name: "API Changelog", url: "https://developers.openai.com/api/docs/changelog", type: "changelog" },
    { name: "Pricing", url: "https://openai.com/api/pricing/", type: "pricing" },
    { name: "openai-python releases", url: "https://github.com/openai/openai-python/releases", type: "github_releases" },
    { name: "openai-node releases", url: "https://github.com/openai/openai-node/releases", type: "github_releases" },
    { name: "npm: openai", url: "https://registry.npmjs.org/openai", type: "sdk_npm" },
    { name: "PyPI: openai", url: "https://pypi.org/pypi/openai/json", type: "sdk_pypi" },
    { name: "openai-agents-python releases", url: "https://github.com/openai/openai-agents-python/releases", type: "github_releases" },
    { name: "Realtime API Guide", url: "https://developers.openai.com/api/docs/guides/realtime", type: "docs" },
    // lead: OpenAPI spec enumerates model slugs; we persist the ID set, not the 3MB YAML
    {
      name: "OpenAPI model enums",
      url: "https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml",
      type: "model_catalog",
      crawlIntervalMinutes: 10,
    },
    // lead: product-repo commit messages (codenames / hidden slugs)
    { name: "codex commits", url: "https://github.com/openai/codex", type: "github_repo" },
    { name: "openai-openapi commits", url: "https://github.com/openai/openai-openapi", type: "github_repo" },
  ],
};
