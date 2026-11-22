import { useEffect } from 'react';
import { useCms } from './CmsProvider';
import type { ApiError } from '../lib/api';

function setMeta(attr: 'name' | 'property', key: string, content: string | null | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Page <title>, description and social preview from the page's SEO settings in the CMS, falling
 * back to the site defaults. `override` lets data pages (a product) supply their own.
 */
export function useSeo(pageKey: string, override?: { title?: string | null; description?: string | null; image?: string | null }) {
  const cms = useCms();
  const page = cms.page(pageKey);
  const siteName = cms.t('global.seo.site_name');
  const template = cms.t('global.seo.title_template');
  const rawTitle = override?.title || page?.seo.title || page?.label || '';
  const title = rawTitle ? template.replace('{title}', rawTitle).replace('{site}', siteName) : siteName;
  const description = override?.description || page?.seo.description || cms.t('global.seo.default_description');
  const defaultImage = cms.img('global.seo.default_image');
  const image = override?.image || page?.seo.image?.desktop || defaultImage.desktop;

  useEffect(() => {
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:site_name', siteName);
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  }, [title, description, image, siteName]);
}

/** Customer-facing message for an error code, from CMS microcopy (Global → Error messages). */
export function useErrorMessage() {
  const cms = useCms();
  return (err: unknown): string => {
    const code = (err as ApiError | undefined)?.code;
    const text = code ? cms.lookup(`global.errors.${code.toLowerCase()}`) : undefined;
    return typeof text === 'string' && text ? text : cms.t('global.errors.generic');
  };
}
