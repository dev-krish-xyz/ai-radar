import type { ProviderConfig } from "../types";

export const deepseek: ProviderConfig = {
  slug: "deepseek",
  name: "DeepSeek",
  tier: "tier2",
  priority: 55,
  enabled: false,
  sources: [
    { name: "News", url: "https://api-docs.deepseek.com/news/", type: "blog" },
    { name: "API Docs", url: "https://api-docs.deepseek.com/", type: "docs" },
    { name: "Pricing", url: "https://api-docs.deepseek.com/quick_start/pricing", type: "pricing" },
    { name: "DeepSeek-V3 releases", url: "https://github.com/deepseek-ai/DeepSeek-V3/releases", type: "github_releases" },
  ],
};
