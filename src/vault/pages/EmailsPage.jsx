import { useState, useMemo } from 'react';
import {
  Mail, MailOpen, MailCheck, MailX, Megaphone, Rocket, ShieldCheck, Eye,
  MousePointerClick, Send, Inbox, ChevronDown, Globe,
} from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note, EmptyState } from '../components/ui';
import { Pagination } from '../../components/Pagination';
import { num, pct, date, dateTime } from '../lib/format';

const PER_PAGE = 12;

// Email categories — marketing blasts (incl. the ARC Raiders cross-promo) vs
// transactional account/security mail. Drives the filter chips + the row badge.
// `color` is a full static class so Tailwind's JIT keeps it (no string interpolation).
const CATEGORY = {
  marketing: { label: 'Marketing', tone: 'emerald', color: 'text-emerald-400', icon: Megaphone },
  marketing_arc: { label: 'ARC Raiders', tone: 'purple', color: 'text-purple-400', icon: Rocket },
  account: { label: 'Account', tone: 'blue', color: 'text-blue-400', icon: ShieldCheck },
};
const catOf = (c) => CATEGORY[c] || { label: 'Other', tone: 'gray', color: 'text-gray-400', icon: Mail };

// --- engagement funnel (Sent → Delivered → Opened → Clicked) --------------
const Funnel = ({ stats }) => {
  const max = stats.total || 1;
  const steps = [
    { label: 'Sent', value: stats.total, bar: 'bg-gray-500', icon: Send },
    { label: 'Delivered', value: stats.delivered, bar: 'bg-blue-500', icon: MailCheck },
    { label: 'Opened', value: stats.opened, bar: 'bg-emerald-500', icon: MailOpen },
    { label: 'Clicked', value: stats.clicked, bar: 'bg-amber-500', icon: MousePointerClick },
  ];
  return (
    <Panel title="Engagement funnel">
      <div className="space-y-2.5">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-24 flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </span>
            <div className="flex-1 bg-gray-900/60 rounded h-6 overflow-hidden">
              <div
                className={`${s.bar} h-full rounded flex items-center justify-end px-2 text-[11px] font-bold text-white/90 transition-all`}
                style={{ width: `${Math.max(s.value ? 9 : 0, (s.value / max) * 100)}%` }}
              >
                {s.value > 0 ? num(s.value) : ''}
              </div>
            </div>
            <span className="w-12 text-right text-xs text-gray-500 tabular-nums shrink-0">{pct(s.value / max)}</span>
          </div>
        ))}
      </div>
      <Note>
        How far each email got. Embark’s mail provider (Amazon SES) records a “Delivery” when your inbox accepts it, an
        “Open” when your mail app loads the invisible tracking pixel, and a “Click” when you follow a link.
      </Note>
    </Panel>
  );
};

// One entry in an email's expanded event timeline.
const TimelineItem = ({ icon: Icon, color, label, time, children, last }) => (
  <li className="flex gap-3">
    <div className="flex flex-col items-center">
      <span className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${color}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      {!last && <span className="w-px flex-1 bg-gray-700 my-0.5" />}
    </div>
    <div className="pb-3 min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-white font-medium">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">{time}</span>
      </div>
      {children && <div className="text-xs text-gray-400 mt-0.5">{children}</div>}
    </div>
  </li>
);

const OPENS_SHOWN = 8;

// Expanded per-email detail: the full SES event timeline.
const EmailTimeline = ({ e }) => {
  const extraOpens = Math.max(0, e.opens.length - OPENS_SHOWN);
  const shownOpens = e.opens.slice(0, OPENS_SHOWN);
  return (
    <div className="border-t border-gray-700/60 bg-gray-950/30 px-4 py-3">
      {e.recipient && (
        <p className="text-xs text-gray-500 mb-3">
          Sent to <span className="font-mono text-gray-400">{e.recipient}</span>
          {e.sender && <> · from <span className="font-mono text-gray-400">{e.sender}</span></>}
        </p>
      )}
      <ol>
        <TimelineItem icon={Send} color="bg-gray-700 text-gray-300" label="Sent" time={dateTime(e.sentMs)} />
        {e.delivered && (
          <TimelineItem icon={MailCheck} color="bg-blue-500/25 text-blue-300" label="Delivered to your inbox" time={dateTime(e.deliveredMs)} />
        )}
        {shownOpens.map((o, i) => (
          <TimelineItem
            key={`o${i}`}
            icon={Eye}
            color="bg-emerald-500/25 text-emerald-300"
            label={e.opens.length > 1 ? `Opened (${i + 1} of ${e.opens.length})` : 'Opened'}
            time={dateTime(o.ms)}
            last={!e.clicks.length && extraOpens === 0 && i === shownOpens.length - 1}
          >
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {o.device && <span>{o.device}</span>}
              {o.ip && <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {o.ip}</span>}
            </span>
          </TimelineItem>
        ))}
        {extraOpens > 0 && (
          <TimelineItem
            icon={Eye}
            color="bg-emerald-500/25 text-emerald-300"
            label={`+ ${num(extraOpens)} more open${extraOpens === 1 ? '' : 's'}`}
            time={`through ${date(e.lastOpenMs)}`}
            last={!e.clicks.length}
          />
        )}
        {e.clicks.map((c, i) => (
          <TimelineItem
            key={`c${i}`}
            icon={MousePointerClick}
            color="bg-amber-500/25 text-amber-300"
            label="Clicked a link"
            time={dateTime(c.ms)}
            last={i === e.clicks.length - 1}
          >
            {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2 break-all">{c.link}</a>}
            {c.device && <span className="text-gray-500"> · {c.device}</span>}
          </TimelineItem>
        ))}
      </ol>
    </div>
  );
};

// Collapsed status chips for a single email.
const StatusChips = ({ e }) => (
  <span className="flex flex-wrap items-center gap-1">
    {e.bounced ? (
      <Badge tone="red"><MailX className="w-3 h-3" /> Bounced</Badge>
    ) : e.openCount > 0 ? (
      <Badge tone="emerald"><Eye className="w-3 h-3" /> Opened{e.openCount > 1 ? ` ×${e.openCount}` : ''}</Badge>
    ) : e.delivered ? (
      <Badge tone="blue"><MailCheck className="w-3 h-3" /> Delivered</Badge>
    ) : (
      <Badge tone="gray"><Send className="w-3 h-3" /> Sent</Badge>
    )}
    {e.clickCount > 0 && (
      <Badge tone="yellow"><MousePointerClick className="w-3 h-3" /> Clicked{e.clickCount > 1 ? ` ×${e.clickCount}` : ''}</Badge>
    )}
  </span>
);

const EmailRow = ({ e, expanded, onToggle }) => {
  const cat = catOf(e.category);
  return (
    <div className="bg-gray-900/40 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-800/40 transition-colors"
      >
        <cat.icon className={`w-4 h-4 mt-0.5 shrink-0 ${cat.color}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium truncate ${e.subject ? 'text-white' : 'text-gray-500 italic'}`}>
            {e.subject || 'No subject line recorded'}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            <span className="text-xs text-gray-500 tabular-nums">{date(e.sentMs)}</span>
            <Badge tone={cat.tone}>{cat.label}</Badge>
            <StatusChips e={e} />
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <EmailTimeline e={e} />}
    </div>
  );
};

export const EmailsPage = () => {
  const { model } = useVaultData();
  const { emailTracking, meta } = model;
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filtered = useMemo(() => {
    const all = emailTracking?.emails || [];
    return filter === 'all' ? all : all.filter((e) => e.category === filter);
  }, [emailTracking, filter]);

  if (!emailTracking?.has) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <PageHeader icon={Mail} title="Email tracking" subtitle="Marketing & account emails Embark sent you" />
        <EmptyState icon={Inbox} title="No email tracking in this export">
          {meta.hasAudit
            ? 'Embark’s emails are sent through Amazon SES and the send/open/click events normally live in your audit log — but none were found here. That usually means you’ve had marketing emails turned off, or this audit export was shortened.'
            : 'This requires the audit log (the file that records account events), which isn’t part of this import. Re-import with your audit file to see which emails Embark sent and which you opened.'}
        </EmptyState>
      </div>
    );
  }

  const { stats } = emailTracking;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PER_PAGE;
  const slice = filtered.slice(startIndex, startIndex + PER_PAGE);

  const changeFilter = (f) => { setFilter(f); setPage(1); };

  const chips = [
    { key: 'all', label: 'All', count: stats.total },
    ...Object.keys(CATEGORY)
      .filter((k) => stats.byCategory[k])
      .map((k) => ({ key: k, label: CATEGORY[k].label, count: stats.byCategory[k] })),
  ];

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader
        icon={Mail}
        title="Email tracking"
        subtitle={`${num(stats.total)} emails Embark sent you${stats.firstMs ? `, ${date(stats.firstMs, 'MMM yyyy')} – ${date(stats.lastMs, 'MMM yyyy')}` : ''}`}
      />

      {/* What this is — the privacy reveal */}
      <Panel>
        <p className="text-sm text-gray-300 leading-relaxed">
          Every season and event email Embark sends runs through a tracking system (Amazon SES). It quietly logs not just
          that an email was <span className="text-white font-medium">delivered</span>, but every time you{' '}
          <span className="text-emerald-300 font-medium">open</span> one and every{' '}
          <span className="text-amber-300 font-medium">link you click</span> — with a timestamp, your device and your IP.
          Your data request hands that engagement log back to you, so here’s exactly what their marketing team can see.
        </p>
      </Panel>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Emails received" value={num(stats.total)} sub={`${num(stats.delivered)} delivered`} />
        <StatCard label="Emails opened" value={num(stats.opened)} accent="text-emerald-400" sub={`${pct(stats.openRate)} open rate`} />
        <StatCard label="Links clicked" value={num(stats.clicked)} accent="text-amber-400" sub={`${pct(stats.clickRate)} click rate`} />
        <StatCard label="Times you opened" value={num(stats.totalOpens)} accent="text-emerald-400" sub="counting every re-open" />
      </div>

      {/* The "they counted every re-open" highlight */}
      {stats.mostOpened && stats.mostOpened.count >= 2 && (
        <div className="flex items-start gap-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-4">
          <Eye className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-300">
            Embark logged you opening{' '}
            <span className="text-white font-medium">
              {stats.mostOpened.subject ? `“${stats.mostOpened.subject}”` : 'one email'}
            </span>{' '}
            <span className="text-emerald-300 font-bold">{num(stats.mostOpened.count)} times</span>.
          </p>
        </div>
      )}

      <Funnel stats={stats} />

      {/* Filter + email list */}
      <Panel title={`Every email (${num(filtered.length)})`}>
        <div className="flex flex-wrap gap-2 mb-4">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => changeFilter(c.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                filter === c.key ? 'bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-600/50' : 'bg-gray-700/60 text-gray-400 hover:text-white'
              }`}
            >
              {c.label} <span className="opacity-60">{num(c.count)}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {slice.map((e) => (
            <EmailRow key={e.messageId} e={e} expanded={expanded.has(e.messageId)} onToggle={() => toggle(e.messageId)} />
          ))}
        </div>

        {totalPages > 1 && (
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={startIndex + PER_PAGE}
            totalItems={filtered.length}
            onPageChange={setPage}
            edgeScroll={false}
          />
        )}

        <Note>
          {stats.recipients.length > 1
            ? `Sent across ${stats.recipients.length} of your email addresses. `
            : ''}
          Opens are detected via a 1×1 tracking pixel, so they only register when your mail app loads images — Gmail and
          other webmail load it through their own proxy, which is why some opens show the provider’s servers instead of
          your device. Account &amp; security emails (verify / change email) aren’t open-tracked.
        </Note>
      </Panel>
    </div>
  );
};
