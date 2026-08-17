import type { ProviderConfig } from "../types";

export const qwen: ProviderConfig = {
  slug: "qwen",
  name: "Qwen",
  tier: "tier2",
  priority: 55,
  enabled: true,
  sources: [
    { name: "Qwen Blog", url: "https://qwenlm.github.io/blog/", type: "blog" },
    { name: "Qwen2.5 releases", url: "https://github.com/QwenLM/Qwen2.5/releases", type: "github_releases" },
    { name: "Qwen3 releases", url: "https://github.com/QwenLM/Qwen3/releases", type: "github_releases" },
    { name: "PyPI: dashscope", url: "https://pypi.org/pypi/dashscope/json", type: "sdk_pypi" },
    { name: "Hugging Face: Qwen", url: "https://huggingface.co/api/models?author=Qwen&sort=createdAt&direction=-1&limit=40", type: "model_catalog" },
  ],
};
