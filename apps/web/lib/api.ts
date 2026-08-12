const API_URL = process.env.API_URL ?? "http://localhost:8787";

export type EventStatus = "PRE_ANNOUNCEMENT" | "CONFIRMED" | "DISMISSED";

export interface ProviderSummary {
  id: number;
  name: string;
  slug: string;
}

export interface EventListItem {
  id: number;
  provider: ProviderSummary;
  type: string;
  entity: string | null;
  title: string;
  summary: string;
  confidence: number;
  importance: number;
  status: EventStatus;
  firstDetectedAt: string;
  officiallyAnnouncedAt: string | null;
  confirmedAt: string | null;
  leadTimeMinutes: number | null;
  signalCount: number;
}

export interface EvidenceItem {
  id: number;
  signalType: string;
  title: string;
  description: string;
  entity: string | null;
  confidenceContribution: number;
  detectedAt: string;
  evidence: Record<string, unknown>;
  source: { id: number; name: string; url: string; type: string };
}

export interface EventDetail extends Omit<EventListItem, "signalCount"> {
  alertedAt: string | null;
  evidence: EvidenceItem[];
}

export interface SignalListItem {
  id: number;
  provider: ProviderSummary;
  source: { id: number; name: string; url: string; type: string };
  signalType: string;
  entity: string | null;
  title: string;
  description: string;
  confidenceContribution: number;
  detectedAt: string;
  correlated: boolean;
}

export interface SourceSummary {
  id: number;
  name: string;
  url: string;
  type: string;
  enabled: boolean;
  crawlIntervalMinutes: number;
  lastCrawledAt: string | null;
  lastStatus: string | null;
}

export interface ProviderDetail extends ProviderSummary {
  tier: string;
  priority: number;
  enabled: boolean;
  sources: SourceSummary[];
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  events: (params?: { status?: string; providerId?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.providerId) qs.set("providerId", String(params.providerId));
    const suffix = qs.toString() ? `?${qs}` : "";
    return apiFetch<EventListItem[]>(`/events${suffix}`);
  },
  event: (id: number) => apiFetch<EventDetail>(`/events/${id}`),
  signals: (params?: { providerId?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.providerId) qs.set("providerId", String(params.providerId));
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return apiFetch<SignalListItem[]>(`/signals${suffix}`);
  },
  providers: () => apiFetch<ProviderDetail[]>("/providers"),
};
