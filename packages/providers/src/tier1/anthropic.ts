import type { ProviderConfig } from "../types";

export const anthropic: ProviderConfig = {
  slug: "anthropic",
  name: "Anthropic",
  tier: "tier1",
  priority: 1,
  enabled: true,
  sources: [
    { name: "News", url: "https://www.anthropic.com/news", type: "blog" },
    { name: "Model Catalog", url: "https://platform.claude.com/docs/en/about-claude/models/overview", type: "model_catalog" },
    { name: "API Release Notes", url: "https://platform.claude.com/docs/en/release-notes/overview", type: "changelog" },
    { name: "Pricing", url: "https://claude.com/pricing", type: "pricing" },
    { name: "anthropic-sdk-python releases", url: "https://github.com/anthropics/anthropic-sdk-python/releases", type: "github_releases" },
    { name: "anthropic-sdk-typescript releases", url: "https://github.com/anthropics/anthropic-sdk-typescript/releases", type: "github_releases" },
    { name: "npm: @anthropic-ai/sdk", url: "https://registry.npmjs.org/@anthropic-ai/sdk", type: "sdk_npm" },
    { name: "PyPI: anthropic", url: "https://pypi.org/pypi/anthropic/json", type: "sdk_pypi" },
    { name: "anthropic-sdk-go releases", url: "https://github.com/anthropics/anthropic-sdk-go/releases", type: "github_releases" },
    { name: "Computer Use Guide", url: "https://docs.claude.com/en/docs/build-with-claude/computer-use", type: "docs" },
    { name: "claude-code commits", url: "https://github.com/anthropics/claude-code", type: "github_repo" },
  ],
};
