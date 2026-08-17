export function isHfDailyPapersUrl(url: string): boolean {
  return url.includes("huggingface.co/api/daily_papers");
}

export function extractHfDailyPapers(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) return null;
    const papers: { id: string; title: string; url: string }[] = [];
    for (const raw of parsed) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const paper = (r.paper && typeof r.paper === "object" ? r.paper : r) as Record<string, unknown>;
      const id = typeof paper.id === "string" ? paper.id : typeof r.id === "string" ? r.id : "";
      const title =
        typeof paper.title === "string" ? paper.title : typeof r.title === "string" ? r.title : "";
      if (!title && !id) continue;
      const slug = id || title.slice(0, 80);
      papers.push({
        id: slug,
        title: title || slug,
        url: id ? `https://huggingface.co/papers/${id}` : "https://huggingface.co/papers",
      });
    }
    const ids = papers.map((p) => p.id).sort((a, b) => a.localeCompare(b));
    return JSON.stringify({
      count: ids.length,
      papers: ids,
      details: Object.fromEntries(papers.map((p) => [p.id, { title: p.title.slice(0, 200), url: p.url }])),
    });
  } catch {
    return null;
  }
}
