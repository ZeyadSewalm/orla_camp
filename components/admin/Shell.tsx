import Link from 'next/link';
import {
  LayoutDashboard, Users, CreditCard, PlayCircle, ClipboardCheck, Layers,
  PhoneCall, Radio, MessagesSquare, TicketPercent, FileText, Inbox
} from 'lucide-react';
import { lh } from '@/lib/href';

export const TABS = [
  'dashboard', 'students', 'leads', 'payments', 'modules', 'qc', 'tiers',
  'requests', 'sessions', 'community', 'promos', 'content'
] as const;
export type Tab = (typeof TABS)[number];

export const REVIEWER_TABS: Tab[] = ['qc'];

const ICONS: Record<Tab, typeof Users> = {
  dashboard: LayoutDashboard,
  students: Users,
  leads: Inbox,
  payments: CreditCard,
  modules: PlayCircle,
  qc: ClipboardCheck,
  tiers: Layers,
  requests: PhoneCall,
  sessions: Radio,
  community: MessagesSquare,
  promos: TicketPercent,
  content: FileText
};

const GROUPS: Array<{ heading: string; tabs: Tab[] }> = [
  { heading: 'overview', tabs: ['dashboard'] },
  { heading: 'people', tabs: ['students', 'leads', 'payments', 'requests'] },
  { heading: 'course', tabs: ['modules', 'qc', 'sessions'] },
  { heading: 'selling', tabs: ['tiers', 'promos', 'content', 'community'] }
];

export function Sidebar({
  locale, active, labels, groupLabels, allowed, pendingQC = 0
}: {
  locale: string;
  active: Tab;
  labels: Record<string, string>;
  groupLabels: Record<string, string>;
  allowed: readonly Tab[];
  pendingQC?: number;
}) {
  // Dark ground so the sidebar reads as a distinct surface, not page background.
  return (
    <nav className="lg:sticky lg:top-6 lg:h-fit lg:bg-ink lg:p-5 lg:text-paper">
      <div className="-mx-5 flex gap-2 overflow-x-auto bg-ink px-5 py-3 lg:mx-0 lg:block lg:space-y-7 lg:overflow-visible lg:bg-transparent lg:p-0">
        {GROUPS.map((group) => {
          const visible = group.tabs.filter((x) => allowed.includes(x));
          if (visible.length === 0) return null;

          return (
            <div key={group.heading} className="contents lg:block">
              <p className="hidden lg:mb-2.5 lg:block lg:font-mono lg:text-[0.62rem] lg:uppercase lg:tracking-[0.2em] lg:text-paper/40">
                {groupLabels[group.heading]}
              </p>
              <div className="flex gap-2 lg:block lg:space-y-0.5">
                {visible.map((tab) => {
                  const Icon = ICONS[tab];
                  const on = active === tab;
                  return (
                    <Link
                      key={tab}
                      href={`${lh(locale, '/admin')}?tab=${tab}`}
                      aria-current={on ? 'page' : undefined}
                      className={`flex items-center gap-2.5 whitespace-nowrap border-s-2 px-3 py-2.5 text-sm transition ${
                        on
                          ? 'border-brass bg-paper/10 font-medium text-paper'
                          : 'border-transparent text-paper/60 hover:bg-paper/5 hover:text-paper'
                      }`}
                    >
                      <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      {labels[tab] ?? tab}
                      {tab === 'qc' && pendingQC > 0 && (
                        <span className="ms-auto figure bg-brass px-1.5 text-[0.68rem] text-ink">
                          {pendingQC}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-line bg-white p-5 sm:p-7 ${className}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1">{label}</span>
      {hint && <span className="mb-2 block text-xs text-steel/70">{hint}</span>}
      {children}
    </label>
  );
}

/** KPI tile: the number is the object, in mono, everything else recedes. */
export function Stat({
  label, value, sub, icon: Icon
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: typeof Users;
}) {
  return (
    <div className="relative border border-ink/15 bg-white p-6">
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brass" />
      <div className="flex items-start justify-between">
        <p className="label mb-0">{label}</p>
        {Icon && <Icon aria-hidden className="h-4 w-4 text-brass" strokeWidth={1.75} />}
      </div>
      <p className="figure mt-5 text-lg leading-none text-ink sm:text-xl">{value}</p>
      {sub && <p className="mt-3 border-t border-line pt-3 text-xs text-steel">{sub}</p>}
    </div>
  );
}

/** Empty states are a moment to reassure, not a blank box. */
export function Empty({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-line bg-white px-8 py-14 text-center">
      <Inbox aria-hidden className="mx-auto h-7 w-7 text-steel/40" strokeWidth={1.5} />
      {title && <p className="mt-4 font-display text-base font-bold">{title}</p>}
      <p className="mx-auto mt-2 max-w-sm text-sm text-steel">{children}</p>
    </div>
  );
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'mute'; children: React.ReactNode }) {
  const map = { ok: 'badge-ok', warn: 'badge-pending', bad: 'badge-bad', mute: 'badge-mute' };
  return <span className={map[tone]}>{children}</span>;
}
