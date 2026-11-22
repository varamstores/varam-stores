import React, { useState } from 'react';
import { Sprout, ShieldCheck, ArrowRight, MapPin, Mail, Phone, Clock } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useNavigation } from '../context/NavigationContext';
import { Link000, Link001 } from './ui/skiper40';
import { useCms } from '../cms/CmsProvider';
import { CmsImg, Picture } from '../cms/components';
import { CmsIcon } from '../cms/icons';
import { useErrorMessage } from '../cms/hooks';
import { useStorefrontConfig } from '../lib/catalogue';
import { rpc } from '../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "+441234567890" → "+44 1234 567890" for display. */
function displayPhone(e164: string): string {
  const m = e164.match(/^\+44(\d{4})(\d+)$/);
  return m ? `+44 ${m[1]} ${m[2]}` : e164;
}

/** Hides links to CMS pages that are not published yet, so the footer never shows dead links. */
export function useLinkIsLive() {
  const cms = useCms();
  return (href: string) => {
    if (!href) return false;
    const m = href.match(/^\/pages\/([^/?#]+)/);
    if (!m) return true;
    return !!cms.page(decodeURIComponent(m[1]))?.isPublished;
  };
}

const FooterLink: React.FC<{ href: string; className?: string; children: React.ReactNode }> = ({ href, className, children }) => {
  const { navigateHref, isInternalHref } = useNavigation();
  const external = /^https?:/i.test(href);
  return (
    <Link000
      href={href}
      className={className}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={(e) => {
        if (isInternalHref(href) || href.startsWith('#')) {
          e.preventDefault();
          navigateHref(href);
        }
      }}
    >
      {children}
    </Link000>
  );
};

export const Footer: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const isLive = useLinkIsLive();
  const { showToast } = useCart();
  const { navigateHref } = useNavigation();
  const { data: config } = useStorefrontConfig();
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      showToast(cms.t('global.footer_newsletter.invalid'));
      return;
    }
    setIsSending(true);
    try {
      await rpc('subscribe_newsletter', { p_email: email.trim(), p_source: 'footer' });
      setIsSubscribed(true);
      setEmail('');
      showToast(cms.t('global.footer_newsletter.success'));
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  const columns = [
    { title: cms.t('global.footer_main.shop_title'), links: cms.get('global.footer_main.shop_links') },
    { title: cms.t('global.footer_main.company_title'), links: cms.get('global.footer_main.company_links') },
    { title: cms.t('global.footer_main.help_title'), links: cms.get('global.footer_main.help_links') },
  ].map((c) => ({ ...c, links: c.links.filter((l) => isLive(l.href)) }));
  const socials = cms.get('global.footer_main.socials').filter((s) => s.href.trim());
  const legal = cms.get('global.footer_bottom.legal_links').filter((l) => isLive(l.href));
  const staff = cms.link('global.footer_bottom.staff_link');
  const hours = cms.get('global.footer_main.hours');

  return (
    <footer className="w-full bg-white text-[#18181B] border-t border-stone-200/80">
      {/* 1. Newsletter */}
      <section className="relative w-full bg-white border-b border-stone-200/80 overflow-hidden py-10 sm:py-12 lg:py-14 opacity-100">
        <div className="hidden lg:block absolute right-0 top-0 bottom-0 h-full w-full lg:w-1/2 pointer-events-none overflow-hidden select-none">
          <CmsImg k="global.footer_newsletter.image" className="absolute right-0 top-1/2 -translate-y-1/2 h-full w-auto max-w-none object-contain object-right opacity-80" />
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 xl:col-span-7 flex flex-col items-start">
              <div className="inline-flex items-center gap-2 mb-2.5">
                <span className="w-5 h-5 rounded-full bg-[#F5D103] flex items-center justify-center text-[#18181B]">
                  <Sprout className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#18181B]">{cms.t('global.footer_newsletter.eyebrow')}</span>
              </div>
              <h2 className="font-serif-heading font-bold text-3xl sm:text-4xl lg:text-[42px] text-[#18181B] leading-[1.12] tracking-tight mb-3">
                {cms.t('global.footer_newsletter.title')} <br />
                <span className="italic font-normal text-[#18181B]">{cms.t('global.footer_newsletter.title_italic')}</span>
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-w-lg">{cms.t('global.footer_newsletter.subtitle')}</p>
            </div>

            <div className="lg:col-span-6 xl:col-span-5 flex flex-col items-start lg:items-end">
              <form onSubmit={handleSubscribe} className="w-full max-w-lg" noValidate>
                <div className="flex items-center bg-stone-50 rounded-full p-1.5 border border-stone-200 shadow-sm focus-within:border-[#F5D103] focus-within:ring-2 focus-within:ring-[#F5D103]/20 transition-all">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={cms.t('global.footer_newsletter.placeholder')}
                    className="w-full bg-transparent px-4 py-2.5 text-xs sm:text-sm text-[#18181B] placeholder-stone-400 focus:outline-none"
                    aria-label={cms.t('global.footer_newsletter.aria')}
                  />
                  <button
                    type="submit"
                    disabled={isSending}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs sm:text-sm font-extrabold transition-all shadow-xs shrink-0 cursor-pointer group btn-magnetic disabled:opacity-60"
                  >
                    <span>{isSubscribed ? cms.t('global.footer_newsletter.button_done') : cms.t('global.footer_newsletter.button')}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2.5 pl-3 text-[11px] sm:text-xs text-stone-500">
                  <ShieldCheck className="w-4 h-4 text-[#B45309] shrink-0" />
                  <span>{cms.t('global.footer_newsletter.note')}</span>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Links & contact */}
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-12 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-8 lg:gap-6 pb-12 border-b border-stone-200/80">
          <div className="col-span-2 md:col-span-3 lg:col-span-4 flex flex-col items-start pr-0 lg:pr-6">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateHref('/');
              }}
              className="inline-block mb-4 group"
              aria-label={cms.t('global.brand.home_aria')}
            >
              <div className="overflow-hidden rounded-xl border border-stone-200/80 shadow-xs hover:shadow-md transition-all duration-300 max-w-[260px] sm:max-w-[280px] bg-white">
                <CmsImg k="global.footer_main.logo" className="w-full h-auto object-contain group-hover:scale-105 transition-transform duration-300" />
              </div>
            </a>
            <p className="text-xs text-stone-600 leading-relaxed mb-4 max-w-sm">
              <strong className="text-[#18181B]">{cms.t('global.footer_main.tagline')}</strong>
              <br />
              {cms.t('global.footer_main.blurb')}
            </p>
            {socials.length > 0 && (
              <div className="flex items-center gap-2 text-stone-700 mt-1">
                {socials.map((s, i) => (
                  <a
                    key={i}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-full bg-stone-100 hover:bg-[#F5D103] hover:text-[#18181B] flex items-center justify-center border border-stone-200/60 shadow-2xs transition-colors"
                    aria-label={s.label}
                  >
                    <CmsIcon name={s.icon} className="w-3.5 h-3.5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {columns.map((col, ci) => (
            <div key={ci} className="lg:col-span-2">
              <h3 className="text-sm font-bold text-[#18181B] tracking-tight mb-3.5">{col.title}</h3>
              <ul className="space-y-2 text-xs text-stone-600">
                {col.links.map((link, idx) => (
                  <li key={idx}>
                    <FooterLink href={link.href} className="hover:text-[#B45309] text-left transition-colors">{link.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="lg:col-span-2">
            <h3 className="text-sm font-bold text-[#18181B] tracking-tight mb-3.5">{cms.t('global.footer_main.contact_title')}</h3>
            <ul className="space-y-3 text-xs text-stone-600">
              {cms.t('global.footer_main.address') && (
                <li className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#18181B] shrink-0 mt-0.5" />
                  <span>{cms.t('global.footer_main.address')}</span>
                </li>
              )}
              {config?.supportEmail && (
                <li className="flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-[#18181B] shrink-0 mt-0.5" />
                  <Link000 href={`mailto:${config.supportEmail}`} className="hover:text-[#B45309] transition-colors">{config.supportEmail}</Link000>
                </li>
              )}
              {config?.supportPhone && (
                <li className="flex items-start gap-2.5">
                  <Phone className="w-4 h-4 text-[#18181B] shrink-0 mt-0.5" />
                  <Link000 href={`tel:${config.supportPhone}`} className="hover:text-[#B45309] transition-colors">{displayPhone(config.supportPhone)}</Link000>
                </li>
              )}
              {hours.length > 0 && (
                <li className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[#18181B] shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    {hours.map((h, i) => (
                      <p key={i} className={i > 0 ? 'text-stone-500 mt-0.5' : ''}>{h}</p>
                    ))}
                  </div>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* 3. Bottom bar */}
        <div className="pt-6 flex flex-col lg:flex-row items-center justify-between gap-5 text-xs text-stone-500">
          <p className="text-center lg:text-left">{cms.t('global.footer_bottom.copyright', { year: new Date().getFullYear() })}</p>

          <div className="flex items-center gap-3 sm:gap-5 text-stone-500 flex-wrap justify-center">
            {legal.map((l, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-stone-300">|</span>}
                <FooterLink href={l.href} className="hover:text-[#B45309] transition-colors">{l.label}</FooterLink>
              </React.Fragment>
            ))}
            {staff.label && (
              <>
                {legal.length > 0 && <span className="text-stone-300">|</span>}
                <Link001
                  href={staff.href}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateHref(staff.href);
                  }}
                  className="text-[#B45309] hover:text-[#D97706] font-medium transition-colors"
                >
                  {staff.label}
                </Link001>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center" aria-label={cms.t('global.footer_bottom.payments_aria')}>
            {cms.get('global.footer_bottom.payment_logos').map((p, i) => (
              <Picture key={i} image={p.image} alt={p.label} title={p.label} className="h-6 sm:h-7 w-auto rounded shadow-2xs hover:scale-105 transition-transform" />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};
