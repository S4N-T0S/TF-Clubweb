import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { MessagesSquare, Bot, Paperclip, Ticket, ChevronDown, Loader2, Monitor } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, Badge, EmptyState, Note, StatCard } from '../components/ui';
import { ListSearch, SearchEcho } from '../components/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { Pagination } from '../../components/Pagination';
import { chatChannelLabel } from '../lib/model';
import { num, date, dateTime } from '../lib/format';

const QUEUE_TONE = { General: 'blue', 'Cheater Reports': 'red', 'Ban Appeals': 'yellow' };
const CHANNEL_TONE = { party: 'purple', pl: 'blue' };
const CHAT_PER_PAGE = 25;

const msgTime = (m) => (m.sentMs ? dateTime(m.sentMs) : m.approxMs ? `~ ${date(m.approxMs)}` : null);

// `session`/`extra` are ordered label/value rows off the PDF's detail tables.
const rowValue = (rows, label) => rows?.find((r) => r.label === label)?.value || null;
const joinParts = (...parts) => parts.filter(Boolean).join(' ') || null;

// What Helpshift recorded about the browser the ticket was filed from. Absent
// on the older layout.
const SessionDetails = ({ rows, deviceOnly }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="pb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        <Monitor className="w-3 h-3" />
        {/* Custom Helpshift fields share this grid and aren't device data. */}
        {deviceOnly ? 'Session & device' : 'Recorded details'}
        <span className="text-gray-600">({rows.length})</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] bg-gray-900/50 rounded-lg px-3 py-2">
          {rows.map((r, i) => (
            <Fragment key={i}>
              <dt className="text-gray-500 uppercase tracking-wide">{r.label}</dt>
              <dd className="text-gray-300 wrap-break-word min-w-0">{r.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
};

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
  // Newer exports carry a ticket detail table; older ones have none of this.
  const session = ticket.session || [];
  const detailRows = [...session, ...(ticket.extra || [])];
  const timezone = rowValue(session, 'TIMEZONE');
  const os = rowValue(session, 'OPERATING SYSTEM');
  const browser = rowValue(session, 'BROWSER');
  const meta = [
    ticket.createdAtMs && `Opened ${dateTime(ticket.createdAtMs)}`,
    ticket.channel && `via ${ticket.channel}`,
    ticket.csat != null && `CSAT ${ticket.csat}`,
    // Anchored on the name: a bare "151.0" means nothing on its own.
    os && joinParts(os, rowValue(session, 'OS VERSION')),
    browser && joinParts(browser, rowValue(session, 'BROWSER VERSION')),
    // Labelled: times above render in the reader's zone, so a bare IANA name
    // beside one reads as the zone they were rendered in.
    timezone && `browser timezone ${timezone}`,
    // Only worth showing when it contradicts the export we're looking at.
    ticket.game && !/^THE FINALS$/i.test(ticket.game) && `game ${ticket.game}`,
    ticket.attachmentsWithheld && 'attachment files not included in the export',
  ].filter(Boolean);

  return (
    <div className="px-4 py-3 space-y-2">
      {meta.length > 0 && (
        // Inline text, not flex children: a CSS-only separator leaves the text
        // layer (copy-paste, screen readers) reading "19:48·via …".
        <p className="text-[11px] text-gray-500">
          {meta.map((s, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-gray-600">{' · '}</span>}
              {s}
            </Fragment>
          ))}
        </p>
      )}
      {detailRows.length > 0 && <SessionDetails rows={detailRows} deviceOnly={!(ticket.extra || []).length} />}
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

  // Pages MESSAGES, not days: a busy evening would otherwise be one huge page.
  // Days still group the list, they just split where a page ends.
  const [chatPage, setChatPage] = useState(1);
  const chatSearchRef = useRef(null);
  // Searches the raw text, not just the censored copy, so a message the chat
  // filter starred out in game is still findable by what you actually typed.
  const { query: chatQuery, setQuery: setChatQuery, filtered: chatShown } = useListSearch(
    chat,
    (c) => [c.text, c.censored, chatChannelLabel(c.channel)],
    () => setChatPage(1)
  );
  const chatPages = Math.max(1, Math.ceil(chatShown.length / CHAT_PER_PAGE));
  const safeChatPage = Math.min(chatPage, chatPages);
  const chatStart = (safeChatPage - 1) * CHAT_PER_PAGE;

  // Newest day first, messages within a day in order.
  const chatDays = useMemo(() => {
    // The list is oldest-first and page 1 is newest, so window from the end.
    const end = Math.max(0, chatShown.length - chatStart);
    const days = new Map();
    for (const c of chatShown.slice(Math.max(0, end - CHAT_PER_PAGE), end)) {
      const key = date(c.ms);
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(c);
    }
    return [...days.entries()].reverse();
  }, [chatShown, chatStart]);

  // The newer layout lists tickets oldest-first, the older one newest-first.
  // Normalise so index 0 is always newest and matches the chat panel above.
  const tickets = useMemo(() => {
    const list = parsed?.tickets || [];
    // Last activity, not close date: ranking an open ticket by when it was
    // opened sinks it below older closed ones.
    const at = (t) => t.updatedAtMs ?? t.resolvedAtMs ?? t.createdAtMs ?? t.approxStartMs ?? null;
    return [...list].sort((a, b) => {
      const x = at(a);
      const y = at(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return y - x;
    });
  }, [parsed]);
  // Transcript bodies are in the haystack too: you remember what you wrote in a
  // ticket, not what its subject line said.
  const { query: ticketQuery, setQuery: setTicketQuery, filtered: ticketsShown } = useListSearch(
    tickets,
    (t) => [t.queue, t.intent, t.state, t.ticketId, t.channel, t.rawText, ...(t.messages || []).map((m) => m.text)]
  );
  const attachments = tickets.reduce((s, t) => s + (t.attachmentCount || 0), 0);
  // Only the older Helpshift layout dates messages relatively.
  // From the parser: inferring it from ticket fields breaks on the fallback
  // shapes that don't carry them.
  const exportLayout = parsed?.layout === 'export';

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

      <Panel
        title="In-game chat"
        action={
          chat.length > 0 && (
            <ListSearch
              value={chatQuery}
              onChange={setChatQuery}
              placeholder="Search messages…"
              matched={chatShown.length}
              total={chat.length}
              className="w-full sm:w-64"
              inputRef={chatSearchRef}
            />
          )
        }
      >
        {chat.length === 0 ? (
          <p className="text-sm text-gray-500">No chat messages in this export.</p>
        ) : chatShown.length === 0 ? (
          <p className="text-sm text-gray-500">No messages match “{chatQuery.trim()}”.</p>
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
        {(chatPages > 1 || chatQuery.trim()) && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <SearchEcho value={chatQuery} onClear={() => setChatQuery('')} focusRef={chatSearchRef} />
            {chatPages > 1 && (
              <div className="flex-1">
                <Pagination
                  currentPage={safeChatPage}
                  totalPages={chatPages}
                  startIndex={chatStart}
                  endIndex={chatStart + CHAT_PER_PAGE}
                  totalItems={chatShown.length}
                  onPageChange={setChatPage}
                  edgeScroll={false}
                  variant="compact"
                />
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-500">
          Only your own sent messages are included, and chat appears to be retained for roughly the last ~90 days before the export.
          {chatPages > 1 && ' Newest first.'}
        </p>
      </Panel>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Ticket className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-white">
              Support tickets {status === 'done' && tickets.length > 0 && <span className="text-gray-500 font-normal">({tickets.length})</span>}
            </h2>
          </div>
          {status === 'done' && tickets.length > 0 && (
            <ListSearch
              value={ticketQuery}
              onChange={setTicketQuery}
              placeholder="Search tickets…"
              matched={ticketsShown.length}
              total={tickets.length}
              className="w-full sm:w-64"
            />
          )}
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

        {status === 'done' && tickets.length > 0 && ticketsShown.length === 0 && (
          <p className="text-sm text-gray-500">No tickets match “{ticketQuery.trim()}”.</p>
        )}

        {status === 'done' && ticketsShown.length > 0 && (
          <div className="space-y-2">
            {ticketsShown.map((t) => {
              // Index into the unfiltered list, or filtering would swap which
              // ticket is open.
              const i = tickets.indexOf(t);
              const open = openTicket === i;
              return (
                <div key={i} className="bg-gray-800 rounded-xl overflow-hidden ring-1 ring-inset ring-white/5">
                  <button
                    type="button"
                    onClick={() => setOpenTicket(open ? null : i)}
                    className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-gray-700/30 transition-colors"
                  >
                    {/* Newer exports drop Helpshift's queues and number tickets instead. */}
                    <Badge tone={QUEUE_TONE[t.queue] || 'gray'}>{t.queue || (t.ticketId ? `#${t.ticketId}` : 'Ticket')}</Badge>
                    <span className="font-medium text-white text-sm flex-1 min-w-0 truncate">
                      {t.intent || 'Support ticket'}
                    </span>
                    <span className="text-[11px] text-gray-500 flex items-center gap-2 shrink-0">
                      {(t.attachmentCount > 0 || t.attachmentsWithheld) && (
                        <span
                          className="flex items-center gap-0.5"
                          title={t.attachmentCount > 0
                            ? `${t.attachmentCount} attachment${t.attachmentCount > 1 ? 's' : ''} sent`
                            : 'Attachments were sent, but the transcript doesn’t say how many'}
                        >
                          <Paperclip className="w-3 h-3" />{t.attachmentCount || ''}
                        </span>
                      )}
                      {t.parseFallback ? 'raw transcript' : `${t.messages.filter((m) => m.who !== 'system').length} messages`}
                      {/* Helpshift stamps a resolution time on terminal states that
                          aren't "resolved" (a rejected appeal), so state wins the label. */}
                      {t.state && !/^resolved$/i.test(t.state)
                        ? <span className="text-gray-400"><span className="capitalize">{t.state}</span>{t.resolvedAtMs ? ` ${date(t.resolvedAtMs)}` : ''}</span>
                        : t.resolvedAtMs && <span className="text-gray-400">Resolved {date(t.resolvedAtMs)}</span>}
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
        {tickets.length > 0 && !exportLayout ? (
          <>
            Helpshift stores per-message times only as day offsets (“15d ago”), so message dates marked <code>~</code> are
            approximate; each ticket is re-anchored on its exact “Resolved” date.{' '}
          </>
        ) : exportLayout ? (
          <>
            Ticket transcripts in this export carry no per-message timestamps, only the times each ticket was opened and
            resolved.{' '}
          </>
        ) : null}
        The <span className="text-gray-300">filtered in game</span> marker means other players saw a censored version;
        your export keeps what you actually typed.
      </Note>
    </div>
  );
};
