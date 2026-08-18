import type { ProviderConfig } from "./types";

/**
 * Cross-provider *lead* sources only.
 * OpenAI news RSS lives on the OpenAI provider — not duplicated here.
 * Verge / TechCrunch stay disabled (context, not lead).
 */
export const earlyRadar: ProviderConfig = {
  slug: "early-radar",
  name: "Early Radar",
  tier: "tier1",
  priority: 5,
  enabled: true,
  sources: [
    {
      name: "Hugging Face Blog RSS",
      url: "https://huggingface.co/blog/feed.xml",
      type: "social",
      crawlIntervalMinutes: 5,
    },
    {
      name: "Simon Willison Weblog",
      url: "https://simonwillison.net/atom/everything/",
      type: "social",
      crawlIntervalMinutes: 5,
    },
    {
      name: "HF new models: openai",
      url: "https://huggingface.co/api/models?author=openai&sort=createdAt&direction=-1&limit=40",
      type: "model_catalog",
      crawlIntervalMinutes: 5,
    },
    {
      name: "HF new models: google",
      url: "https://huggingface.co/api/models?author=google&sort=createdAt&direction=-1&limit=40",
      type: "model_catalog",
      crawlIntervalMinutes: 5,
    },
    {
      name: "HF new models: xai-org",
      url: "https://huggingface.co/api/models?author=xai-org&sort=createdAt&direction=-1&limit=40",
      type: "model_catalog",
      crawlIntervalMinutes: 5,
    },
    // lead: new AI repos (7d, ≥30★) — needs GITHUB_TOKEN for reliable Search API
    {
      name: "Rising AI repos (GitHub search)",
      url: "https://api.github.com/search/repositories?q=llm",
      type: "social",
      crawlIntervalMinutes: 15,
    },
    // context: AI-filtered daily trending — alert only on new entries
    {
      name: "GitHub Trending (AI-filtered)",
      url: "https://github.com/trending?since=daily",
      type: "social",
      crawlIntervalMinutes: 30,
    },
    {
      name: "HF Daily Papers",
      url: "https://huggingface.co/api/daily_papers?limit=20&sort=publishedAt",
      type: "social",
      crawlIntervalMinutes: 15,
    },
    {
      name: "HN last 4h (AI)",
      url: "https://hn.algolia.com/api/v1/search_by_date?query=llm",
      type: "social",
      crawlIntervalMinutes: 10,
    },
    {
      name: "Google News labs 4h",
      url: "https://news.google.com/rss/search?q=OpenAI+OR+Anthropic+OR+Gemini+OR+Grok+OR+Claude+when:4h&hl=en-US&gl=US&ceid=US:en",
      type: "social",
      crawlIntervalMinutes: 15,
    },
    {
      name: "Google News model/launch 4h",
      url: "https://news.google.com/rss/search?q=(OpenAI+OR+Anthropic+OR+Grok)+(model+OR+launch+OR+pricing)+when:4h&hl=en-US&gl=US&ceid=US:en",
      type: "social",
      crawlIntervalMinutes: 15,
    },
    {
      name: "OpenRouter model catalog",
      url: "https://openrouter.ai/api/v1/models",
      type: "model_catalog",
      crawlIntervalMinutes: 15,
    },
    {
      name: "arXiv cs.CL + cs.AI",
      url: "http://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=20",
      type: "social",
      crawlIntervalMinutes: 30,
    },
    {
      name: "The Verge AI RSS",
      url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
      type: "social",
      crawlIntervalMinutes: 15,
      enabled: false,
    },
    {
      name: "TechCrunch AI RSS",
      url: "https://techcrunch.com/category/artificial-intelligence/feed/",
      type: "social",
      crawlIntervalMinutes: 15,
      enabled: false,
    },
  ],
};
