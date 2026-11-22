import React from 'react';
import { useCms, type CmsImageKey } from './CmsProvider';
import type { CmsSectionKey } from './content.gen';
import type { CmsImage, CmsLink } from './types';
import type { ImageRef } from '../types/api';
import { useNavigation } from '../context/NavigationContext';

const MOBILE_QUERY = '(max-width: 767px)';

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & { alt?: string };

/** Desktop and mobile files in one <picture>; the mobile file is used below 768px. */
export const Picture: React.FC<ImgProps & { image: CmsImage | ImageRef | null | undefined }> = ({ image, alt, ...rest }) => {
  if (!image) return null;
  const desktop = 'url' in image ? image.url : (image.desktop ?? image.mobile);
  const mobile = 'url' in image ? (image.mobileUrl ?? image.url) : (image.mobile ?? image.desktop);
  if (!desktop && !mobile) return null;
  const text = alt ?? image.alt ?? '';
  if (!mobile || mobile === desktop) return <img src={desktop ?? mobile ?? undefined} alt={text} {...rest} />;
  return (
    <picture className="contents">
      <source media={MOBILE_QUERY} srcSet={mobile} />
      <img src={desktop ?? mobile} alt={text} {...rest} />
    </picture>
  );
};

/** An image slot from the CMS by key. */
export const CmsImg: React.FC<ImgProps & { k: CmsImageKey }> = ({ k, ...rest }) => {
  const { img } = useCms();
  return <Picture image={img(k)} {...rest} />;
};

/** Pick the right file for the current screen (for CSS backgrounds). */
export function useImageUrl(image: CmsImage | null | undefined): string | null {
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const on = () => setIsMobile(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);
  if (!image) return null;
  return isMobile ? (image.mobile ?? image.desktop) : (image.desktop ?? image.mobile);
}

/**
 * Renders children only if the admin has the section switched on, and only on the devices it is
 * enabled for. `display: contents` keeps the wrapper out of the layout.
 */
export const CmsSection: React.FC<{ k: CmsSectionKey; children: React.ReactNode }> = ({ k, children }) => {
  const { section } = useCms();
  const s = section(k);
  if (!s.enabled || (!s.desktop && !s.mobile)) return null;
  if (s.desktop && s.mobile) return <>{children}</>;
  return <div className={s.desktop ? 'hidden md:contents' : 'contents md:hidden'}>{children}</div>;
};

/** True when a section should render at all (for components that decide their own wrapper). */
export function useSectionVisible(k: CmsSectionKey): { show: boolean; className: string } {
  const { section } = useCms();
  const s = section(k);
  const show = s.enabled && (s.desktop || s.mobile);
  const className = s.desktop && s.mobile ? '' : s.desktop ? 'hidden md:block' : 'md:hidden';
  return { show, className };
}

/** A CMS link: in-app navigation for internal paths, new tab for external sites. */
export const CmsA: React.FC<Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { link: CmsLink | string; children?: React.ReactNode }> = ({ link, children, onClick, ...rest }) => {
  const { navigateHref, isInternalHref } = useNavigation();
  const href = typeof link === 'string' ? link : link.href;
  const label = typeof link === 'string' ? undefined : link.label;
  const external = !!href && !isInternalHref(href) && !href.startsWith('#') && !/^(mailto|tel):/i.test(href);
  return (
    <a
      href={href || undefined}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || external || !href || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigateHref(href);
      }}
      {...rest}
    >
      {children ?? label}
    </a>
  );
};

// ── rich text ────────────────────────────────────────────────────────────────────────────────
// A small, safe Markdown subset (no HTML is ever injected): paragraphs, ## / ### headings,
// "- " bullet lists, "1. " numbered lists, **bold**, *italic*, [label](href).
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2]) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={key}>{m[3]}</em>);
    else if (m[4] && m[5] && !/^\s*javascript:/i.test(m[5])) out.push(<CmsA key={key} link={m[5]} className="underline underline-offset-2 hover:text-[#B45309]">{m[4]}</CmsA>);
    else out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** One line of CMS text with **bold**, *italic* and [links](/path). Pass `strongClass` to style the bold parts. */
export const InlineText: React.FC<{ text: string; strongClass?: string; emClass?: string }> = ({ text, strongClass, emClass }) => {
  // Line breaks typed by the admin become <br />.
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 && <br />}
          {inline(line, `i${li}`).map((n) => {
            if (!React.isValidElement(n)) return n;
            const el = n as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
            if (el.type === 'strong' && strongClass) return <strong key={el.key} className={strongClass}>{el.props.children}</strong>;
            if (el.type === 'em' && emClass) return <em key={el.key} className={emClass}>{el.props.children}</em>;
            return n;
          })}
        </React.Fragment>
      ))}
    </>
  );
};

export const RichText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        if (block.startsWith('### ')) return <h3 key={bi} className="font-bold text-lg mt-6 mb-2">{inline(block.slice(4), `h${bi}`)}</h3>;
        if (block.startsWith('## ')) return <h2 key={bi} className="font-serif-heading font-bold text-2xl mt-8 mb-3">{inline(block.slice(3), `h${bi}`)}</h2>;
        if (lines.every((l) => /^[-*] /.test(l))) {
          return <ul key={bi} className="list-disc pl-5 space-y-1 my-3">{lines.map((l, li) => <li key={li}>{inline(l.slice(2), `u${bi}-${li}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return <ol key={bi} className="list-decimal pl-5 space-y-1 my-3">{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\d+\. /, ''), `o${bi}-${li}`)}</li>)}</ol>;
        }
        return <p key={bi} className="my-3 leading-relaxed">{lines.map((l, li) => <React.Fragment key={li}>{li > 0 && <br />}{inline(l, `p${bi}-${li}`)}</React.Fragment>)}</p>;
      })}
    </div>
  );
};
