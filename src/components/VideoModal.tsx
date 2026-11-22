import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useCms } from '../cms/CmsProvider';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({ isOpen, onClose }) => {
  const cms = useCms();
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const url = cms.get('home.video.url');
  const poster = cms.img('home.video.poster');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={cms.t('home.video.title')}
      onClick={onClose}
    >
      <div className="relative w-full max-w-4xl bg-stone-900 rounded-3xl overflow-hidden shadow-2xl border border-stone-800" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black flex items-center justify-center transition-colors"
          aria-label={cms.t('home.video.close_aria')}
        >
          <X className="w-5 h-5" />
        </button>
        <div className="p-4 bg-stone-950/80 border-b border-stone-800 flex items-center justify-between">
          <div>
            <h4 className="text-white text-sm font-bold">{cms.t('home.video.title')}</h4>
            <p className="text-stone-400 text-xs">{cms.t('home.video.subtitle')}</p>
          </div>
        </div>
        <div className="relative aspect-video w-full bg-black">
          {url && (
            <video className="w-full h-full object-cover" controls autoPlay poster={poster.desktop ?? undefined}>
              <source src={url} type="video/mp4" />
              {cms.t('home.video.unsupported')}
            </video>
          )}
        </div>
      </div>
    </div>
  );
};
