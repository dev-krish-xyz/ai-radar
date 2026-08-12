// Deterministic pattern library used by rules.ts. Kept separate so the regexes
// (the part most likely to need tuning as providers rename things) are easy to find.

/** Provider-family model IDs. Deliberately specific enough to avoid matching prose. */
export const MODEL_ID_PATTERN =
  /\b(gpt-[45](\.\d+)?(-[a-z0-9]+)*(-mini|-nano|-turbo|-preview|-pro)?|o[134](-mini|-pro)?|claude-(opus|sonnet|haiku|fable)-[a-z0-9.-]+|claude-[0-9](\.\d+)?-(opus|sonnet|haiku)(-\d{8})?|gemini-[0-9.]+-(pro|flash|ultra|nano)(-[a-z0-9.-]+)?|grok-[0-9.]+(-[a-z0-9]+)*|llama-?[0-9.]+(-[a-z0-9]+)*|deepseek-(v|r)[0-9.]+(-[a-z0-9]+)*|mistral-(large|medium|small|nemo)(-[a-z0-9.-]+)?|qwen[0-9.]*-[a-z0-9.-]+)\b/gi;

/** REST-ish API endpoint paths, e.g. /v1/responses, /v1beta/models. */
export const ENDPOINT_PATTERN = /\/v\d+[a-z]*\/[a-z0-9_\-\/{}]+/gi;

export const DEPRECATION_PATTERN =
  /\b(deprecat(e|ed|ion)|sunset(ting)?|end[\s-]of[\s-]life|shutting down|will be retired|retir(e|ing|ement)|no longer (be )?(supported|available)|migrat(e|ion) (guide|required|by))\b/i;

export const PRICING_LINE_PATTERN = /\$\s?\d+(\.\d+)?\s?(\/|per)\s?(1[MmKk]|million|thousand|token|request|image|minute|hour)/i;
export const PRICING_AMOUNT_PATTERN = /\$\s?\d+(\.\d+)?/;

export const CONTEXT_WINDOW_PATTERN =
  /\b(\d[\d,]{2,}|\d+\s?[kKmM])\s?(-|to)?\s?(token)?s?\s*(context window|context length|token context)\b|\bcontext window\b.{0,20}\b\d[\d,]{2,}\b/i;

export const AVAILABILITY_PATTERN =
  /\b(now (generally )?available|general availability|now available in|rolling out|available to (all|everyone)|waitlist|early access|limited (preview|access)|now supports?)\b/i;

export const ANNOUNCEMENT_PATTERN =
  /\b(we(’|')?re (excited to )?(launching|introducing|releasing|announcing)|introducing|announcing|today we(’|')?re|is now available|we (built|shipped))\b/i;

export const VERSION_PATTERN = /\bv?(\d+\.\d+\.\d+)\b/;

/** Source types treated as "official announcement" channels for CONFIRMED matching. */
export const ANNOUNCEMENT_SOURCE_TYPES = new Set(["blog", "product_page"]);
