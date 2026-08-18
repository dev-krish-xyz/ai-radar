import { getEvent, getHealth, listEvents, listProviders, listSignals } from "./data";

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
  alertedAt?: string | null;
  wouldAlert?: boolean;
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

export const api = {
  health: () => getHealth(),
  events: (params?: { status?: string; limit?: number }) => listEvents(params),
  event: (id: number) => getEvent(id),
  signals: (params?: { limit?: number }) => listSignals(params?.limit ?? 100),
  providers: () => listProviders(),
};
