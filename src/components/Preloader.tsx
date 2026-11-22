import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf, Sparkles } from 'lucide-react';
import { useCms } from '../cms/CmsProvider';
import { CmsImg, InlineText } from '../cms/components';

/**
 * Brand loading screen. It stays until the site content (CMS) has loaded at least once; repeat
 * visits use the cached copy, so it only plays its short animation. If the very first load fails
 * (offline, server down) it offers a retry: that one message cannot come from the CMS, because
 * the CMS is what failed to load.
 */
export const Preloader: React.FC = () => {
  const cms = useCms();
  const [progress, setProgress] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isRendered, setIsRendered] = useState(true);
  const ready = cms.status === 'ready';

  useEffect(() => {
    const startTime = Date.now();
    const duration = 650;
    const interval = setInterval(() => {
      const raw = Math.min(100, Math.round(((Date.now() - startTime) / duration) * 100));
      const t = raw / 100;
      setProgress(Math.round((1 - Math.pow(1 - t, 3)) * 100));
      if (raw >= 100) {
        clearInterval(interval);
        setAnimDone(true);
      }
    }, 25);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!animDone || !ready) return;
    const a = setTimeout(() => setIsDone(true), 120);
    const b = setTimeout(() => setIsRendered(false), 750);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [animDone, ready]);

  const handleSkip = () => {
    if (!ready) return;
    setIsDone(true);
    setTimeout(() => setIsRendered(false), 300);
  };

  if (!isRendered) return null;

  return (
    <AnimatePresence>
      {!isDone && (
        <motion.div
          key="preloader-overlay"
          initial={{ opacity: 1, y: 0 }}
          exit={{ y: '-100%', transition: { duration: 0.65, ease: [0.76, 0, 0.24, 1] } }}
          onClick={handleSkip}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white text-[#18181B] cursor-pointer select-none overflow-hidden"
          aria-label={ready ? cms.t('global.common.loading') : 'Loading'}
          role="status"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(245,209,3,0.12)_0%,_rgba(255,255,255,0.95)_60%,_#FFFFFF_100%)] pointer-events-none" />
          <div
            className="absolute inset-0 opacity-[0.025] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #18181B 1px, transparent 0)', backgroundSize: '32px 32px' }}
          />

          <div className="relative z-10 flex flex-col items-center px-6 max-w-sm mx-auto text-center">
            {ready && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="inline-flex items-center gap-1.5 text-[#245E4A] text-xs font-bold uppercase tracking-widest mb-4"
                >
                  <Leaf className="w-3.5 h-3.5 fill-[#245E4A]" />
                  <span>{cms.t('global.brand.name')}</span>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="relative mb-5"
                >
                  <CmsImg k="global.brand.loader_logo" className="w-48 sm:w-56 h-auto object-contain drop-shadow-xs" />
                </motion.div>

                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15, ease: 'easeOut' }}
                  className="font-serif-heading text-sm text-stone-600 tracking-wide mb-6 font-normal"
                >
                  <InlineText text={cms.t('global.brand.tagline')} emClass="italic font-normal text-[#245E4A]" />
                </motion.p>
              </>
            )}

            {cms.status === 'error' ? (
              // Shown only when the very first load fails: there is no CMS content to show yet.
              <div className="flex flex-col items-center gap-3 text-sm text-stone-600" role="alert">
                <p>We can&apos;t load the shop right now. Please check your connection.</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void cms.reload();
                  }}
                  className="px-4 py-2 rounded-full bg-[#F5D103] text-[#18181B] font-bold text-xs cursor-pointer"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <div className="w-44 sm:w-52 h-[3px] bg-stone-100 rounded-full overflow-hidden p-0 mb-3 shadow-inner relative">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#245E4A] via-[#F5D103] to-[#245E4A] rounded-full"
                    style={{ width: `${ready ? progress : Math.min(progress, 90)}%` }}
                    transition={{ ease: 'linear' }}
                  />
                </div>
                <div className="flex items-center justify-between w-44 sm:w-52 text-[10.5px] text-stone-600 font-mono">
                  <span className="flex items-center gap-1 text-[#245E4A] font-semibold">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>{ready ? cms.t('global.brand.loader_status') : ''}</span>
                  </span>
                  <span className="font-bold text-[#18181B]">{ready ? progress : Math.min(progress, 90)}%</span>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
