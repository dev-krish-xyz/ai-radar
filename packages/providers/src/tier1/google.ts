import type { ProviderConfig } from "../types";

export const google: ProviderConfig = {
  slug: "google",
  name: "Google Gemini",
  tier: "tier1",
  priority: 1,
  enabled: true,
  sources: [
    { name: "Google AI Blog", url: "https://blog.google/innovation-and-ai/technology/ai/", type: "blog" },
    // ai.google.dev gates anonymous fetches behind a silent-signin redirect; the
    // Vertex AI mirror of the same release notes has no such gate.
    { name: "Gemini API Model Catalog", url: "https://ai.google.dev/gemini-api/docs/models", type: "model_catalog" },
    { name: "Vertex AI Gemini Release Notes", url: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes", type: "changelog" },
    { name: "Gemini API Pricing", url: "https://ai.google.dev/gemini-api/docs/pricing", type: "pricing" },
    { name: "python-genai releases", url: "https://github.com/googleapis/python-genai/releases", type: "github_releases" },
    { name: "js-genai releases", url: "https://github.com/googleapis/js-genai/releases", type: "github_releases" },
    { name: "npm: @google/genai", url: "https://registry.npmjs.org/@google/genai", type: "sdk_npm" },
    { name: "PyPI: google-genai", url: "https://pypi.org/pypi/google-genai/json", type: "sdk_pypi" },
    { name: "Vertex Live API Overview", url: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api", type: "docs" },
    { name: "gemini-cli commits", url: "https://github.com/google-gemini/gemini-cli", type: "github_repo" },
  ],
};
