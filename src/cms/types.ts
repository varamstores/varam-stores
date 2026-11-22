/** An image slot: separate desktop and mobile files (either may fall back to the other). URLs are resolved by Postgres. */
export type CmsImage = { desktop: string | null; mobile: string | null; alt: string };
/** A link: `href` is an internal path ("/shop?category=rice-millets"), "#section", mailto:/tel:, or a full URL. */
export type CmsLink = { label: string; href: string };

export interface CmsSectionInfo {
  position: number;
  enabled: boolean;
  desktop: boolean;
  mobile: boolean;
}

export interface CmsPageInfo {
  label: string;
  route: string | null;
  kind: 'global' | 'system' | 'static';
  isPublished: boolean;
  seo: { title: string | null; description: string | null; image: CmsImage | null };
  sections: Record<string, CmsSectionInfo>;
}

export interface CmsBundle {
  version: number;
  locale: string;
  pages: Record<string, CmsPageInfo>;
  entries: Record<string, unknown>;
}
