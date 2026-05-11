export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Domain {
  id: number;
  host: string;
  registered_domain: string;
  tld: string;
  first_seen_at: string;
  last_seen_at: string;
  page_count: number;
  authority_score?: number | null;
  authority_fetched_at?: string | null;
  backlink_count?: number | null;
  backlinks_fetched_at?: string | null;
}

export interface PageLink {
  id: number;
  to_url: string;
  anchor_text: string | null;
  link_type: string;
  position: number;
}

export interface PageSummary {
  id: number;
  domain: number;
  host: string;
  url: string;
  http_status: number;
  content_type: string;
  fetched_at: string;
  title: string;
  language: string | null;
  links: PageLink[];
}

export interface PageDetail extends PageSummary {
  content_length: number | null;
  description: string;
  meta_keywords: string;
  seo_score: number | null;
  seo_fetched_at: string | null;
}

export interface DomainInsights {
  domain: string;
  authority_score: number | null;
  fetched_at: string | null;
}

export interface DomainBacklinks {
  domain: string;
  backlink_count: number | null;
  fetched_at: string | null;
}

export interface PageSeoScore {
  page: string;
  seo_score: number | null;
  fetched_at: string | null;
}

export interface ExportJob {
  id: number;
  filter_params: Record<string, unknown>;
  format: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  row_count: number | null;
  created_at: string;
  completed_at: string | null;
  error: unknown;
  download_url: string | null;
}

export interface Stats {
  total_domains: number;
  total_pages: number;
  pages_2xx: number;
  pages_4xx: number;
  pages_5xx: number;
  total_backlinks: number;
}
