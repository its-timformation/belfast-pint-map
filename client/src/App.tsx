import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAppStore } from "./lib/store";
import { APP_VERSION } from './lib/version';
import { PinSentry } from "./components/PinSentry";
import { BuildNotification } from "./components/BuildNotification";
import { CRAWL_ACTIVE_KEY } from "./pages/CrawlPage";

import Dashboard from "./pages/Dashboard";
import MapPage from "./pages/MapPage";
import ListPage from "./pages/ListPage";
import BarDetail from "./pages/BarDetail";
import SubmitPrice from "./pages/SubmitPrice";
import Admin from "./pages/Admin";
import LiveNow from "./pages/LiveNow";
import CrawlPage from "./pages/CrawlPage";

const ADMIN_SESSION_KEY = "bpm-admin-session";
const SESSION_TTL_MS   = 30 * 60 * 1000;

function hasAdminSession(): boolean {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return false;
    return Date.now() - parseInt(raw) < SESSION_TTL_MS;
  } catch { return false; }
}
function setAdminSession()  { try { sessionStorage.setItem(ADMIN_SESSION_KEY, Date.now().toString()); } catch {} }
function clearAdminSession(){ try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch {} }

/* ── Live Crawl Banner ─────────────────────────────────────── */
function LiveCrawlBanner() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [crawlInfo, setCrawlInfo] = useState<{ name: string; stopIdx: number; total: number; barName: string } | null>(null);

  useEffect(() => {
    function check() {
      try {
        const saved = JSON.parse(localStorage.getItem(CRAWL_ACTIVE_KEY) ?? "");
        if (saved?.draft?.barIds?.length) {
          const barIds: number[] = saved.draft.barIds;
          setCrawlInfo({
            name:    saved.draft.name || "Pub Crawl",
            stopIdx: saved.activeStopIdx ?? 0,
            total:   barIds.length,
            barName: "",  // bar name resolved client-side below
          });
        } else {
          setCrawlInfo(null);
        }
      } catch { setCrawlInfo(null); }
    }
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [location.pathname]);

  if (!crawlInfo) return null;
  // Don't show banner on the crawl page itself
  if (location.pathname.startsWith("/crawl")) return null;

  return (
    <button
      data-shell="live-banner"
      onClick={() => navigate("/crawl")}
      className="w-full bg-[var(--color-blaze)] hairline-b border-black/20"
    >
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between">
        <div className="text-left">
          <div className="text-eyebrow text-[var(--color-paper)] opacity-80 leading-none mb-0.5">
            CRAWL ACTIVE · STOP {crawlInfo.stopIdx + 1}/{crawlInfo.total}
          </div>
          <div className="font-display text-sm text-[var(--color-paper)] uppercase leading-none">
            {crawlInfo.name}
          </div>
        </div>
        <div className="text-eyebrow text-[var(--color-paper)] opacity-80 flex items-center gap-1">
          CONTINUE
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>
    </button>
  );
}

/* ── Ticker ────────────────────────────────────────────────── */
function TickerBand({ adminActive, onAdminTap }: { adminActive: boolean; onAdminTap: () => void }) {
  const location = useLocation();
  const today    = new Date();
  const dateStr  = `${today.getDate().toString().padStart(2,'0')}.${(today.getMonth()+1).toString().padStart(2,'0')}.${today.getFullYear().toString().slice(-2)}`;
  const pageMap: Record<string, string> = { '/': 'DISPATCH 01', '/map': 'DISPATCH 02', '/list': 'DISPATCH 03', '/crawl': 'DISPATCH 04' };
  let pageLabel = pageMap[location.pathname] || '';
  if (!pageLabel) {
    if (location.pathname.startsWith('/bar/'))    pageLabel = 'DISPATCH 04';
    else if (location.pathname.startsWith('/submit/')) pageLabel = 'DISPATCH 05';
    else if (location.pathname.startsWith('/crawl'))   pageLabel = 'DISPATCH 04';
    else if (location.pathname.startsWith('/admin'))   pageLabel = 'ADMIN';
  }
  return (
    <div data-shell="ticker" className="bg-[var(--color-ink)] text-[var(--color-paper)] hairline-b">
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between text-eyebrow opacity-70">
        <span>BELFAST</span>
        <span>{dateStr}</span>
        <button onClick={onAdminTap} className="!min-h-0 px-1 -mx-1 hover:opacity-100 transition-opacity" aria-label="Editorial volume marker">
          <span className={adminActive ? "text-[var(--color-blaze)] opacity-100" : ""}>
            {adminActive ? `v${APP_VERSION}` : (pageLabel || 'VOL.01')}
          </span>
        </button>
      </div>
    </div>
  );
}

/* ── Header ────────────────────────────────────────────────── */
function Header({ onWordmarkTap }: { onWordmarkTap: () => void }) {
  const { currency, setCurrency, stoutsMode } = useAppStore();
  const navigate = useNavigate();
  return (
    <header data-shell="header" className="bg-[var(--color-ink)] hairline-b">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
        <button onClick={() => { onWordmarkTap(); navigate("/"); }} aria-label="Belfast Pint Map home">
          <span className="font-display text-xl uppercase leading-none text-[var(--color-paper)] tracking-wide">
            {stoutsMode ? "STOUTS" : "BELFAST"}<span className="text-[var(--color-blaze)]">·</span>PINT<span className="text-[var(--color-blaze)]">·</span>MAP
          </span>
        </button>
        <select value={currency} onChange={e => setCurrency(e.target.value as any)}
          className="bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] text-meta uppercase font-mono px-2.5 py-1.5 cursor-pointer hover:border-[var(--color-blaze)] transition-colors focus:outline-none focus:border-[var(--color-blaze)]"
          aria-label="Currency">
          <option value="GBP">GBP £</option>
          <option value="EUR">EUR €</option>
          <option value="CHF">CHF Fr</option>
        </select>
      </div>
    </header>
  );
}

/* ── Bottom Nav — icons only, no labels ─────────────────────── */
function BottomNav() {
  const location = useLocation();
  const items = [
    { to: "/", label: "Dashboard", icon: (
      // Home
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 12L12 4l9 8M5 10v10h5v-6h4v6h5V10"/>
      </svg>
    )},
    { to: "/map", label: "Map", icon: (
      // Map pin
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 22S4 14 4 9a8 8 0 0116 0c0 5-8 13-8 13z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    )},
    { to: "/list", label: "Bars", icon: (
      // Pint glass
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 3h10l-2 16a2 2 0 01-2 2H11a2 2 0 01-2-2L7 3z"/>
        <path d="M6 3h12"/>
        <path d="M9 9h6"/>
      </svg>
    )},
    { to: "/crawl", label: "Crawl", icon: (
      // Route between two points
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="5" cy="19" r="2"/>
        <circle cx="19" cy="5" r="2"/>
        <path d="M7 19h5a7 7 0 007-7V5"/>
      </svg>
    )},
  ];

  return (
    <nav data-shell="nav" className="bg-[var(--color-ink)] hairline-t pb-safe">
      <div className="max-w-md mx-auto grid grid-cols-4">
        {items.map(item => {
          const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
          return (
            <Link key={item.to} to={item.to}
              className="relative flex flex-col items-center justify-center py-4 min-h-[56px] w-full"
              aria-label={item.label} aria-current={active ? "page" : undefined}>
              <span className={active ? "text-[var(--color-blaze)]" : "text-[var(--color-paper)] opacity-50"}>
                {item.icon}
              </span>
              {active && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[var(--color-blaze)]" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Shell ──────────────────────────────────────────────────── */
function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { enterStoutsMode, exitStoutsMode, stoutsExpires, stoutsMode } = useAppStore();

  const [showSentry,  setShowSentry]  = useState(false);
  const [adminActive, setAdminActive] = useState(() => hasAdminSession());
  const [tapCount,    setTapCount]    = useState(0);
  const [tapStart,    setTapStart]    = useState(0);

  const onWordmarkTap = () => {
    const now = Date.now();
    if (now - tapStart > 10_000) { setTapCount(1); setTapStart(now); return; }
    const next = tapCount + 1; setTapCount(next);
    if (next >= 7) { if (stoutsMode) exitStoutsMode(); else enterStoutsMode(); setTapCount(0); }
  };

  useEffect(() => {
    if (!stoutsMode || !stoutsExpires) return;
    const remaining = stoutsExpires - Date.now();
    if (remaining <= 0) { exitStoutsMode(); return; }
    const id = setTimeout(() => exitStoutsMode(), remaining);
    return () => clearTimeout(id);
  }, [stoutsMode, stoutsExpires, exitStoutsMode]);

  const onAdminTap = () => { if (adminActive) navigate("/admin"); else setShowSentry(true); };
  const onUnlock   = (token: string) => {
    setAdminSession();
    try { sessionStorage.setItem("bpm-admin-token", token); } catch {}
    setAdminActive(true); setShowSentry(false); navigate("/admin");
  };
  const onExitAdmin = () => {
    clearAdminSession();
    try { sessionStorage.removeItem("bpm-admin-token"); } catch {}
    setAdminActive(false); navigate("/");
  };

  const isFullScreen = location.pathname.startsWith('/admin');

  // Use ResizeObserver on the header container so --shell-top auto-updates
  // whenever the live crawl banner appears or disappears
  useEffect(() => {
    const el = document.getElementById("shell-header");
    if (!el) return;
    function measure() {
      const topH   = el!.clientHeight;
      const nav    = document.querySelector('[data-shell="nav"]');
      const bottomH = nav?.clientHeight ?? 60;
      document.documentElement.style.setProperty('--shell-top',    `${topH}px`);
      document.documentElement.style.setProperty('--shell-bottom', `${bottomH}px`);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [location.pathname]);

  return (
    <>
      <div id="shell-header" className="fixed top-0 left-0 right-0 z-50">
        <TickerBand adminActive={adminActive} onAdminTap={onAdminTap} />
        <Header onWordmarkTap={onWordmarkTap} />
        <LiveCrawlBanner />
      </div>

      <main className="absolute inset-0 overflow-y-auto" style={{
        paddingTop: 'var(--shell-top, 100px)',
        paddingBottom: 'var(--shell-bottom, 60px)',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}>
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/map"           element={<MapPage />} />
          <Route path="/list"          element={<ListPage />} />
          <Route path="/bar/:id"       element={<BarDetail />} />
          <Route path="/submit/:id"    element={<SubmitPrice />} />
          <Route path="/admin"         element={<Admin onExit={onExitAdmin} />} />
          <Route path="/live"          element={<LiveNow />} />
          <Route path="/crawl"         element={<CrawlPage />} />
          <Route path="/crawl/c/:code" element={<CrawlPage />} />
          <Route path="/crawl/join/:code" element={<CrawlPage />} />
        </Routes>
      </main>

      {!isFullScreen && (
        <div className="fixed bottom-0 left-0 right-0 z-50"><BottomNav /></div>
      )}

      {showSentry && <PinSentry onUnlock={onUnlock} onCancel={() => setShowSentry(false)} />}
      <BuildNotification isAdmin={adminActive} />
    </>
  );
}

export default function App() {
  return <BrowserRouter><Shell /></BrowserRouter>;
}
