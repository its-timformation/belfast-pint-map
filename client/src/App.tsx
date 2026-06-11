import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAppStore } from "./lib/store";
import { APP_VERSION } from './lib/version';
import { PinSentry } from "./components/PinSentry";
import { BuildNotification } from "./components/BuildNotification";

import Dashboard from "./pages/Dashboard";
import MapPage from "./pages/MapPage";
import ListPage from "./pages/ListPage";
import BarDetail from "./pages/BarDetail";
import SubmitPrice from "./pages/SubmitPrice";
import Admin from "./pages/Admin";
import LiveNow from "./pages/LiveNow";
import CrawlPage from "./pages/CrawlPage";

const ADMIN_SESSION_KEY = "bpm-admin-session";
const SESSION_TTL_MS = 30 * 60 * 1000;

function hasAdminSession(): boolean {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return false;
    return Date.now() - parseInt(raw) < SESSION_TTL_MS;
  } catch { return false; }
}
function setAdminSession() {
  try { sessionStorage.setItem(ADMIN_SESSION_KEY, Date.now().toString()); } catch {}
}
function clearAdminSession() {
  try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch {}
}

/* ── Ticker ────────────────────────────────────────────────── */
function TickerBand({ adminActive, onAdminTap }: { adminActive: boolean; onAdminTap: () => void }) {
  const location = useLocation();
  const today = new Date();
  const dateStr = `${today.getDate().toString().padStart(2,'0')}.${(today.getMonth()+1).toString().padStart(2,'0')}.${today.getFullYear().toString().slice(-2)}`;
  const pageMap: Record<string, string> = {
    '/': 'DISPATCH 01',
    '/map': 'DISPATCH 02',
    '/list': 'DISPATCH 03',
    '/crawl': 'DISPATCH 04',
  };
  let pageLabel = pageMap[location.pathname] || '';
  if (!pageLabel) {
    if (location.pathname.startsWith('/bar/')) pageLabel = 'DISPATCH 04';
    else if (location.pathname.startsWith('/submit/')) pageLabel = 'DISPATCH 05';
    else if (location.pathname.startsWith('/crawl')) pageLabel = 'DISPATCH 04';
    else if (location.pathname.startsWith('/admin')) pageLabel = 'ADMIN';
  }
  return (
    <div data-shell="ticker" className="bg-[var(--color-ink)] text-[var(--color-paper)] hairline-b">
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between text-eyebrow opacity-70">
        <span>BELFAST</span>
        <span>{dateStr}</span>
        <button
          onClick={onAdminTap}
          className="!min-h-0 px-1 -mx-1 hover:opacity-100 transition-opacity"
          aria-label="Editorial volume marker"
        >
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
        <button onClick={() => { onWordmarkTap(); navigate("/"); }} className="group" aria-label="Belfast Pint Map home">
          <span className="font-display text-xl uppercase leading-none text-[var(--color-paper)] tracking-wide">
            {stoutsMode ? "STOUTS" : "BELFAST"}<span className="text-[var(--color-blaze)]">·</span>PINT<span className="text-[var(--color-blaze)]">·</span>MAP
          </span>
        </button>
        <div className="flex items-center gap-1">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as any)}
            className="bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] text-meta uppercase font-mono px-2.5 py-1.5 cursor-pointer hover:border-[var(--color-blaze)] transition-colors focus:outline-none focus:border-[var(--color-blaze)]"
            aria-label="Currency"
          >
            <option value="GBP">GBP £</option>
            <option value="EUR">EUR €</option>
            <option value="CHF">CHF Fr</option>
          </select>
        </div>
      </div>
    </header>
  );
}

/* ── Bottom Nav ─────────────────────────────────────────────── */
function BottomNav() {
  const location = useLocation();
  const items = [
    { to: "/", label: "DASHBOARD", icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 12 L12 4 L21 12 M5 10 V20 H10 V14 H14 V20 H19 V10" />
      </svg>
    )},
    { to: "/map", label: "MAP", icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 22 C12 22 4 14 4 9 A8 8 0 0 1 20 9 C20 14 12 22 12 22 Z M12 11 A2 2 0 1 0 12 7 A2 2 0 0 0 12 11" />
      </svg>
    )},
    { to: "/list", label: "BARS", icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    )},
    { to: "/crawl", label: "CRAWL", icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="5" cy="6" r="2" />
        <circle cx="12" cy="6" r="2" />
        <circle cx="19" cy="6" r="2" />
        <path d="M5 8 v4 l7 3 7-3 V8" />
        <path d="M12 11 v7" />
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
              className="relative flex flex-col items-center justify-center py-3 min-h-[60px] w-full"
              aria-current={active ? "page" : undefined}
            >
              <span className={active ? "text-[var(--color-blaze)]" : "text-[var(--color-paper)] opacity-60"}>
                {item.icon}
              </span>
              <span className={`text-eyebrow mt-1 ${active ? "text-[var(--color-blaze)]" : "text-[var(--color-paper)] opacity-60"}`}>{item.label}</span>
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

  const [showSentry, setShowSentry] = useState(false);
  const [adminActive, setAdminActive] = useState(() => hasAdminSession());
  const [tapCount, setTapCount] = useState(0);
  const [tapWindowStart, setTapWindowStart] = useState(0);

  const onWordmarkTap = () => {
    const now = Date.now();
    if (now - tapWindowStart > 10_000) { setTapCount(1); setTapWindowStart(now); return; }
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 7) {
      if (stoutsMode) exitStoutsMode(); else enterStoutsMode();
      setTapCount(0);
    }
  };

  useEffect(() => {
    if (!stoutsMode || !stoutsExpires) return;
    const remaining = stoutsExpires - Date.now();
    if (remaining <= 0) { exitStoutsMode(); return; }
    const id = setTimeout(() => exitStoutsMode(), remaining);
    return () => clearTimeout(id);
  }, [stoutsMode, stoutsExpires, exitStoutsMode]);

  const onAdminTap = () => {
    if (adminActive) navigate("/admin");
    else setShowSentry(true);
  };

  const onUnlock = (token: string) => {
    setAdminSession();
    try { sessionStorage.setItem("bpm-admin-token", token); } catch {}
    setAdminActive(true);
    setShowSentry(false);
    navigate("/admin");
  };

  const onExitAdmin = () => {
    clearAdminSession();
    try { sessionStorage.removeItem("bpm-admin-token"); } catch {}
    setAdminActive(false);
    navigate("/");
  };

  const isFullScreenPage = location.pathname.startsWith('/admin');

  useEffect(() => {
    function updateLayout() {
      const ticker = document.querySelector('[data-shell="ticker"]');
      const header = document.querySelector('[data-shell="header"]');
      const nav = document.querySelector('[data-shell="nav"]');
      const topH = (ticker?.clientHeight ?? 31) + (header?.clientHeight ?? 68);
      const bottomH = nav?.clientHeight ?? 65;
      document.documentElement.style.setProperty('--shell-top', `${topH}px`);
      document.documentElement.style.setProperty('--shell-bottom', `${bottomH}px`);
    }
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, [location.pathname]);

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        <TickerBand adminActive={adminActive} onAdminTap={onAdminTap} />
        <Header onWordmarkTap={onWordmarkTap} />
      </div>

      <main
        className="absolute inset-0 overflow-y-auto"
        style={{
          paddingTop: 'var(--shell-top, 100px)',
          paddingBottom: 'var(--shell-bottom, 80px)',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/list" element={<ListPage />} />
          <Route path="/bar/:id" element={<BarDetail />} />
          <Route path="/submit/:id" element={<SubmitPrice />} />
          <Route path="/admin" element={<Admin onExit={onExitAdmin} />} />
          <Route path="/live" element={<LiveNow />} />
          <Route path="/crawl" element={<CrawlPage />} />
          <Route path="/crawl/c/:code" element={<CrawlPage />} />
          <Route path="/crawl/join/:code" element={<CrawlPage />} />
        </Routes>
      </main>

      {!isFullScreenPage && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <BottomNav />
        </div>
      )}

      {showSentry && <PinSentry onUnlock={onUnlock} onCancel={() => setShowSentry(false)} />}
      <BuildNotification isAdmin={adminActive} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
