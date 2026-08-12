import { classifyDiffSignificance } from "@ai-radar/shared";

const result = await classifyDiffSignificance({
  providerName: "Anthropic",
  sourceName: "News",
  sourceType: "blog",
  sourceUrl: "https://www.anthropic.com/news",
  diffExcerpt:
    "+ Introducing Claude Synthetic-Test, our new frontier model with a 5 million token context window, " +
    "available today via the Messages API and Claude.ai for all Pro and Enterprise users.\n" +
    "- (previous content removed)",
});

console.log("[synthetic-llm] result:", JSON.stringify(result, null, 2));

if (!result) {
  console.error("[synthetic-llm] FAILED: got null (check GROQ_API_KEY / API error above)");
  process.exit(1);
}
if (!result.significant) {
  console.error("[synthetic-llm] UNEXPECTED: model classified an obvious new-model announcement as not significant");
  process.exit(1);
}

console.log("[synthetic-llm] PASS: Groq classified correctly");
process.exit(0);
