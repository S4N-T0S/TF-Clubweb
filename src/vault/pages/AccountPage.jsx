import { useState } from 'react';
import { ShieldAlert, Ban, CheckCircle, Link2, Cpu, Monitor, ExternalLink, Flag } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, Badge, StatCard, Note, EmptyState, PageJump } from '../components/ui';
import { Pagination } from '../../components/Pagination';
import { num, date, dateTime } from '../lib/format';

const Row = ({ label, value, mono }) => (
  <div className="flex justify-between gap-4 py-1.5 border-b border-gray-700/50 last:border-0 text-sm">
    <span className="text-gray-400 shrink-0">{label}</span>
    <span className={`text-white font-medium text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</span>
  </div>
);

const providerLabel = (p) =>
  ({ steam: 'Steam', xbox: 'Xbox', discord: 'Discord', twitch: 'Twitch', psn: 'PlayStation', epic: 'Epic Games', epicgames: 'Epic Games', nexon: 'Nexon' }[p] || p);

// One restriction record. Active restrictions are red (permanent) or yellow (temporary, still running); lapsed ones are muted with an "Expired" badge.
const RestrictionCard = ({ r, lastActivity }) => {
  const tone = r.active ? (r.permanent ? 'red' : 'yellow') : 'gray';
  const status = r.active ? (r.permanent ? 'Permanent' : 'Active') : 'Expired';
  return (
    <Panel className={`border ${r.active ? 'border-red-500/30 bg-red-500/5!' : 'border-gray-600/40 bg-gray-700/10!'}`}>
      <div className="flex items-start gap-3">
        <Ban className={`w-6 h-6 shrink-0 mt-0.5 ${r.active ? 'text-red-400' : 'text-gray-500'}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-semibold text-lg ${r.active ? 'text-red-300' : 'text-gray-300'}`}>Restricted — {r.reason}</p>
            <Badge tone={tone}>{status}</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 mt-3">
            <Row label="Restriction started" value={dateTime(r.startsAt)} />
            <Row label="Recorded at" value={dateTime(r.createdAt)} />
            <Row label="Ends" value={r.endsAt ? dateTime(r.endsAt) : 'No end date (permanent)'} />
            <Row label="Last activity" value={dateTime(lastActivity)} />
          </div>
        </div>
      </div>
    </Panel>
  );
};

const REPORTS_PER_PAGE = 10;
const reasonTone = { Cheating: 'red', 'Verbal abuse': 'yellow', 'Offensive name': 'purple', Teaming: 'blue' };

// Reports the player FILED against other players
const ReportsPanel = ({ data }) => {
  const [page, setPage] = useState(1);
  const { count, reports } = data;
  const totalPages = Math.max(1, Math.ceil(reports.length / REPORTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * REPORTS_PER_PAGE;
  const slice = reports.slice(start, start + REPORTS_PER_PAGE);

  return (
    <Panel title={`Reports you’ve filed (${num(count)})`}>
      {count === 0 ? (
        <EmptyState icon={Flag} title="No reports on record">
          Reports you submit against other players are logged in your audit trail. None were found in this export.
        </EmptyState>
      ) : (
        <>
          <div className="table-container" style={{ minHeight: REPORTS_PER_PAGE * 44 }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 px-3 font-medium whitespace-nowrap">Date</th>
                  <th className="text-left py-2 px-3 font-medium">Reason</th>
                  <th className="text-left py-2 px-3 font-medium">Your note</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r, i) => (
                  <tr key={start + i} className="border-b border-gray-700/40 last:border-0 align-top">
                    <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{dateTime(r.loggedAt)}</td>
                    <td className="py-2 px-3"><Badge tone={reasonTone[r.reason] || 'gray'}>{r.reason}</Badge></td>
                    <td className="py-2 px-3 text-gray-300">{r.message || <span className="text-gray-600">— no note added —</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <PageJump totalPages={totalPages} onJump={setPage} />
            <div className="flex-1">
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                startIndex={start}
                endIndex={start + REPORTS_PER_PAGE}
                totalItems={reports.length}
                onPageChange={setPage}
                variant="compact"
              />
            </div>
          </div>
          <Note>
            These are reports <strong>you</strong> filed against other players — Embark keeps the reason and any note you added but
            anonymises who you reported. Filing a report isn’t the same as action being taken, and it’s separate from any
            restriction on your own account above.
          </Note>
        </>
      )}
    </Panel>
  );
};

export const AccountPage = () => {
  const { model } = useVaultData();
  const { identity, ban, linkedAccounts, antiCheat, reports, meta } = model;

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader icon={ShieldAlert} title="Account & Bans" subtitle={identity.fullName || undefined} />

      {/* Ban status — an account can accumulate several restrictions over time. */}
      {ban.count === 0 ? (
        <Panel className="border border-emerald-500/20 bg-emerald-500/5!">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
            <p className="text-emerald-300 font-semibold">No restriction on record — account in good standing.</p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-3">
          {ban.count > 1 && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                {ban.count} restrictions on record{ban.hasActive ? '' : ' — none currently active'}, newest first.
              </span>
            </div>
          )}
          {ban.all.map((r, i) => (
            <RestrictionCard key={i} r={r} lastActivity={meta.lastActivity} />
          ))}
        </div>
      )}

      {/* Anti-cheat kicks */}
      <Panel title="Anti-cheat kicks">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <StatCard label="EAC kicks" value={num(antiCheat.kickCount)} accent={antiCheat.kickCount ? 'text-red-400' : 'text-white'} />
          <StatCard label="EOS sessions" value={num(antiCheat.eosSessionCount)} />
          <StatCard label="Denuvo platforms" value={num(antiCheat.denuvoPlatforms)} />
          <StatCard label="Anybrain sessions" value={num(antiCheat.anybrainSessionCount)} />
        </div>
        {antiCheat.kickCount > 0 ? (
          <div className="space-y-2">
            {antiCheat.kicks.map((k, i) => (
              <pre key={i} className="bg-gray-900 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto">
                {JSON.stringify(k, null, 2)}
              </pre>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle} title="No anti-cheat kicks recorded">
            Embark’s bans are issued as backend restrictions, so the EAC <code>kicks</code> list is usually empty even for banned accounts. If your export has any, they’ll be listed here verbatim.
          </EmptyState>
        )}
        <Note>
          The structure of a populated kick entry isn’t known yet — it’s rendered raw above for now. Share one with us if you have one.
        </Note>
      </Panel>

      {/* Reports the player filed against others */}
      <ReportsPanel data={reports} />

      {/* Identity */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Identity">
          <Row label="In-game name" value={identity.fullName} />
          <Row label="Embark User ID" value={identity.embarkUserId} mono />
          <Row label="Email" value={identity.email} />
          <Row label="Country" value={identity.countryCode} />
          <Row label="Date of birth" value={identity.dateOfBirth ? date(identity.dateOfBirth) : '—'} />
          <Row label="Account created" value={date(identity.accountCreatedAt)} />
          <Row label="Playtester" value={identity.isPlaytester == null ? '—' : identity.isPlaytester ? 'Yes' : 'No'} />
        </Panel>

        <Panel title={`Linked accounts (${linkedAccounts.length})`}>
          {linkedAccounts.length === 0 ? (
            <p className="text-sm text-gray-500">No linked platforms recorded.</p>
          ) : (
            <ul className="space-y-2">
              {linkedAccounts.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <Link2 className="w-4 h-4 text-gray-500 shrink-0" />
                    <Badge tone="blue">{providerLabel(a.provider)}</Badge>
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 hover:underline truncate inline-flex items-center gap-1"
                        title={a.url}
                      >
                        {a.handle || a.name} <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-white truncate">{a.handle || a.name || '—'}</span>
                    )}
                  </span>
                  {a.enabled === false && <Badge tone="gray">disabled</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Hardware / session signals */}
      <Panel title="Device & session signals">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
          <StatCard label="Operating systems" value={num(antiCheat.operatingSystems.length)} />
          <StatCard label="Screen resolutions" value={num(antiCheat.resolutions.length)} />
          <StatCard label="Distinct machines (TPM)" value={num(antiCheat.distinctTamperIds)} />
          <StatCard label="Anybrain sessions" value={num(antiCheat.anybrainSessionCount)} />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {antiCheat.operatingSystems.map((os) => (
            <span key={os} className="inline-flex items-center gap-1 text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
              <Cpu className="w-3 h-3" /> {os}
            </span>
          ))}
          {antiCheat.resolutions.map((r) => (
            <span key={r} className="inline-flex items-center gap-1 text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
              <Monitor className="w-3 h-3" /> {r}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
};
