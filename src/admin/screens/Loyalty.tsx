import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { useAction, useAdminQuery, errorText, pence } from '../lib';
import { Badge, Button, Card, Checkbox, ConfirmButton, ErrorState, Field, Loading, Modal, MoneyInput, Notice, NumberInput, Screen, Stat, Table, Td, TextInput, Th, Toggle, Tr } from '../ui';

interface Loyalty {
  enabled: boolean; pointsPerPound: number; pointValuePence: number;
  tiers: Array<{ code: string; name: string; minLifetimePoints: number; multiplier: number; members: number }>;
  rewards: Array<{ id: string; title: string; pointsCost: number; isActive: boolean; amountMinor: number; minBasketMinor: number | null; redeemed: number }>;
  totals: { members: number; pointsOutstanding: number };
}
type Tier = Loyalty['tiers'][number];
type Reward = Loyalty['rewards'][number];

export default function LoyaltyScreen(_: ScreenProps) {
  const { hasPermission } = useAuth();
  const { data, isLoading, error, refetch } = useAdminQuery<Loyalty>('admin_get_loyalty');
  const { run, busy } = useAction();
  const [tier, setTier] = useState<Partial<Tier> | null>(null);
  const [reward, setReward] = useState<Partial<Reward> | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const canSettings = hasPermission('full_access');
  const refresh = ['admin_get_loyalty', 'admin_get_settings'];
  return (
    <Screen
      title="Loyalty"
      intro="Customers earn points when their order is charged, and swap points for money off."
      guide={<ul>
        <li>Points are earned on the products in an order (after discounts), once it is picked and charged. Refunds take the points back.</li>
        <li><b>Tiers</b> reward loyal customers: reaching a tier’s points (earned ever) multiplies future points, e.g. ×1.5.</li>
        <li><b>Rewards</b> are what points buy: “£5 off for 500 points”. Customers swap points for a personal one-time code in their account.</li>
      </ul>}
    >
      {isLoading ? <Loading /> : error || !data ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Members with points" value={data.totals.members} />
            <Stat label="Points not yet used" value={data.totals.pointsOutstanding.toLocaleString('en-GB')} hint={`worth ${pence(data.totals.pointsOutstanding * data.pointValuePence)}`} />
            <Stat label="Points per £1" value={data.pointsPerPound} />
            <Stat label="One point is worth" value={`${data.pointValuePence}p`} />
          </div>

          <Card title="Earning" description={canSettings ? undefined : 'Only a Store Manager can change these.'}>
            <div className="space-y-4">
              <Toggle checked={data.enabled} disabled={!canSettings || busy} onChange={(v) => void run('admin_update_setting', { p_key: 'loyalty_enabled', p_value: v }, { success: v ? 'Loyalty switched on' : 'Loyalty switched off', refresh })}
                label="Loyalty points switched on" description="When off, nobody earns or spends points (balances are kept)." />
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Points for every £1 spent" className="w-48"><NumberInput value={rate ?? data.pointsPerPound} onChange={setRate} min={0} max={100} disabled={!canSettings} /></Field>
                {rate != null && rate !== data.pointsPerPound && <Button variant="primary" loading={busy} onClick={async () => { const ok = await run('admin_update_setting', { p_key: 'loyalty_points_per_pound', p_value: rate }, { success: 'Saved', refresh }); if (ok !== undefined) setRate(null); }}>Save</Button>}
              </div>
              <p className="text-xs text-slate-500">Example: a £40 order earns {40 * data.pointsPerPound} points, worth {pence(40 * data.pointsPerPound * data.pointValuePence)}.</p>
            </div>
          </Card>

          <Card title="Tiers" padded={false} actions={<Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setTier({ multiplier: 1 })}>Add tier</Button>}>
            <Table>
              <thead><tr><Th>Tier</Th><Th className="text-right">Reached at (points earned ever)</Th><Th className="text-right">Points multiplier</Th><Th className="text-right">Customers</Th></tr></thead>
              <tbody>
                {data.tiers.map((t) => (
                  <Tr key={t.code} onClick={() => setTier(t)}>
                    <Td className="font-medium">{t.name}{t.minLifetimePoints === Math.min(...data.tiers.map((x) => x.minLifetimePoints)) && <> <Badge>Starting tier</Badge></>}</Td>
                    <Td className="text-right tabular-nums">{t.minLifetimePoints.toLocaleString('en-GB')}</Td>
                    <Td className="text-right tabular-nums">×{Number(t.multiplier)}</Td>
                    <Td className="text-right tabular-nums">{t.members}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="Rewards" padded={false} actions={<Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setReward({ isActive: true })}>Add reward</Button>}>
            {!data.rewards.length ? <p className="px-4 pb-4 text-sm text-slate-500">No rewards yet. Add one so customers can use their points.</p> : (
              <Table>
                <thead><tr><Th>Reward</Th><Th className="text-right">Costs</Th><Th className="text-right">Gives</Th><Th className="text-right">Swapped</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {data.rewards.map((r) => (
                    <Tr key={r.id} onClick={() => setReward(r)}>
                      <Td className="font-medium">{r.title}</Td>
                      <Td className="text-right tabular-nums">{r.pointsCost.toLocaleString('en-GB')} points</Td>
                      <Td className="text-right tabular-nums">{pence(r.amountMinor)} off{r.minBasketMinor ? ` over ${pence(r.minBasketMinor)}` : ''}</Td>
                      <Td className="text-right tabular-nums">{r.redeemed}</Td>
                      <Td>{r.isActive ? <Badge tone="green">Available</Badge> : <Badge>Off</Badge>}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {tier && <TierForm initial={tier} onClose={() => setTier(null)} />}
          {reward && <RewardForm initial={reward} pointValue={data.pointValuePence} onClose={() => setReward(null)} />}
        </>
      )}
    </Screen>
  );
}

const TierForm: React.FC<{ initial: Partial<Tier>; onClose: () => void }> = ({ initial, onClose }) => {
  const { run, busy } = useAction();
  const [name, setName] = useState(initial.name ?? '');
  const [min, setMin] = useState<number | null>(initial.minLifetimePoints ?? null);
  const [mult, setMult] = useState<number | null>(initial.multiplier != null ? Number(initial.multiplier) : 1);
  const save = async (del = false) => {
    const ok = await run('admin_save_loyalty_tier', { p_code: initial.code ?? null, p_name: name, p_min_lifetime_points: min ?? 0, p_multiplier: mult ?? 1, p_delete: del },
      { success: del ? 'Tier deleted' : 'Tier saved', refresh: ['admin_get_loyalty'] });
    if (ok !== undefined) onClose();
  };
  return (
    <Modal open onClose={onClose} title={initial.code ? `Edit ${initial.name}` : 'Add a tier'}
      footer={<>
        {initial.code && <ConfirmButton variant="danger" danger title={`Delete ${initial.name}?`} text="Its customers move to the tier that matches their points." confirmLabel="Delete" onConfirm={() => save(true)}>Delete</ConfirmButton>}
        <Button variant="ghost" onClick={onClose}>Go back</Button>
        <Button variant="primary" loading={busy} disabled={!name.trim() || min == null || !mult} onClick={() => void save()}>Save</Button>
      </>}>
      <Field label="Name" help="e.g. Silver, Gold"><TextInput value={name} onChange={setName} /></Field>
      <Field label="Reached when a customer has earned" help="Points earned ever (spending points does not lower it)."><NumberInput value={min} onChange={setMin} min={0} suffix="points" /></Field>
      <Field label="Points multiplier" help="1 = normal, 1.5 = 50% more points, 2 = double."><NumberInput decimals value={mult} onChange={setMult} /></Field>
      <Notice tone="info">Everyone’s tier is updated straight away to match these numbers.</Notice>
    </Modal>
  );
};

const RewardForm: React.FC<{ initial: Partial<Reward>; pointValue: number; onClose: () => void }> = ({ initial, pointValue, onClose }) => {
  const { run, busy } = useAction();
  const [r, setR] = useState<Partial<Reward>>(initial);
  const save = async () => {
    const ok = await run('admin_save_loyalty_reward', { p: { id: initial.id, title: r.title, pointsCost: r.pointsCost, amountMinor: r.amountMinor, minBasketMinor: r.minBasketMinor ?? '', isActive: r.isActive !== false } },
      { success: 'Reward saved', refresh: ['admin_get_loyalty', 'admin_list_promotions'] });
    if (ok !== undefined) onClose();
  };
  const fair = r.pointsCost && r.amountMinor ? Math.round((r.amountMinor / (r.pointsCost * pointValue)) * 100) : null;
  return (
    <Modal open onClose={onClose} title={initial.id ? `Edit ${initial.title}` : 'Add a reward'}
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant="primary" loading={busy} disabled={!r.title?.trim() || !r.pointsCost || !r.amountMinor} onClick={() => void save()}>Save</Button></>}>
      <Field label="Name customers see" help="e.g. £5 off your next order"><TextInput value={r.title} onChange={(v) => setR({ ...r, title: v })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Costs"><NumberInput value={r.pointsCost} onChange={(v) => setR({ ...r, pointsCost: v ?? undefined })} suffix="points" /></Field>
        <Field label="Money off"><MoneyInput value={r.amountMinor} onChange={(v) => setR({ ...r, amountMinor: v ?? undefined })} /></Field>
      </div>
      <Field label="Minimum spend to use it" optional><MoneyInput value={r.minBasketMinor} onChange={(v) => setR({ ...r, minBasketMinor: v })} /></Field>
      {fair != null && fair !== 100 && <Notice tone="info">This gives {fair}% of the points’ value ({pence((r.pointsCost ?? 0) * pointValue)} worth of points for {pence(r.amountMinor)} off).</Notice>}
      <Checkbox checked={r.isActive !== false} onChange={(v) => setR({ ...r, isActive: v })} label="Customers can choose this reward" />
    </Modal>
  );
};
