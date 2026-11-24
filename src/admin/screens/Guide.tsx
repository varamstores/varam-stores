import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Lightbulb, Users } from 'lucide-react';
import type { ScreenProps } from '../AdminApp';
import { useAuth } from '../../context/AuthContext';
import { AREA, Button, Screen, SearchInput, Select, cx, type AreaName } from '../ui';
import { GUIDE, type GuideTopic } from '../guideContent';

// The Guide: a list of topics on the left; the chosen topic is explained in full on the right
// (what it is for, what you see, how to do each job step by step, tips, and who can use it).

const AREAS: Array<GuideTopic['area']> = ['Getting started', 'Today', 'Shop', 'Customers', 'Marketing', 'Set-up'];
const dot = (a: GuideTopic['area']) => (a === 'Getting started' ? 'bg-[#F5D103]' : AREA[a as AreaName].dot);
const text = (t: GuideTopic) => [t.title, t.summary, t.who, ...(t.tips ?? []), ...t.sections.flatMap((s) => [s.heading, s.text ?? '', ...(s.steps ?? []), ...(s.bullets ?? [])])].join(' ').toLowerCase();

export default function GuideScreen({ param, go }: ScreenProps) {
  const { hasPermission } = useAuth();
  const [key, setKey] = useState(param && GUIDE.some((t) => t.key === param) ? param : 'setup');
  const [q, setQ] = useState('');
  const article = useRef<HTMLElement>(null);
  useEffect(() => { if (param && GUIDE.some((t) => t.key === param)) setKey(param); }, [param]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? GUIDE.filter((t) => text(t).includes(s)) : GUIDE;
  }, [q]);
  const topic = GUIDE.find((t) => t.key === key) ?? GUIDE[0];
  const index = GUIDE.indexOf(topic);
  const prev = GUIDE[index - 1];
  const next = GUIDE[index + 1];
  const canOpen = !!topic.screen && (!topic.perms || topic.perms.some((p) => hasPermission(p)));
  const choose = (k: string) => { setKey(k); article.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <Screen title="Guide" intro="How every part of the store portal works. Choose a topic on the left.">
      <div className="grid lg:grid-cols-[290px_minmax(0,1fr)] gap-6 items-start">
        <aside className="space-y-3 lg:sticky lg:top-20">
          <SearchInput value={q} onChange={setQ} placeholder="Search the guide…" />
          <div className="lg:hidden">
            <Select aria-label="Topic" value={topic.key} onChange={choose} options={shown.map((t) => ({ value: t.key, label: t.title, group: t.area }))} />
          </div>
          <nav aria-label="Guide topics" className="hidden lg:block bg-white rounded-lg border border-[#D6DBE1] p-2 max-h-[calc(100vh-11rem)] overflow-y-auto">
            {AREAS.map((a) => {
              const items = shown.filter((t) => t.area === a);
              if (!items.length) return null;
              return (
                <div key={a} className="mb-2 last:mb-0">
                  <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-[12.5px] font-semibold text-[#3F4652]"><span className={cx('w-1 h-3.5 rounded-full', dot(a))} />{a}</div>
                  {items.map((t) => (
                    <button key={t.key} type="button" onClick={() => choose(t.key)} aria-current={t.key === topic.key ? 'page' : undefined}
                      className={cx('w-full text-left px-2.5 py-1.5 rounded-md text-[14px] cursor-pointer', t.key === topic.key ? 'bg-[#18181B] text-white font-medium' : 'text-[#3F4652] hover:bg-[#F1F3F5]')}>
                      {t.title}
                    </button>
                  ))}
                </div>
              );
            })}
            {!shown.length && <p className="px-2.5 py-3 text-[13.5px] text-[#5F6B7A]">Nothing matches “{q}”.</p>}
          </nav>
        </aside>

        <article ref={article} className="bg-white rounded-lg border border-[#D6DBE1] scroll-mt-20">
          <header className="px-5 sm:px-8 pt-6 pb-5 border-b border-[#E8EBEF]">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[#5F6B7A]"><span className={cx('w-2 h-2 rounded-full', dot(topic.area))} />{topic.area}</div>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mt-1">
              <h2 className="text-[26px] font-semibold leading-tight">{topic.title}</h2>
              {canOpen && <Button variant="primary" icon={<ExternalLink className="w-4 h-4" />} onClick={() => go(topic.screen!)}>Open this screen</Button>}
            </div>
            <p className="text-[16px] leading-relaxed text-[#3F4652] mt-3 max-w-3xl">{topic.summary}</p>
            <p className="flex items-start gap-2 text-[13.5px] text-[#5F6B7A] mt-3"><Users className="w-4 h-4 mt-0.5 shrink-0" /><span><b className="text-[#3F4652] font-semibold">Who can use it:</b> {topic.who}</span></p>
          </header>

          <div className="px-5 sm:px-8 py-6 space-y-8 max-w-3xl">
            {topic.sections.map((s) => (
              <section key={s.heading}>
                <h3 className="text-[18px] font-semibold mb-2.5">{s.heading}</h3>
                {s.text && <p className="text-[15px] leading-relaxed text-[#2E3440] mb-3">{s.text}</p>}
                {s.steps && (
                  <ol className="space-y-3">
                    {s.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-[#18181B] text-[#F5D103] text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <span className="text-[15px] leading-relaxed text-[#2E3440]">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {s.bullets && (
                  <ul className="space-y-2">
                    {s.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#2E3440]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8B95A3] shrink-0 mt-[0.6rem]" />{b}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            {topic.tips && (
              <section className="rounded-md border border-[#E6D2B0] border-l-4 border-l-[#9A5B13] bg-[#F8F0E3] px-4 py-3">
                <h3 className="flex items-center gap-2 text-[14.5px] font-semibold text-[#4A3009]"><Lightbulb className="w-4 h-4" />Good to know</h3>
                <ul className="mt-1.5 space-y-1 text-[14.5px] text-[#4A3009]">{topic.tips.map((t) => <li key={t}>{t}</li>)}</ul>
              </section>
            )}
          </div>

          <footer className="flex items-stretch gap-3 px-5 sm:px-8 py-4 border-t border-[#E8EBEF]">
            {prev ? (
              <button type="button" onClick={() => choose(prev.key)} className="flex-1 text-left rounded-md border border-[#D6DBE1] px-4 py-3 hover:border-[#18181B] cursor-pointer">
                <span className="flex items-center gap-1 text-[12.5px] text-[#5F6B7A]"><ArrowLeft className="w-3.5 h-3.5" />Previous</span>
                <span className="block text-[14.5px] font-semibold mt-0.5">{prev.title}</span>
              </button>
            ) : <span className="flex-1" />}
            {next ? (
              <button type="button" onClick={() => choose(next.key)} className="flex-1 text-right rounded-md border border-[#D6DBE1] px-4 py-3 hover:border-[#18181B] cursor-pointer">
                <span className="flex items-center justify-end gap-1 text-[12.5px] text-[#5F6B7A]">Next<ArrowRight className="w-3.5 h-3.5" /></span>
                <span className="block text-[14.5px] font-semibold mt-0.5">{next.title}</span>
              </button>
            ) : <span className="flex-1" />}
          </footer>
        </article>
      </div>
    </Screen>
  );
}
