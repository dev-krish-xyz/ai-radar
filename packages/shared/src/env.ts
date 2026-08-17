function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get telegramBotToken() {
    return optional("TELEGRAM_BOT_TOKEN");
  },
  get telegramChatId() {
    return optional("TELEGRAM_CHAT_ID");
  },
  get groqApiKey() {
    return optional("GROQ_API_KEY");
  },
  /** Optional classic PAT or fine-grained token — lifts GitHub API rate limit 60→5000/hr. */
  get githubToken() {
    return optional("GITHUB_TOKEN");
  },
  get crawlerUserAgent() {
    return (
      optional("CRAWLER_USER_AGENT") ??
      "ai-radar/0.1 (personal research bot; contact: you@example.com)"
    );
  },
};
