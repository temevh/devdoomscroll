import { type Generated } from "kysely";

export interface Database {
  sources: { id: string; scrape_interval_minutes: number; enabled: boolean };
  scrape_runs: {
    id: Generated<string>;
    source_id: string;
    started_at: Generated<Date>;
    finished_at: Date | null;
    status: "succeed" | "running" | "failed";
    items_fetched: number | null;
    items_new: number | null;
    error: string | null;
  };
  posts: {
    id: Generated<string>;
    source_id: string;
    external_id: string;
    title: string;
    preview: string | null;
    url: string;
    image: string | null;
    published_at: Date;
  };
  tags: { id: Generated<string>; name: string };
  post_tags: { post_id: string; tag_id: string };
}
