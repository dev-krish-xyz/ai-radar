import type { ProviderConfig } from "../types";

export const meta: ProviderConfig = {
  slug: "meta",
  name: "Meta / Llama",
  tier: "tier2",
  priority: 50,
  enabled: true,
  sources: [
    { name: "Meta AI Blog", url: "https://ai.meta.com/blog/", type: "blog" },
    { name: "llama-models releases", url: "https://github.com/meta-llama/llama-models/releases", type: "github_releases" },
    // HTML org page churns follower counts; API is stable and detects new repos.
    { name: "Hugging Face: meta-llama", url: "https://huggingface.co/api/models?author=meta-llama&sort=createdAt&direction=-1&limit=40", type: "model_catalog" },
    { name: "llama-stack releases", url: "https://github.com/meta-llama/llama-stack/releases", type: "github_releases" },
  ],
};
