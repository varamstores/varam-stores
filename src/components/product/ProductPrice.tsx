import React from 'react';
import { useCms } from '../../cms/CmsProvider';
import { formatMoney } from '../../lib/money';
import type { ProductSummary } from '../../types/api';

/**
 * Price block used everywhere a product is shown. Follows UK price-marking rules: the selling
 * price, the pack size, the unit price (per kg / litre), and a comparison price only when it is
 * genuine (RRP, or a was-price from real price history).
 */
export const ProductPrice: React.FC<{ product: ProductSummary; size?: 'sm' | 'md' | 'lg'; showUnitPrice?: boolean }> = ({
  product,
  size = 'md',
  showUnitPrice = true,
}) => {
  const cms = useCms();
  const priceClass = size === 'lg' ? 'text-2xl sm:text-3xl' : size === 'sm' ? 'text-sm' : 'text-base';
  const per = product.saleUnit === 'weight' ? cms.t('global.common.per_kg_short') : cms.t('global.common.per_pack', { pack: product.packSize });
  const compare = product.wasPrice ?? product.rrp;
  const compareLabel = product.wasPrice ? 'global.common.was' : 'global.common.rrp';
  const unit = product.unitPrice && product.unitPrice.per !== 'each' && product.saleUnit !== 'weight' ? product.unitPrice : null;

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`${priceClass} font-extrabold text-[#18181B]`}>{formatMoney(product.price)}</span>
        <span className="text-xs text-[#737A72]">{per}</span>
        {compare && compare.amount > product.price.amount && (
          <span className="text-xs text-stone-400 line-through ml-1">{cms.t(compareLabel, { price: formatMoney(compare) })}</span>
        )}
      </div>
      {showUnitPrice && unit && (
        <span className="text-[11px] text-[#737A72]">
          {cms.t(unit.per === 'kg' ? 'global.common.per_kg' : 'global.common.per_l', { price: formatMoney(unit.price) })}
        </span>
      )}
    </div>
  );
};

export const AvailabilityNote: React.FC<{ product: ProductSummary; className?: string }> = ({ product, className }) => {
  const cms = useCms();
  if (product.availability === 'in_stock') return null;
  const key = product.availability === 'low_stock' ? 'global.common.low_stock'
    : product.availability === 'out_of_stock' ? 'global.common.out_of_stock' : 'global.common.unknown_location';
  const tone = product.availability === 'out_of_stock' ? 'text-rose-600' : 'text-[#B45309]';
  return <span className={`text-[11px] font-bold ${tone} ${className ?? ''}`}>{cms.t(key)}</span>;
};

/** "2" for items sold each, "1.5 kg" for weighed items (steps → grams). */
export function amountLabel(product: ProductSummary, steps: number): string {
  if (product.saleUnit !== 'weight') return String(steps);
  const min = product.minWeightGrams ?? 1000;
  const step = product.weightStepGrams ?? min;
  const grams = steps <= 0 ? 0 : min + (steps - 1) * step;
  return grams >= 1000 ? `${Number((grams / 1000).toFixed(2))} kg` : `${grams} g`;
}

/** "2 in basket" or "2 kg in basket" for weighed items. */
export function basketAmountLabel(cms: ReturnType<typeof useCms>, product: ProductSummary, steps: number): string {
  return cms.t('global.common.in_basket', { count: amountLabel(product, steps) });
}
