import { useEffect, useMemo, useRef, useState } from 'react';
import { Radar, Cpu, Wifi, Loader2, KeyRound, Keyboard } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { PageHeader, Panel, StatCard, Badge, Note, EmptyState } from '../components/ui';
import { ListSearch, SearchEcho } from '../components/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { Pagination } from '../../components/Pagination';
import { WorldMap } from '../components/WorldMap';
import { isoToFlag, loadWorldGeo } from '../lib/worldgeo';
import { num, date, dateTime, duration } from '../lib/format';

const PER_PAGE = 15;
const sourceTone = { EOS: 'blue', Anybrain: 'purple', Denuvo: 'yellow', Logins: 'emerald' };

// Friendly names for the backend OAuth grant types on `UserLogin` rows.
const GRANT_LABELS = {
  authorization_code: 'Interactive sign-ins',
  client_credentials: 'Game-client tokens',
  refresh_token: 'Session refreshes',
};

// Resolve peripheral VID/PIDs to vendor/product names from the bundled usb.ids
// snapshot (~3.4k vendors). Same lazy pattern as the geo DB: lib/usbids.js is
// dynamically imported and fetches the pre-gzipped asset once, only when an
// export has peripherals; until it loads (or if it can't) devices show raw ids.
function usePeripheralNames(peripherals) {
  const [db, setDb] = useState(null);
  useEffect(() => {
    if (!peripherals.length) return undefined;
    let alive = true;
    import('../lib/usbids')
      .then((m) => m.loadUsbDb())
      .then((d) => alive && setDb(d))
      .catch(() => {});
    return () => { alive = false; };
  }, [peripherals]);
  return useMemo(() => {
    const resolved = peripherals.map((p) => {
      const [vendor, products] = (db && db[p.vid.toLowerCase()]) || [];
      return { ...p, vendor: vendor || null, product: (products && products[p.pid.toLowerCase()]) || null };
    });
    // Known vendors first (alphabetical), unregistered ids last.
    return resolved.sort((a, b) => Number(!a.vendor) - Number(!b.vendor) || (a.vendor || '').localeCompare(b.vendor || '') || a.id.localeCompare(b.id));
  }, [db, peripherals]);
}

// Resolve each unique IP to a country, offline. The mmdb reader (mmdb-lib + buffer) is dynamically imported so it stays out of the main vault chunk.
function useGeoCountries(ips) {
  const [state, setState] = useState({ status: ips.length ? 'loading' : 'none', countries: [] });
  useEffect(() => {
    let alive = true;
    if (!ips.length) {
      setState({ status: 'none', countries: [] });
      return undefined;
    }
    setState({ status: 'loading', countries: [] });
    loadWorldGeo().catch(() => {}); // warm the map geometry in parallel — WorldMap only mounts after the (much larger) geo DB resolves
    import('../lib/geoip')
      .then(async (geo) => {
        const reader = await geo.loadGeoReader();
        const map = new Map();
        for (const rec of ips) {
          const c = geo.lookupCountry(reader, rec.ip);
          const key = c?.iso || '??';
          let g = map.get(key);
          if (!g) {
            g = { iso: c?.iso || null, name: c?.name || 'Unknown', ips: 0, sessions: 0, firstMs: Infinity, lastMs: -Infinity };
            map.set(key, g);
          }
          g.ips += 1;
          g.sessions += rec.count || 0;
          if (rec.firstMs != null) g.firstMs = Math.min(g.firstMs, rec.firstMs);
          if (rec.lastMs != null) g.lastMs = Math.max(g.lastMs, rec.lastMs);
        }
        const countries = [...map.values()]
          .map((g) => ({ ...g, firstMs: Number.isFinite(g.firstMs) ? g.firstMs : null, lastMs: Number.isFinite(g.lastMs) ? g.lastMs : null }))
          .sort((a, b) => b.sessions - a.sessions);
        if (alive) setState({ status: 'ready', countries });
      })
      .catch(() => alive && setState({ status: 'error', countries: [] }));
    return () => { alive = false; };
  }, [ips]);
  return state;
}

const ActivityStrip = ({ activity }) => {
  const max = activity.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  if (!activity.length) return null;
  return (
    <Panel title="Activity over time (weekly sessions)">
      <div className="flex items-end gap-px h-24 overflow-x-auto" title="Each bar = one week">
        {activity.map((b) => (
          <div
            key={b.ms}
            className="flex-1 min-w-0.5 bg-emerald-500/70 rounded-sm"
            style={{ height: `${Math.max(b.count ? 6 : 0, (b.count / max) * 100)}%` }}
            title={`${date(b.ms, 'd MMM yyyy')} — ${b.count} session${b.count === 1 ? '' : 's'}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-gray-500 mt-2">
        <span>{date(activity[0].ms)}</span>
        <span>{date(activity[activity.length - 1].ms)}</span>
      </div>
    </Panel>
  );
};

const IpTable = ({ ips }) => {
  const [page, setPage] = useState(1);
  const { query, setQuery, filtered } = useListSearch(
    ips,
    (r) => [r.ip, `IPv${r.version}`, ...(r.sources || [])],
    () => setPage(1)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const slice = filtered.slice(start, start + PER_PAGE);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-1 min-w-0">
          IP addresses ({num(ips.length)})
        </h3>
        <ListSearch
          value={query}
          onChange={setQuery}
          placeholder="Search IP or source…"
          matched={filtered.length}
          total={ips.length}
          className="w-full sm:w-64"
        />
      </div>
      <div className="table-container" style={totalPages > 1 ? { minHeight: PER_PAGE * 38 } : undefined}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left py-2 px-3 font-medium">IP address</th>
              <th className="text-left py-2 px-3 font-medium">Type</th>
              <th className="text-right py-2 px-3 font-medium">Records</th>
              <th className="text-left py-2 px-3 font-medium">First seen</th>
              <th className="text-left py-2 px-3 font-medium">Last seen</th>
              <th className="text-left py-2 px-3 font-medium">Sources</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.ip} className="border-b border-gray-700/40 last:border-0">
                <td className="py-2 px-3 font-mono text-white">{r.ip}</td>
                <td className="py-2 px-3"><Badge tone={r.version === 6 ? 'purple' : 'blue'}>IPv{r.version}</Badge></td>
                <td className="py-2 px-3 text-right tabular-nums text-white">{num(r.count)}</td>
                <td className="py-2 px-3 text-gray-400">{date(r.firstMs)}</td>
                <td className="py-2 px-3 text-gray-400">{date(r.lastMs)}</td>
                <td className="py-2 px-3 text-gray-400">{r.sources.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.trim() && filtered.length === 0 && (
        <p className="text-sm text-gray-500 py-3">No addresses match “{query.trim()}”.</p>
      )}
      {filtered.length > 0 && (
        <div className="mt-4">
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            startIndex={start}
            endIndex={start + PER_PAGE}
            totalItems={filtered.length}
            onPageChange={setPage}
            edgeScroll={false}
            variant="compact"
          />
        </div>
      )}
    </>
  );
};

export const SessionsPage = () => {
  const { model } = useVaultData();
  const { antiCheat } = model;
  const { sessions, sources, ips, activity } = antiCheat;
  const [page, setPage] = useState(1);
  const geo = useGeoCountries(ips);
  const peripherals = usePeripheralNames(antiCheat.peripherals || []);
  const sessionSearchRef = useRef(null);

  const countryCount = geo.countries.filter((c) => c.iso).length;
  const countriesValue = geo.status === 'loading' ? '…' : geo.status === 'none' ? '—' : num(countryCount);
  const countriesAccent = geo.status === 'ready' ? (countryCount > 1 ? 'text-orange-400' : 'text-emerald-400') : 'text-white';

  const { query, setQuery, filtered } = useListSearch(
    sessions,
    (s) => [s.os, s.platform, s.ip, s.source],
    () => setPage(1)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PER_PAGE;
  const slice = filtered.slice(startIndex, startIndex + PER_PAGE);

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader icon={Radar} title="Sessions & Anti-cheat" subtitle={`${num(sessions.length)} sessions across EOS, Anybrain and Denuvo`} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total sessions" value={num(sessions.length)} />
        <StatCard label="Unique IPs" value={num(ips.length)} accent={ips.length ? 'text-emerald-400' : 'text-white'} />
        <StatCard label="Machines (est.)" value={num(antiCheat.machineEstimate)} />
        <StatCard label="Countries" value={countriesValue} sub={countryCount > 1 ? 'multiple locations' : undefined} accent={countriesAccent} />
      </div>

      {activity.length > 0 && <ActivityStrip activity={activity} />}

      <Panel title="Data sources & retention">
        {sources.length === 0 ? (
          <p className="text-sm text-gray-500">No anti-cheat session files were found in this export.</p>
        ) : (
          <div className="space-y-3">
            {sources.map((s) => (
              <div key={s.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-gray-700/40 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-2">
                  <Badge tone={sourceTone[s.name]}>{s.name}</Badge>
                  <span className="text-white text-sm">{num(s.count)} {s.unit || 'sessions'}</span>
                  <span className="text-gray-500 text-xs">{date(s.firstMs)} → {date(s.lastMs)}</span>
                </div>
                <span className="text-xs text-gray-500">{s.note}</span>
              </div>
            ))}
          </div>
        )}
        <Note>EOS records frequent short sessions (it re-checks roughly every ~15–20 min), so its session count reflects heartbeats/reconnects rather than whole play sessions.</Note>
      </Panel>

      {/* Anybrain input-device fingerprint (peripherals.csv, newer exports only) */}
      {peripherals.length > 0 && (
        <Panel title="Peripherals">
          <div className="grid sm:grid-cols-2 gap-2">
            {peripherals.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 bg-gray-900/50 rounded-lg px-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <Keyboard className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="min-w-0">
                    <span className="text-white block truncate">{d.vendor || 'Unregistered vendor'}</span>
                    {d.product && <span className="text-gray-400 text-xs block truncate">{d.product}</span>}
                  </span>
                </span>
                <span className="text-gray-400 text-xs font-mono whitespace-nowrap">VID {d.vid} · PID {d.pid}</span>
              </div>
            ))}
          </div>
          <Note>
            Anybrain also records the USB ids of input devices (keyboards, mice, controllers) connected while the game ran —
            a hardware fingerprint. Each entry is one device, grouped from its per-interface records. Names are looked up
            offline in the public{' '}
            <a href="http://www.linux-usb.org/usb.ids" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">usb.ids</a>{' '}
            database; a device whose vendor never registered there shows only its raw id.
          </Note>
        </Panel>
      )}

      {/* Backend account sign-ins (persistence UserLogin) — the longest-lived IP trail */}
      {antiCheat.logins?.count > 0 && (
        <Panel title="Account sign-ins">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-white">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              {num(antiCheat.logins.count)} sign-ins
            </span>
            <span className="text-gray-500 text-xs">{date(antiCheat.logins.firstMs)} → {date(antiCheat.logins.lastMs)}</span>
            <span className="text-gray-500 text-xs">{num(antiCheat.logins.distinctIps)} distinct IP{antiCheat.logins.distinctIps === 1 ? '' : 's'}</span>
            <span className="flex-1" />
            {antiCheat.logins.grantTypes.map((g) => (
              <span key={g.type} className="inline-flex items-center gap-1.5 text-xs text-gray-300" title={g.type}>
                <Badge tone="gray">{num(g.count)}</Badge>
                {GRANT_LABELS[g.type] || g.type}
              </span>
            ))}
          </div>
          <Note>
            These are the account system’s token grants, not play sessions: interactive sign-ins are you logging in for example on the website,
            game-client tokens are the game authenticating you in the background when you open it. Their IPs feed the locations below and
            cover your whole account lifetime, unlike the windowed anti-cheat sources above.
          </Note>
        </Panel>
      )}

      {/* Locations / geolocation map */}
      <Panel title="Locations">
        {ips.length === 0 ? (
          <EmptyState icon={Wifi} title="No usable IP addresses in this export">
            {antiCheat.redactedIpCount > 0
              ? `${num(antiCheat.redactedIpCount)} records carried a redacted placeholder (e.g. "[REDACTED]") instead of an IP — a real, un-edited export keeps the actual addresses.`
              : 'This export did not include client IPs.'}
          </EmptyState>
        ) : geo.status === 'loading' ? (
          <div className="h-44 flex items-center justify-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Locating IP addresses on-device…</div>
        ) : geo.status === 'error' ? (
          <EmptyState icon={Wifi} title="Couldn’t load the offline geolocation database" />
        ) : (
          <>
            <WorldMap countries={geo.countries} />
            <p className="text-[10px] text-gray-500 mt-1 text-right">
              <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="hover:underline">IP Geolocation by DB-IP</a>
            </p>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {geo.countries.map((c, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-900/50 rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-base">{isoToFlag(c.iso)}</span>
                    <span className="text-white">{c.name}</span>
                  </span>
                  <span className="text-gray-400 text-xs">{num(c.ips)} IP{c.ips === 1 ? '' : 's'} · {num(c.sessions)} records</span>
                </div>
              ))}
            </div>
            <div className="mt-4"><IpTable ips={ips} /></div>
            {antiCheat.redactedIpCount > 0 && (
              <p className="text-xs text-gray-500 mt-2">{num(antiCheat.redactedIpCount)} records had a redacted/placeholder IP and are excluded.</p>
            )}
          </>
        )}
      </Panel>

      <Panel
        title="All sessions"
        action={
          sessions.length > 0 && (
            <ListSearch
              value={query}
              onChange={setQuery}
              placeholder="Search device, IP or source…"
              matched={filtered.length}
              total={sessions.length}
              className="w-full sm:w-72"
              inputRef={sessionSearchRef}
            />
          )
        }
      >
        <div className="table-container" style={totalPages > 1 ? { minHeight: PER_PAGE * 38 } : undefined}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium">Started</th>
                <th className="text-right py-2 px-3 font-medium">Duration</th>
                <th className="text-left py-2 px-3 font-medium">Source</th>
                <th className="text-left py-2 px-3 font-medium">Device / platform</th>
                <th className="text-left py-2 px-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((s, i) => (
                <tr key={startIndex + i} className="border-b border-gray-700/40 last:border-0">
                  <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{dateTime(s.start)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-400">{duration(s.durationMs)}</td>
                  <td className="py-2 px-3"><Badge tone={sourceTone[s.source]}>{s.source}</Badge></td>
                  <td className="py-2 px-3 text-gray-300">
                    <span className="inline-flex items-center gap-1">
                      {(s.os || s.platform) && <Cpu className="w-3 h-3 text-gray-500" />}
                      {s.os || s.platform || '—'}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-gray-400">{s.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {query.trim() && filtered.length === 0 && (
          <p className="text-sm text-gray-500 py-3">No sessions match “{query.trim()}”.</p>
        )}

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <SearchEcho value={query} onClear={() => setQuery('')} focusRef={sessionSearchRef} />
          {filtered.length > 0 && (
            <div className="flex-1">
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={startIndex + PER_PAGE}
                totalItems={filtered.length}
                onPageChange={(p) => setPage(p)}
                edgeScroll={false}
                variant="compact"
              />
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
};
