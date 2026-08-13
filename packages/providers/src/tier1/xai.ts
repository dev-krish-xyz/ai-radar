import type { ProviderConfig } from "../types";

export const xai: ProviderConfig = {
  slug: "xai",
  name: "xAI",
  tier: "tier1",
  priority: 1,
  enabled: true,
  sources: [
    // x.ai's marketing domain (root, /news, /grok) sits behind a Cloudflare
    // interactive challenge that blocks plain HTTP fetches; docs.x.ai does not.
    { name: "Model Catalog", url: "https://docs.x.ai/developers/models", type: "model_catalog" },
    { name: "Release Notes", url: "https://docs.x.ai/developers/release-notes", type: "changelog" },
    { name: "API Docs", url: "https://docs.x.ai/developers/api-reference", type: "docs" },
    { name: "grok-1 releases", url: "https://github.com/xai-org/grok-1/releases", type: "github_releases" },
    { name: "PyPI: xai-sdk", url: "https://pypi.org/pypi/xai-sdk/json", type: "sdk_pypi" },
    { name: "npm: xai-sdk", url: "https://registry.npmjs.org/xai-sdk", type: "sdk_npm" },
    { name: "Function Calling Guide", url: "https://docs.x.ai/developers/tools/function-calling", type: "docs" },
  ],
};
