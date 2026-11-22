import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { rpc } from '../lib/api';
import { useCms } from '../cms/CmsProvider';
import { useNavigation } from '../context/NavigationContext';

/** Landing page for the confirm / unsubscribe links in newsletter emails. */
export const NewsletterLinkPage: React.FC<{ action: string | null }> = ({ action }) => {
  const cms = useCms();
  const { goToHome } = useNavigation();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    const fn = action === 'unsubscribe' ? 'unsubscribe_newsletter' : 'confirm_newsletter';
    rpc(fn, { p_token: token }).then(() => setState('done'), () => setState('failed'));
  }, [action]);

  const unsub = action === 'unsubscribe';
  const title = state === 'working' ? cms.t('global.newsletter_links.working')
    : state === 'failed' ? cms.t('global.newsletter_links.failed_title')
    : unsub ? cms.t('global.newsletter_links.unsubscribe_title') : cms.t('global.newsletter_links.confirm_title');
  const text = state === 'failed' ? cms.t('global.newsletter_links.failed_text')
    : state === 'done' ? (unsub ? cms.t('global.newsletter_links.unsubscribe_text') : cms.t('global.newsletter_links.confirm_text')) : '';

  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md" role="status" aria-live="polite">
        {state !== 'working' && (
          <div className={`w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center ${state === 'done' ? 'bg-amber-100 text-[#B45309]' : 'bg-rose-50 text-rose-500'}`}>
            {state === 'done' ? <CheckCircle2 className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
          </div>
        )}
        <h1 className="font-serif-heading font-bold text-3xl text-[#18181B] mb-2">{title}</h1>
        {text && <p className="text-sm text-[#737A72] mb-6">{text}</p>}
        {state !== 'working' && (
          <button type="button" onClick={goToHome} className="px-6 py-3 rounded-full bg-[#18181B] text-[#F5D103] text-xs font-bold cursor-pointer">{cms.t('global.newsletter_links.home')}</button>
        )}
      </div>
    </div>
  );
};
