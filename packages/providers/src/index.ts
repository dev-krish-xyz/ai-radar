import { openai } from "./tier1/openai";
import { anthropic } from "./tier1/anthropic";
import { google } from "./tier1/google";
import { xai } from "./tier1/xai";
import { meta } from "./tier2/meta";
import { deepseek } from "./tier2/deepseek";
import { mistral } from "./tier2/mistral";
import { qwen } from "./tier2/qwen";
import type { ProviderConfig } from "./types";

export * from "./types";

export const TIER1_PROVIDERS: ProviderConfig[] = [openai, anthropic, google, xai];
export const TIER2_PROVIDERS: ProviderConfig[] = [meta, deepseek, mistral, qwen];
export const ALL_PROVIDERS: ProviderConfig[] = [...TIER1_PROVIDERS, ...TIER2_PROVIDERS];
