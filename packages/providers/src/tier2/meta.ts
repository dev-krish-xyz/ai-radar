import type { ProviderConfig } from "../types";

export const meta: ProviderConfig = {
  slug: "meta",
  name: "Meta / Llama",
  tier: "tier2",
  priority: 50,
  enabled: false,
  sources: [
    { name: "Meta AI Blog", url: "https://ai.meta.com/blog/", type: "blog" },
    { name: "Llama Docs", url: "https://www.llama.com/docs/model-cards-and-prompt-formats/", type: "docs" },
    { name: "llama-models releases", url: "https://github.com/meta-llama/llama-models/releases", type: "github_releases" },
    { name: "Hugging Face: meta-llama", url: "https://huggingface.co/meta-llama", type: "product_page" },
  ],
};
