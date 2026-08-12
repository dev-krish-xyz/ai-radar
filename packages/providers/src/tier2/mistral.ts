import type { ProviderConfig } from "../types";

export const mistral: ProviderConfig = {
  slug: "mistral",
  name: "Mistral",
  tier: "tier2",
  priority: 55,
  enabled: false,
  sources: [
    { name: "News", url: "https://mistral.ai/news", type: "blog" },
    { name: "Model Catalog", url: "https://docs.mistral.ai/getting-started/models/models_overview/", type: "model_catalog" },
    { name: "Pricing", url: "https://mistral.ai/pricing", type: "pricing" },
    { name: "client-python releases", url: "https://github.com/mistralai/client-python/releases", type: "github_releases" },
    { name: "PyPI: mistralai", url: "https://pypi.org/pypi/mistralai/json", type: "sdk_pypi" },
  ],
};
