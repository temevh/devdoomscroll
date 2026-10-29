export interface Post {
  externalId: string;
  title: string;
  preview: string | null;
  url: string;
  image: string | null;
  publishedAt: Date;
  tags: string[];
}
