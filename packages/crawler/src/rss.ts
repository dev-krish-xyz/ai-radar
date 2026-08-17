/**
 * Normalize RSS 2.0 / Atom feeds into a stable, line-oriented representation
 * so new posts appear as added lines and title churn is easy to regex against.
 */

export interface FeedItem {
  title: string;
  link: string;
  published: string | null;
  summary: string | null;
}

function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeXmlEntities(s: string): string {
  return unwrapCdata(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

function stripTags(s: string): string {
  // CDATA first — otherwise `<![CDATA[...]]>` is eaten by the tag stripper.
  const unwrapped = unwrapCdata(s);
  return decodeXmlEntities(unwrapped.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function firstTag(block: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
    const m = block.match(re);
    if (m?.[1] !== undefined && m[1] !== null) {
      const text = stripTags(m[1]);
      if (text.length > 0) return text;
    }
    // self-closing / attribute form: <link href="..."/>
    const attrRe = new RegExp(`<${name}\\b[^>]*\\bhref=["']([^"']+)["'][^>]*/?>`, "i");
    const am = block.match(attrRe);
    if (am?.[1]) return decodeXmlEntities(am[1]);
  }
  return null;
}

function parseRssItems(xml: string): FeedItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return blocks.map((block) => ({
    title: firstTag(block, ["title"]) ?? "(untitled)",
    link: firstTag(block, ["link", "guid"]) ?? "",
    published: firstTag(block, ["pubDate", "dc:date", "date"]),
    summary: firstTag(block, ["description", "content:encoded", "summary"]),
  }));
}

function parseAtomEntries(xml: string): FeedItem[] {
  const blocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  return blocks.map((block) => {
    let link = firstTag(block, ["link"]) ?? "";
    if (!link) {
      const alt = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
        ?? block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      if (alt?.[1]) link = decodeXmlEntities(alt[1]);
    }
    return {
      title: firstTag(block, ["title"]) ?? "(untitled)",
      link,
      published: firstTag(block, ["updated", "published"]),
      summary: firstTag(block, ["summary", "content"]),
    };
  });
}

export function isFeedContent(body: string, contentType: string | null, url: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("rss") || ct.includes("atom") || ct.includes("xml")) {
    if (/<(rss|feed|rdf:RDF)\b/i.test(body)) return true;
  }
  if (url.endsWith(".xml") || url.endsWith(".atom") || url.includes("/feed") || url.includes("rss")) {
    if (/<(rss|feed)\b/i.test(body)) return true;
  }
  return /<(rss|feed)\b/i.test(body.slice(0, 2000));
}

/**
 * Returns a stable newline-delimited feed summary:
 *   TITLE: ...
 *   LINK: ...
 *   DATE: ...
 *   SUMMARY: ... (truncated)
 *   ---
 * Newest items first (RSS order preserved). Caps at 40 items to keep diffs small.
 */
export function extractFeedContent(body: string): string | null {
  if (!/<(rss|feed|item|entry)\b/i.test(body)) return null;

  const items = /<entry\b/i.test(body) ? parseAtomEntries(body) : parseRssItems(body);
  if (items.length === 0) {
    // Valid empty feed — still a baseline.
    return "FEED_ITEMS: 0\n";
  }

  const capped = items.slice(0, 40);
  const lines: string[] = [`FEED_ITEMS: ${capped.length}`];
  for (const item of capped) {
    lines.push(`TITLE: ${item.title.slice(0, 300)}`);
    if (item.link) lines.push(`LINK: ${item.link.slice(0, 400)}`);
    if (item.published) lines.push(`DATE: ${item.published.slice(0, 80)}`);
    if (item.summary) lines.push(`SUMMARY: ${item.summary.slice(0, 400)}`);
    lines.push("---");
  }
  return lines.join("\n");
}
