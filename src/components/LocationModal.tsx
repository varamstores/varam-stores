import React, { useEffect, useRef, useState } from 'react';
import { X, MapPin, Clock, Check } from 'lucide-react';
import { AnimatedModal } from './transitions/AnimatedModal';
import { useCart } from '../context/CartContext';
import { usePopularAreas } from '../lib/catalogue';
import { useDeliverySlots } from '../lib/delivery';
import { useCms } from '../cms/CmsProvider';
import { InlineText } from '../cms/components';
import { useErrorMessage } from '../cms/hooks';
import { formatMoney } from '../lib/money';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Postcode entry: prices delivery for the area, checks stock there and shows the next delivery windows. */
export const LocationModal: React.FC<LocationModalProps> = ({ isOpen, onClose }) => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const { cart, setPostcode, showToast } = useCart();
  const { data: areas = [] } = usePopularAreas();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: slots = [], isLoading: slotsLoading } = useDeliverySlots(isOpen ? cart?.postcode : null, 3);

  useEffect(() => {
    if (isOpen) {
      setInput(cart?.postcode ?? '');
      setError(null);
    }
  }, [isOpen, cart?.postcode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const view = await setPostcode(input);
      showToast(cms.t('global.toasts.postcode_set', { postcode: view.postcode ?? input.toUpperCase() }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md" className="p-6 sm:p-8" ariaLabel={cms.t('basket.location.title')}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
        aria-label={cms.t('basket.location.close_aria')}
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-amber-100 text-[#B45309] flex items-center justify-center">
          <MapPin className="w-4 h-4" />
        </div>
        <h3 className="font-serif-heading text-xl font-bold text-[#18181B]">{cms.t('basket.location.title')}</h3>
      </div>
      <p className="text-xs text-[#737A72] mb-5">{cms.t('basket.location.text')}</p>

      {cart?.zone && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/70 text-xs text-[#18181B] flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-[#B45309]" />
          <span><InlineText text={cms.t('basket.location.current', { area: `${cart.zone.name} (${cart.postcode})` })} /></span>
        </div>
      )}

      <form onSubmit={submit} className="mb-5" noValidate>
        <label htmlFor="postcode-input" className="text-xs font-bold text-[#18181B] block mb-1">{cms.t('basket.location.label')}</label>
        <div className="flex gap-2">
          <input
            id="postcode-input"
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="postal-code"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder={cms.t('basket.location.placeholder')}
            aria-invalid={!!error}
            aria-describedby={error ? 'postcode-error' : undefined}
            className="flex-1 text-sm uppercase px-3 py-2 rounded-xl border border-stone-200 focus:outline-none focus:border-[#F5D103]"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-[#F5D103] hover:bg-[#E5A800] text-[#18181B] text-xs font-bold rounded-xl transition-colors cursor-pointer active:scale-95 disabled:opacity-60"
          >
            {cms.t('basket.location.submit')}
          </button>
        </div>
        {error && <p id="postcode-error" role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-600">{error}</p>}
      </form>

      {areas.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold text-[#18181B] mb-1">{cms.t('basket.location.popular_title')}</p>
          <p className="text-[11px] text-stone-500 mb-2">{cms.t('basket.location.popular_hint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {areas.map((a) => {
              const district = a.label.split(',').pop()?.trim() ?? '';
              const selected = cart?.zone?.code === a.code;
              return (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => {
                    setInput(`${district} `);
                    inputRef.current?.focus();
                  }}
                  className={`text-left p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer active:scale-98 ${
                    selected ? 'bg-amber-100 border-[#F5D103] text-[#18181B] font-bold' : 'border-stone-200 hover:bg-stone-50 text-[#18181B]'
                  }`}
                >
                  <span>{a.label}</span>
                  {selected && <Check className="w-3.5 h-3.5 text-[#B45309]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cart?.postcode && cart.zone && (
        <div>
          <p className="text-xs font-bold text-[#18181B] flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-[#B45309]" />
            <span>{cms.t('basket.location.slots_title')}</span>
          </p>
          {slotsLoading ? (
            <p className="text-xs text-stone-500">{cms.t('global.common.loading')}</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-stone-500">{cms.t('basket.location.slots_none')}</p>
          ) : (
            <ul className="space-y-1.5">
              {slots.slice(0, 4).map((s) => (
                <li key={s.id} className={`w-full p-2.5 rounded-xl border text-xs flex items-center justify-between ${s.availability === 'full' ? 'border-stone-100 text-stone-400' : 'border-stone-200 text-[#18181B]'}`}>
                  <span>
                    <strong>{s.dayLabel}</strong>, {s.timeLabel}
                    {s.serviceLabel ? ` (${s.serviceLabel})` : ''}
                  </span>
                  <span className="font-semibold">
                    {s.availability === 'full' ? cms.t('basket.location.slots_full') : s.surcharge ? `+${formatMoney(s.surcharge)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-stone-500">{cms.t('basket.location.slots_note')}</p>
        </div>
      )}
    </AnimatedModal>
  );
};
