import { useEffect, useMemo, useState } from 'react';
import { MessagesSquare, Bot, Paperclip, Ticket, ChevronDown, Loader2 } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, Badge, EmptyState, Note, StatCard } from '../components/ui';
import { chatChannelLabel } from '../lib/model';
import { num, date, dateTime } from '../lib/format';

const QUEUE_TONE = { General: 'blue', 'Cheater Reports': 'red', 'Ban Appeals': 'yellow' };
const CHANNEL_TONE = { party: 'purple', pl: 'blue' };

const msgTime = (m) => (m.sentMs ? dateTime(m.sentMs) : m.approxMs ? `~ ${date(m.approxMs)}` : null);

const TicketThread = ({ ticket, you }) => {
  if (ticket.parseFallback) {
    return (
      <div className="px-4 py-3">
        <Note>
          This transcript didn’t match the known Helpshift layout, so it’s shown raw rather than as a thread.
        </Note>
        <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-300 bg-gray-900/60 rounded-lg p-3 max-h-96 overflow-y-auto">{ticket.rawText}</pre>
      </div>
    );
  }
  return (
    <div className="px-4 py-3 space-y-2">
      {ticket.messages.map((m, i) => {
        if (m.who === 'system') {
          return (
            <p key={i} className="text-center text-[11px] text-gray-500 flex items-center justify-center gap-1.5">
              {m.attachment && <Paperclip className="w-3 h-3" />}
              {m.text}
            </p>
          );
        }
        const isYou = m.who === 'you';
        return (
          <div key={i} className={`max-w-[88%] sm:max-w-[75%] ${isYou ? 'ml-auto' : ''}`}>
            <div
              className={`rounded-xl px-3 py-2 text-sm whitespace-pre-line wrap-break-word ${
                isYou
                  ? 'bg-emerald-900/40 ring-1 ring-inset ring-emerald-700/40 text-emerald-50'
                  : m.who === 'bot'
                    ? 'bg-gray-700/40 text-gray-300'
                    : 'bg-gray-700/70 text-gray-100'
              }`}
            >
              {m.text}
            </div>
            <p className={`mt-0.5 text-[10px] text-gray-500 flex items-center gap-1 ${isYou ? 'justify-end' : ''}`}>
              {m.who === 'bot' && <Bot className="w-3 h-3" />}
              <span>{isYou ? you : m.name || (m.who === 'bot' ? 'Bot' : 'Support agent')}</span>
              {msgTime(m) && <span>· {msgTime(m)}</span>}
              {m.readMs && <span>· read {date(m.readMs)}</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export const SupportPage = () => {
  const { model } = useVaultData();
  const support = model.support;
  const you = model.identity?.fullName || model.identity?.displayName || 'You';

  const [parsed, setParsed] = useState(support.preParsed);
  const [status, setStatus] = useState(support.preParsed ? 'done' : support.pdf ? 'loading' : 'none');
  const [progress, setProgress] = useState('');
  const [openTicket, setOpenTicket] = useState(0);

  useEffect(() => {
    if (support.preParsed || !support.pdf) return undefined;
    let alive = true;
    setStatus('loading');
    import('../lib/cs')
      .then(({ parseCsPdf }) =>
        parseCsPdf(support.pdf, {
          identityName: model.identity?.fullName || null,
          fallbackMs: support.anchorFallbackMs,
          onProgress: (p, n) => alive && setProgress(`page ${p} of ${n}`),
        })
      )
      .then((res) => {
        if (!alive) return;
        setParsed(res);
        setStatus(res?.parseError ? 'error' : 'done');
      })
      .catch(() => alive && setStatus('error'));
    return () => { alive = false; };
  }, [support, model.identity]);

  // Audit chat is authoritative (raw text); PDF-only rows (censored) fill gaps.
  const chat = useMemo(() => {
    const audit = support.chat;
    const pdfChat = parsed?.chat || [];
    if (!pdfChat.length) return audit;
    const merged = [...audit];
    for (const p of pdfChat) {
      const dup = audit.some(
        (a) => a.channel === p.channel && Math.abs(a.ms - p.ms) <= 5000 && (a.text === p.text || a.censored === p.text)
      );
      if (!dup) merged.push(p);
    }
    return merged.sort((a, b) => a.ms - b.ms);
  }, [support.chat, parsed]);

  // Newest day first, messages within a day in order.
  const chatDays = useMemo(() => {
    const days = new Map();
    for (const c of chat) {
      const key = date(c.ms);
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(c);
    }
    return [...days.entries()].reverse();
  }, [chat]);

  const tickets = parsed?.tickets || [];
  const attachments = tickets.reduce((s, t) => s + (t.attachmentCount || 0), 0);

  if (!support.hasAny) {
    return (
      <div className="animate-fade-in-up">
        <PageHeader icon={MessagesSquare} title="Support & Chat" subtitle="Your in-game chat log and Embark support tickets" />
        <EmptyState icon={MessagesSquare} title="No chat or support data in this export" />
        <Note>
          Chat and support-ticket history arrives in two places: newer audit logs carry your recent in-game chat, and a
          separate <code>CS_extracted_data.pdf</code> holds the full customer-service record (chat plus Helpshift
          tickets). Neither is present here — if you asked Embark for “all personal data”, the CS file is sometimes sent
          separately.
        </Note>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader icon={MessagesSquare} title="Support & Chat" subtitle="Your in-game chat log and Embark support tickets" />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Chat messages" value={num(chat.length)} />
        <StatCard label="Support tickets" value={status === 'done' ? num(tickets.length) : '…'} />
        <StatCard label="Ticket attachments" value={status === 'done' ? num(attachments) : '…'} />
      </div>

      <Panel title="In-game chat">
        {chat.length === 0 ? (
          <p className="text-sm text-gray-500">No chat messages in this export.</p>
        ) : (
          <div className="space-y-4">
            {chatDays.map(([day, msgs]) => (
              <div key={day}>
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">{day}</p>
                <div className="space-y-1">
                  {msgs.map((c, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="text-[11px] text-gray-500 tabular-nums shrink-0 w-11">
                        {new Date(c.ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge tone={CHANNEL_TONE[c.channel] || 'gray'}>{chatChannelLabel(c.channel)}</Badge>
                      <span className="text-gray-200 wrap-break-word min-w-0">{c.text}</span>
                      {c.wasCensored && c.source === 'audit' && (
                        <span className="text-[10px] text-amber-400/80 shrink-0" title={`Shown as “${c.censored}” in game`}>
                          filtered in game
                        </span>
                      )}
                      {c.source === 'pdf' && (
                        <span className="text-[10px] text-gray-500 shrink-0" title="Only found in the CS PDF (censored text)">
                          PDF
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-500">
          Only your own sent messages are included, and chat appears to be retained for roughly the last ~90 days before the export.
        </p>
      </Panel>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Ticket className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">
            Support tickets {status === 'done' && tickets.length > 0 && <span className="text-gray-500 font-normal">({tickets.length})</span>}
          </h2>
        </div>

        {status === 'loading' && (
          <div className="bg-gray-800 rounded-xl p-6 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Reading CS_extracted_data.pdf… {progress}
          </div>
        )}
        {status === 'error' && (
          <Note>
            Couldn’t read the ticket transcripts from the PDF{parsed?.parseError ? ` (${parsed.parseError})` : ''} — the
            chat log above still comes from your audit file.
          </Note>
        )}
        {status === 'none' && (
          <Note>
            No <code>CS_extracted_data.pdf</code> found in this export — ticket transcripts live only in that file. Your
            chat above comes from the audit log.
          </Note>
        )}
        {status === 'done' && tickets.length === 0 && (
          <p className="text-sm text-gray-500">No support tickets found in the PDF.</p>
        )}

        {status === 'done' && tickets.length > 0 && (
          <div className="space-y-2">
            {tickets.map((t, i) => {
              const open = openTicket === i;
              return (
                <div key={i} className="bg-gray-800 rounded-xl overflow-hidden ring-1 ring-inset ring-white/5">
                  <button
                    type="button"
                    onClick={() => setOpenTicket(open ? null : i)}
                    className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-gray-700/30 transition-colors"
                  >
                    <Badge tone={QUEUE_TONE[t.queue] || 'gray'}>{t.queue}</Badge>
                    <span className="font-medium text-white text-sm flex-1 min-w-0 truncate">
                      {t.intent || 'Support ticket'}
                    </span>
                    <span className="text-[11px] text-gray-500 flex items-center gap-2 shrink-0">
                      {t.attachmentCount > 0 && (
                        <span className="flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{t.attachmentCount}</span>
                      )}
                      {t.parseFallback ? 'raw transcript' : `${t.messages.filter((m) => m.who !== 'system').length} messages`}
                      {t.resolvedAtMs && <span className="text-gray-400">Resolved {date(t.resolvedAtMs)}</span>}
                      <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  {open && <div className="border-t border-white/10 bg-gray-900/40"><TicketThread ticket={t} you={you} /></div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Note>
        Helpshift stores per-message times only as day offsets (“15d ago”), so message dates marked <code>~</code> are
        approximate — each ticket is re-anchored on its exact “Resolved” date. The <span className="text-gray-300">filtered in game</span>{' '}
        marker means other players saw a censored version; your export keeps what you actually typed.
      </Note>
    </div>
  );
};
