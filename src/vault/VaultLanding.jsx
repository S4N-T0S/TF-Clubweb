import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ShieldCheck, Upload, FolderOpen, WifiOff, Lock, AlertTriangle, Loader2, ChevronLeft, ChevronDown,
  Mail, ExternalLink, Copy, Check, Sparkles, ArrowRight, HelpCircle,
  User, Swords, Crosshair, BarChart3, Layers, Wallet, Radar, ShieldAlert,
} from 'lucide-react';
import { useVaultData } from './context/VaultDataContext';
import { SITE_URL, VAULT_BASE } from './constants';

// SEO for the public landing page only
const SEO = {
  title: 'Your Data Vault — Offline GDPR Explorer | THE FINALS Tracker',
  description:
    'Request your THE FINALS data from Embark (a free GDPR data request) and load it here to explore it as a private dashboard — full match history, hours, K/D, cash-outs, money spent, login sessions and account details. Fully offline: parsed in your browser, never uploaded. Or preview it instantly with sample data.',
  keywords:
    'the finals gdpr, the finals data request, sar export, embark data export, the finals match history, the finals data vault, offline, privacy, the finals tracker',
  url: `${SITE_URL}${VAULT_BASE}`,
};

const EMBARK_PRIVACY_URL = 'https://www.embark-studios.com/privacy-policy';
const EMBARK_PRIVACY_EMAIL = 'privacy@support.embark-studios.com';

// A ready-to-send request
const EMAIL_TEMPLATE = `To: ${EMBARK_PRIVACY_EMAIL}
Subject: Data access request (GDPR) — THE FINALS

Hello Embark Studios,

Under the GDPR (Article 15) I would like to request a copy of all
personal data you hold about my THE FINALS / Embark account.

- Embark display name: <your name#0000>
- Account email: <the address I am sending this from>
- Platform(s): <Steam / PlayStation / Xbox / ...>

Please include my full match history, account and profile details,
purchase and transaction history, and login/session and anti-cheat
records. I am sending this from the email address linked to my
account so you can verify my identity.

Thank you,
<your name>`;

// The page cards
const SHOWCASE = [
  { icon: User, label: 'Career', sub: VAULT_BASE, desc: 'Lifetime hours, K/D, total cash-outs, kills & revives.' },
  { icon: Swords, label: 'Match history', sub: `${VAULT_BASE}/matches`, desc: 'Every match since launch — ranked tournaments round-by-round.' },
  { icon: Crosshair, label: 'Weapons', sub: `${VAULT_BASE}/weapons`, desc: 'Eliminations per weapon across every class.' },
  { icon: BarChart3, label: 'Breakdown', sub: `${VAULT_BASE}/breakdown`, desc: 'Real K/D and win rate per map, mode and class.' },
  { icon: Layers, label: 'Loadouts', sub: `${VAULT_BASE}/loadouts`, desc: 'How much you played each class and your top weapons.' },
  { icon: Wallet, label: 'Purchases', sub: `${VAULT_BASE}/purchases`, desc: 'Real money spent, Multibucks ledger and owned DLC.' },
  { icon: Radar, label: 'Sessions', sub: `${VAULT_BASE}/sessions`, desc: 'Every login, IP and country on an offline world map.' },
  { icon: ShieldAlert, label: 'Account & bans', sub: `${VAULT_BASE}/account`, desc: 'Email, DOB, country, linked accounts and ban status.' },
];

// What turns up in the export, in plain terms — sets expectations before the file arrives
const INCLUDES = [
  'Your full match history, from the day you started playing',
  'Career stats: K/D, hours played, total kills, revives and cashed-out money',
  'How much real money you’ve spent, and every in-game transaction',
  'Every login session — when, from which IP address and country',
  'Your chat logs — in-game text chat and messages to player support',
  'Anti-cheat records (Embark redacts most of the sensitive detail)',
  'Account basics: email, date of birth, country and creation date',
  'Linked accounts — Steam, PlayStation, Xbox and others',
];

const Assurance = ({ icon: Icon, title, children }) => (
  <div className="flex gap-3">
    <Icon className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-gray-400 mt-0.5">{children}</p>
    </div>
  </div>
);

const Step = ({ n, title, children }) => (
  <div className="flex gap-3">
    <span className="shrink-0 w-7 h-7 rounded-full bg-emerald-600/20 text-emerald-300 text-sm font-bold grid place-items-center">{n}</span>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="text-sm text-gray-400 mt-0.5">{children}</div>
    </div>
  </div>
);

export const VaultLanding = () => {
  const { status, progress, error, load, loadSample } = useVaultData();
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const isLoading = status === 'loading';

  // Build the sample and drop straight onto the chosen page.
  const preview = (sub = VAULT_BASE) => {
    loadSample();
    navigate(sub);
  };

  const copyTemplate = async () => {
    try {
      await navigator.clipboard?.writeText(EMAIL_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the text is selectable in the box anyway */
    }
  };

  // webkitdirectory/directory aren't standard React props — set them on the
  // node so the picker can select a whole extracted SAR folder.
  const setFolderInput = (el) => {
    folderInput.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (isLoading) return;
    const files = e.dataTransfer?.files;
    if (files?.length) load(files);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 animate-fade-in-up">
      <Helmet>
        <title>{SEO.title}</title>
        <meta name="description" content={SEO.description} />
        <meta name="keywords" content={SEO.keywords} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={SEO.url} />
        <meta property="og:title" content={SEO.title} />
        <meta property="og:description" content={SEO.description} />
        <meta property="og:url" content={SEO.url} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={SEO.title} />
        <meta name="twitter:description" content={SEO.description} />
      </Helmet>
      <Link to="/hub" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-6">
        <ChevronLeft className="w-4 h-4" /> Back to leaderboard
      </Link>

      {/* Hero */}
      <div className="text-center mb-8">
        <ShieldCheck className="w-14 h-14 text-emerald-400 mx-auto mb-3" />
        <h1 className="text-3xl font-bold text-white">Your Data Vault</h1>
        <p className="text-gray-400 max-w-2xl mx-auto mt-3">
          THE FINALS quietly records <em>everything</em> — every match you’ve ever played, every login, every purchase.
          The law says you can ask Embark for a copy of all of it. This tool turns that data dump into a clean, readable
          dashboard, entirely on your own device.
        </p>
      </div>

      {/* Instant preview — see the whole thing before you even request your data */}
      <div className="rounded-2xl border border-emerald-600/30 bg-emerald-950/20 p-5 sm:p-6 mb-8 flex flex-col sm:flex-row sm:items-center gap-4">
        <Sparkles className="w-8 h-8 text-emerald-400 shrink-0 mx-auto sm:mx-0" />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-white font-semibold">Don’t have your data yet? Take a look around first.</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Explore a fictional player’s dashboard to see exactly what yours will look like once Embark sends your files.
          </p>
        </div>
        <button
          onClick={() => preview()}
          className="shrink-0 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          Preview with sample data <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Showcase grid — the example-player tour, front and centre */}
      <section className="mb-8">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">What you’ll be able to explore</h2>
            <p className="text-sm text-gray-400 mt-0.5">Click any card to open it with sample data.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SHOWCASE.map(({ icon: Icon, label, sub, desc }) => (
            <button
              key={label}
              onClick={() => preview(sub)}
              className="group text-left bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-emerald-600/50 rounded-xl p-4 transition-colors"
            >
              <Icon className="w-6 h-6 text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-white flex items-center gap-1">
                {label}
                <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
              </p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Collapsible guide — keep the long explanations tucked away by default */}
      <section className="mb-8">
        <button
          onClick={() => setShowGuide((v) => !v)}
          aria-expanded={showGuide}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-gray-700 bg-gray-800/40 hover:bg-gray-800/70 px-5 py-4 text-left transition-colors"
        >
          <span className="flex items-center gap-3 min-w-0">
            <HelpCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-white font-semibold">New here? How to get your THE FINALS data</span>
              <span className="block text-xs text-gray-400 mt-0.5">
                What GDPR is, the exact email to send Embark, and what you’ll get back — free, within ~30 days.
              </span>
            </span>
          </span>
          <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
        </button>

        {showGuide && (
          <div className="mt-5 space-y-8 animate-fade-in-up">
            {/* What is this / your right to the data */}
            <div>
              <h3 className="text-lg font-bold text-white mb-3">What is this, and why can I do it?</h3>
              <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
                <p>
                  THE FINALS is made by <strong>Embark Studios AB</strong>, based in Stockholm, Sweden. Because they’re an
                  EU company, the <strong>GDPR</strong> applies — and under it (and similar laws like the UK GDPR and
                  California’s CCPA) you have the right to ask any company for a copy of all the personal data they hold
                  about you. That request is called a <em>Subject Access Request</em> (SAR), and it’s <strong>free</strong>.
                </p>
                <p>
                  For THE FINALS, that means Embark will send you a package of files covering your entire account — your
                  match history going back to the start, your stats, what you’ve spent, where you’ve logged in from, and
                  more. The files are technical and not meant to be read by hand. <strong>That’s what this page is for:</strong>{' '}
                  load the package here and it’s parsed into the dashboard you can preview above.
                </p>
              </div>
            </div>

            {/* How to request it */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4">How to request your data from Embark</h3>
              <div className="space-y-5">
                <Step n={1} title="Email Embark’s privacy team">
                  Send a short request to{' '}
                  <a href={`mailto:${EMBARK_PRIVACY_EMAIL}`} className="text-emerald-400 hover:underline break-all">{EMBARK_PRIVACY_EMAIL}</a>{' '}
                  (the contact listed in{' '}
                  <a href={EMBARK_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">
                    Embark’s Privacy Policy <ExternalLink className="w-3 h-3" />
                  </a>
                  ). There’s a copy-and-paste template below.
                </Step>
                <Step n={2} title="Send it from your account email">
                  Use the <strong>email address linked to your THE FINALS / Embark account</strong> — that’s how they
                  confirm the request is really you. Mention your in-game name and platform too.
                </Step>
                <Step n={3} title="Wait up to 30 days">
                  By law Embark must respond within <strong>one month</strong>. They’ll reply with a download containing
                  your data files (often a <code className="text-gray-400">.zip</code>).
                </Step>
                <Step n={4} title="Load the files here">
                  Come back and drop the package into the box below — or click any card above to see that page with sample
                  data right now.
                </Step>
              </div>

              {/* Email template */}
              <div className="mt-5 rounded-xl border border-gray-700 bg-gray-900/60 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-700 bg-gray-800/60">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    <Mail className="w-4 h-4 text-emerald-400" /> Email template
                  </span>
                  <button
                    onClick={copyTemplate}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 px-2.5 py-1 rounded-md transition-colors"
                  >
                    {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <pre className="text-xs text-gray-300 p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono">{EMAIL_TEMPLATE}</pre>
              </div>

              {/* What arrives */}
              <div className="mt-5 rounded-xl border border-gray-700 bg-gray-800/40 p-5">
                <p className="text-sm font-semibold text-white mb-3">What Embark sends back includes:</p>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                  {INCLUDES.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Upload zone */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-1">Already have your export?</h2>
        <p className="text-sm text-gray-400 mb-4">Drop it in — it’s read on your device and never uploaded anywhere.</p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!isLoading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? 'border-emerald-400 bg-emerald-500/5' : 'border-gray-600 bg-gray-800/40'
          }`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
              <p className="text-sm text-gray-300">{progress || 'Working…'}</p>
              <p className="text-xs text-gray-500">Large exports can take a moment — this all happens on your device.</p>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-white font-medium">Drop your SAR package here</p>
              <p className="text-xs text-gray-500 mt-1">
                The whole <code className="text-gray-400">.zip</code> from the email, or the folder you extracted it to.
              </p>

              <div className="flex flex-wrap gap-3 justify-center mt-5">
                <button
                  onClick={() => fileInput.current?.click()}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" /> Choose files
                </button>
                <button
                  onClick={() => folderInput.current?.click()}
                  className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <FolderOpen className="w-4 h-4" /> Choose a folder
                </button>
              </div>

              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".zip,.jsonl,.json,.txt,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.length && load(e.target.files)}
              />
              <input
                ref={setFolderInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files?.length && load(e.target.files)}
              />
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Couldn’t read that</p>
              <p className="text-xs text-red-200/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}
      </section>

      {/* Privacy assurances */}
      <div className="grid sm:grid-cols-3 gap-5 bg-gray-800/40 border border-gray-700 rounded-2xl p-6">
        <Assurance icon={WifiOff} title="Nothing is uploaded">
          Your files are read in your browser. They never leave your device — no server, no cloud.
        </Assurance>
        <Assurance icon={Lock} title="Nothing is stored">
          Data lives in memory only. Close or refresh the tab and it’s gone.
        </Assurance>
        <Assurance icon={ShieldCheck} title="Works offline">
          You can disconnect from the internet before loading files. Everything still works.
        </Assurance>
      </div>
    </div>
  );
};
