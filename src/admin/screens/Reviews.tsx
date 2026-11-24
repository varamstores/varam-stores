import { useState } from 'react';
import { Check, Star, X } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAction, useAdminQuery, dateTime, errorText } from '../lib';
import { Badge, Button, Card, Chips, Empty, ErrorState, Loading, SampleTag, Screen } from '../ui';

interface Review {
  id: string; status: string; rating: number; body: string; displayName: string; isVerified: boolean; isSample: boolean; createdAt: string;
  product: { id: string; name: string; slug: string } | null; moderatedBy: string | null; moderatedAt: string | null;
}

export default function ReviewsScreen(_: ScreenProps) {
  const [status, setStatus] = useState('pending');
  const { data, isLoading, error, refetch } = useAdminQuery<Review[]>('admin_list_reviews', { p_status: status });
  const { run, busy } = useAction();
  const decide = (id: string, s: 'approved' | 'rejected') => run('admin_moderate_review', { p_id: id, p_status: s }, { success: s === 'approved' ? 'Review published' : 'Review rejected', refresh: ['admin_list_reviews', 'admin_dashboard'] });
  return (
    <Screen
      title="Reviews"
      intro="Customer reviews wait here until someone approves them. Only approved reviews appear in the shop and count towards star ratings."
      guide={<ul>
        <li>Approve honest reviews, good or bad. Hiding fair negative reviews is not allowed under UK consumer law.</li>
        <li>Reject reviews that are rude, off-topic, contain personal details or are clearly fake.</li>
        <li><b>Verified</b> means the person bought the product from you.</li>
      </ul>}
    >
      <Chips value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Waiting' }, { value: 'approved', label: 'Published' }, { value: 'rejected', label: 'Rejected' }]} />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} text={errorText(error)} onRetry={() => void refetch()} /> : !data?.length ? (
        <Card><Empty icon={<Star className="w-5 h-5" />} title={status === 'pending' ? 'No reviews waiting' : 'No reviews here'} /></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {data.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[#B0701E] text-lg leading-none">{'★'.repeat(r.rating)}<span className="text-slate-200">{'★'.repeat(5 - r.rating)}</span></div>
                  <div className="text-sm font-semibold mt-1">{r.displayName} {r.isVerified && <Badge tone="green">Verified buyer</Badge>} <SampleTag show={r.isSample} /></div>
                  <div className="text-xs text-slate-500">{r.product ? `On ${r.product.name}` : 'About the shop'} · {dateTime(r.createdAt)}</div>
                </div>
                {r.status !== 'pending' && <Badge tone={r.status === 'approved' ? 'green' : 'grey'}>{r.status === 'approved' ? 'Published' : 'Rejected'}</Badge>}
              </div>
              <p className="text-sm mt-3 whitespace-pre-line">{r.body}</p>
              {r.moderatedBy && <p className="text-xs text-slate-400 mt-2">Decided by {r.moderatedBy}, {dateTime(r.moderatedAt)}</p>}
              <div className="flex justify-end gap-2 mt-3">
                {r.status !== 'rejected' && <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} disabled={busy} onClick={() => void decide(r.id, 'rejected')}>Reject</Button>}
                {r.status !== 'approved' && <Button size="sm" variant="primary" icon={<Check className="w-3.5 h-3.5" />} disabled={busy} onClick={() => void decide(r.id, 'approved')}>Publish</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Screen>
  );
}
