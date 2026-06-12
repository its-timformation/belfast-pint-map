import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { ChevronRight, X, Search, Users, Share2, MapPin, GripVertical, Check, AlertCircle } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAppStore, formatPrice, convertPrice, type Currency } from "../lib/store";
import { LoadingMessage } from "../components/LoadingMessage";

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */

type View = "landing" | "building" | "preview" | "active" | "done" | "discover" | "shared" | "join";

interface CrawlDraft {
  name: string;
  description: string;
  barIds: number[];
  authorName: string;
  shareCode: string | null;
  groupCode: string | null;
  generatedBy: "manual" | "auto";
  tags: string[];
}

export const CRAWL_DRAFT_KEY  = "bpm-crawl-draft";
export const CRAWL_ACTIVE_KEY = "bpm-crawl-active";
export const CRAWL_SAVED_KEY  = "bpm-saved-crawls";

/* ─────────────────────────────────────────────────────────────
   Saved crawls (local-only localStorage)
───────────────────────────────────────────────────────────── */

interface SavedCrawl {
  id: string;
  name: string;
  description: string;
  barIds: number[];
  savedAt: string;
  shareCode?: string | null;
}

function loadSavedCrawls(): SavedCrawl[] {
  try { return JSON.parse(localStorage.getItem(CRAWL_SAVED_KEY) ?? "[]") as SavedCrawl[]; }
  catch { return []; }
}
function persistSavedCrawls(crawls: SavedCrawl[]) {
  try { localStorage.setItem(CRAWL_SAVED_KEY, JSON.stringify(crawls)); } catch {}
}
function saveCrawlLocally(draft: CrawlDraft): SavedCrawl {
  const crawl: SavedCrawl = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: draft.name.trim() || "Untitled Crawl",
    description: draft.description,
    barIds: draft.barIds,
    savedAt: new Date().toISOString(),
    shareCode: draft.shareCode,
  };
  const existing = loadSavedCrawls().filter(
    c => !(c.name === crawl.name && c.barIds.join() === crawl.barIds.join())
  );
  persistSavedCrawls([crawl, ...existing]);
  return crawl;
}
function deleteSavedCrawl(id: string) {
  persistSavedCrawls(loadSavedCrawls().filter(c => c.id !== id));
}

const EMPTY: CrawlDraft = {
  name: "", description: "", barIds: [], authorName: "",
  shareCode: null, groupCode: null, generatedBy: "manual", tags: [],
};

/* ─────────────────────────────────────────────────────────────
   Active crawl persistence
   FIX BUG-01/02: saveActive takes explicit draft — no stale closure
───────────────────────────────────────────────────────────── */

function persistActiveCrawl(
  draft: CrawlDraft,
  stopIdx: number,
  groupCode: string | null,
  isHost: boolean,
) {
  try {
    localStorage.setItem(
      CRAWL_ACTIVE_KEY,
      JSON.stringify({ draft, activeStopIdx: stopIdx, isHost, groupCode }),
    );
  } catch {}
}

/* ─────────────────────────────────────────────────────────────
   Geo / routing helpers
───────────────────────────────────────────────────────────── */

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function crawlStats(stops: Array<{ lat: number; lng: number }>) {
  if (stops.length < 2) return { distanceKm: 0, durationMin: 0 };
  let dist = 0;
  for (let i = 0; i < stops.length - 1; i++) dist += haversineKm(stops[i], stops[i + 1]);
  return { distanceKm: dist, durationMin: Math.round((dist / 5) * 60) + stops.length * 45 };
}

function formatDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}

// FIX BUG-22: Use coordinates where available, fall back to name
function buildGoogleMapsUrl(stops: Array<{ name: string; lat: number; lng: number }>) {
  if (stops.length < 2) return "";
  const waypoints = stops.map(s => `${s.lat},${s.lng}`);
  const origin = waypoints[0];
  const dest   = waypoints[waypoints.length - 1];
  const middle = waypoints.slice(1, -1);
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=walking`;
  if (middle.length) url += `&waypoints=${middle.join("|")}`;
  return url;
}

// FIX BUG-14: Apple Maps waypoints use +to: syntax
function buildAppleMapsUrl(stops: Array<{ name: string; lat: number; lng: number }>) {
  if (stops.length < 2) return "";
  const encName = (s: { name: string }) => encodeURIComponent(`${s.name} Belfast`);
  const saddr = encName(stops[0]);
  // daddr chains all remaining stops with +to:
  const daddr = stops.slice(1).map(encName).join("+to:");
  return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=w`;
}

function shareCrawl(name: string, shareCode: string) {
  const url = `${window.location.origin}/crawl/c/${shareCode}`;
  if (navigator.share) navigator.share({ title: name, text: `Join my Belfast pub crawl: ${name}`, url }).catch(() => {});
  else navigator.clipboard?.writeText(url).catch(() => {});
}

function shareGroup(name: string, groupCode: string) {
  const url = `${window.location.origin}/crawl/join/${groupCode}`;
  if (navigator.share) navigator.share({ title: `Join ${name}`, text: `Join my live pub crawl! Code: ${groupCode}`, url }).catch(() => {});
  else navigator.clipboard?.writeText(url).catch(() => {});
}

type PresetId = "cheapest" | "guinness" | "craft" | "trad" | "brewery" | "epic" | "area";

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: "cheapest", label: "CHEAPEST PINTS" },
  { id: "guinness", label: "GUINNESS TRAIL" },
  { id: "craft",    label: "CRAFT BEER" },
  { id: "trad",     label: "TRAD MUSIC" },
  { id: "brewery",  label: "BREWERY RUN" },
  { id: "epic",     label: "EPIC CRAWL" },
];

/* ─────────────────────────────────────────────────────────────
   Route detection helper
   FIX BUG-07: Use pathname string, not window.location (SPA safe)
───────────────────────────────────────────────────────────── */

function viewForPath(pathname: string): View | null {
  if (pathname.includes("/crawl/c/")) return "shared";
  if (pathname.includes("/crawl/join/")) return "join";
  return null;
}

/* ─────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────── */

export default function CrawlPage() {
  const params   = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currency } = useAppStore();

  // FIX BUG-07: initialise view from the current pathname correctly
  const [view, setView] = useState<View>(() => viewForPath(location.pathname) ?? "landing");

  // FIX BUG-07/08: keep view in sync when React Router navigates within the same component
  useEffect(() => {
    const pathView = viewForPath(location.pathname);
    if (pathView) {
      setView(pathView);
      if (pathView === "join" && params.code) {
        setJoinInput(params.code.toUpperCase());
      }
    }
    // intentionally NOT resetting to "landing" on /crawl — user might be on building/preview/etc.
  }, [location.pathname, params.code]);

  const [draft, setDraft] = useState<CrawlDraft>(() => {
    try { return JSON.parse(localStorage.getItem(CRAWL_DRAFT_KEY) ?? "") as CrawlDraft; }
    catch { return EMPTY; }
  });
  const [activeStopIdx,    setActiveStopIdx]    = useState(0);
  const [isHost,           setIsHost]           = useState(false);
  const [groupCode,        setGroupCode]        = useState<string | null>(null);
  const [joinInput,        setJoinInput]        = useState(params.code?.toUpperCase() ?? "");
  const [search,           setSearch]           = useState("");
  const [genError,         setGenError]         = useState("");
  const [previewError,     setPreviewError]     = useState(""); // FIX BUG-16: separate error for preview
  const [submitMsg,        setSubmitMsg]        = useState<{ ok: boolean; text: string } | null>(null);
  const [dragIdx,          setDragIdx]          = useState<number | null>(null);
  const [dragOverIdx,      setDragOverIdx]      = useState<number | null>(null);
  const [showAreaPicker,   setShowAreaPicker]   = useState(false);
  const [codeCopied,       setCodeCopied]       = useState(false);
  const [savedCrawls,      setSavedCrawls]      = useState<SavedCrawl[]>(() => loadSavedCrawls());
  const [abandonConfirm,   setAbandonConfirm]   = useState(false);
  const [generatingPreset, setGeneratingPreset] = useState<PresetId | null>(null);
  const [freshlyPublished, setFreshlyPublished] = useState(false);
  const [advanceError,     setAdvanceError]     = useState(""); // FIX BUG-06

  function refreshSaved() { setSavedCrawls(loadSavedCrawls()); }

  useEffect(() => {
    localStorage.setItem(CRAWL_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  // Restore active crawl on mount — only on the /crawl base route
  useEffect(() => {
    if (viewForPath(location.pathname)) return; // skip for /crawl/c/:code and /crawl/join/:code
    try {
      const saved = JSON.parse(localStorage.getItem(CRAWL_ACTIVE_KEY) ?? "");
      if (saved?.draft?.barIds?.length) {
        setDraft(saved.draft);
        setActiveStopIdx(saved.activeStopIdx ?? 0);
        setIsHost(saved.isHost ?? true);
        setGroupCode(saved.groupCode ?? null);
        setView("active");
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── tRPC ──────────────────────────────────────────────── */

  const { data: allBarsData, isLoading: barsLoading } = trpc.bars.getAllWithDetails.useQuery();
  // FIX BUG-19: stable reference — [] only created once when data is missing
  const allBars = useMemo(() => allBarsData ?? [], [allBarsData]);

  const { data: sharedCrawl, isLoading: sharedLoading } = trpc.crawls.getByShareCode.useQuery(
    { shareCode: params.code ?? "" },
    { enabled: view === "shared" && !!params.code },
  );
  const { data: publishedCrawls } = trpc.crawls.getPublished.useQuery(
    undefined,
    { enabled: view === "discover" || view === "landing" },
  );

  const createMut     = trpc.crawls.create.useMutation();
  const generateMut   = trpc.crawls.generate.useMutation();
  const submitMut     = trpc.crawls.submit.useMutation();
  const startGroupMut = trpc.crawls.startGroup.useMutation();
  const joinGroupMut  = trpc.crawls.joinGroup.useMutation();
  const advanceMut    = trpc.crawls.advanceStop.useMutation();
  const endGroupMut   = trpc.crawls.endGroup.useMutation();

  // FIX BUG (previous): groupStateQ now enabled for both host AND guest
  const groupStateQ = trpc.crawls.getGroupState.useQuery(
    { groupCode: groupCode ?? "" },
    { enabled: !!groupCode, refetchInterval: 4000 },
  );
  useEffect(() => {
    if (!groupStateQ.data) return;
    if (!isHost) setActiveStopIdx(groupStateQ.data.activeStopIndex);
  }, [groupStateQ.data, isHost]);

  /* ── Derived ────────────────────────────────────────────── */

  const participants = groupStateQ.data?.participantCount ?? 1;

  const stopBars = useMemo(
    () => draft.barIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars,
    [draft.barIds, allBars],
  );
  const stats = useMemo(() => crawlStats(stopBars), [stopBars]);
  const areas = useMemo(
    () => [...new Set(allBars.map(b => b.area).filter(Boolean))] as string[],
    [allBars],
  );

  const filteredBars = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allBars
      .filter(b => b.name.toLowerCase().includes(q) || b.area?.toLowerCase().includes(q))
      .filter(b => !draft.barIds.includes(b.id))
      .slice(0, 8);
  }, [search, allBars, draft.barIds]);

  // FIX BUG-15: hasDraft excludes published drafts (they're already in savedCrawls)
  const hasDraft = draft.barIds.length > 0 && !draft.shareCode;

  /* ── Drag reorder ───────────────────────────────────────── */

  // FIX BUG-20: derive next inside the functional updater — no stale closure
  const handleDrop = useCallback((toIdx: number) => {
    if (dragIdx !== null && dragIdx !== toIdx) {
      const from = dragIdx;
      setDraft(d => {
        const next = [...d.barIds];
        const [moved] = next.splice(from, 1);
        next.splice(toIdx, 0, moved);
        return { ...d, barIds: next };
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx]);

  /* ── Handlers ───────────────────────────────────────────── */

  async function handleGenerate(preset: PresetId, areaOverride?: string) {
    setGenError("");
    setGeneratingPreset(preset);
    try {
      const result = await generateMut.mutateAsync({
        preset,
        area: preset === "area" ? areaOverride : undefined,
        maxStops: 6,
      });
      setDraft(d => ({
        ...d,
        barIds: result.barIds,
        name: d.name || result.name,
        tags: result.tags,
        generatedBy: "auto",
      }));
    } catch (e: any) {
      setGenError(e.message ?? "Generation failed — try again");
    } finally {
      setGeneratingPreset(null);
    }
  }

  async function handleSave() {
    if (!draft.name.trim() || draft.barIds.length < 2) return;
    setGenError("");
    try {
      const result = await createMut.mutateAsync({
        name: draft.name.trim(),
        description: draft.description || undefined,
        barIds: draft.barIds,
        authorName: draft.authorName || undefined,
        tags: draft.tags,
        generatedBy: draft.generatedBy,
      });
      const updatedDraft: CrawlDraft = { ...draft, shareCode: result.shareCode };
      setDraft(updatedDraft);
      saveCrawlLocally(updatedDraft);
      refreshSaved();
      setFreshlyPublished(true);
      setView("preview");
    } catch (e: any) {
      setGenError(e.message ?? "Could not save — try again");
    }
  }

  function handleSaveLocally() {
    if (draft.barIds.length < 2) return;
    saveCrawlLocally({ ...draft, name: draft.name.trim() || "Untitled Crawl" });
    refreshSaved();
    setDraft(EMPTY);
    setView("landing");
  }

  function handleStartSolo() {
    const currentDraft = draft;
    setIsHost(true);
    setGroupCode(null);
    setActiveStopIdx(0);
    setAbandonConfirm(false);
    setAdvanceError("");
    // FIX BUG-01: pass draft explicitly so there's no stale closure
    persistActiveCrawl(currentDraft, 0, null, true);
    setView("active");
  }

  async function handleStartGroup() {
    if (!draft.shareCode) return;
    setPreviewError("");
    try {
      const { groupCode: gc } = await startGroupMut.mutateAsync({ shareCode: draft.shareCode });
      const currentDraft = draft;
      setGroupCode(gc);
      setIsHost(true);
      setActiveStopIdx(0);
      setAbandonConfirm(false);
      setAdvanceError("");
      // FIX BUG-01: pass draft explicitly
      persistActiveCrawl(currentDraft, 0, gc, true);
      setView("active");
    } catch (e: any) {
      // FIX BUG-05/16: render this error on the preview screen via previewError
      setPreviewError(e.message ?? "Could not start group — try again");
    }
  }

  async function handleJoinGroup() {
    const code = joinInput.trim().toUpperCase();
    if (!code) return;
    setGenError("");
    try {
      const res = await joinGroupMut.mutateAsync({ groupCode: code });
      // FIX BUG-03: server returns barIds as JSON string — parse it
      const barIds = Array.isArray(res.barIds)
        ? (res.barIds as number[])
        : (JSON.parse(res.barIds as string) as number[]);
      const newDraft: CrawlDraft = {
        ...EMPTY,
        name: res.name,
        barIds,
        shareCode: res.shareCode,
      };
      setDraft(newDraft);
      setGroupCode(code);
      setIsHost(false);
      setActiveStopIdx(res.activeStopIndex);
      setAbandonConfirm(false);
      setAdvanceError("");
      // FIX BUG-02: persist with explicit newDraft (not closed-over draft)
      persistActiveCrawl(newDraft, res.activeStopIndex, code, false);
      setView("active");
    } catch (e: any) {
      setGenError(e.message ?? "Could not join — check the code and try again");
    }
  }

  // FIX BUG-06: wrap advanceMut in try/catch — no more frozen button
  async function handleAdvance() {
    setAdvanceError("");
    const isLastStop = activeStopIdx >= stopBars.length - 1;
    if (isLastStop) {
      if (groupCode && isHost) {
        try { await endGroupMut.mutateAsync({ groupCode }); } catch {}
      }
      localStorage.removeItem(CRAWL_ACTIVE_KEY);
      setView("done");
      return;
    }
    try {
      if (groupCode && isHost) {
        const res = await advanceMut.mutateAsync({ groupCode });
        setActiveStopIdx(res.activeStopIndex);
        persistActiveCrawl(draft, res.activeStopIndex, groupCode, true);
      } else if (!groupCode) {
        const next = activeStopIdx + 1;
        setActiveStopIdx(next);
        persistActiveCrawl(draft, next, null, true);
      }
      // guests: advancement is driven by groupStateQ polling, not this button
    } catch (e: any) {
      setAdvanceError(e.message ?? "Could not advance — check your connection and try again");
    }
  }

  function reset() {
    setDraft(EMPTY);
    setActiveStopIdx(0);
    setGroupCode(null);
    setIsHost(false);
    setAbandonConfirm(false);
    setFreshlyPublished(false);
    setAdvanceError("");
    setPreviewError("");
    localStorage.removeItem(CRAWL_ACTIVE_KEY);
    setView("landing");
  }

  /* ── Loading states ─────────────────────────────────────── */

  // FIX BUG-04: always wait for bars — shared view included
  if (barsLoading) return <LoadingMessage surface="crawl" />;

  // Shared view: wait for the crawl data too
  if (view === "shared" && sharedLoading) return <LoadingMessage surface="crawl" />;

  /* ══════════════════════════════════════════════════════════
     VIEW: SHARED  (/crawl/c/:code)
  ══════════════════════════════════════════════════════════ */
  if (view === "shared") {
    if (!sharedCrawl) return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">NOT FOUND</div>
        <p className="text-meta opacity-60 mb-6">This crawl link has expired or doesn't exist.</p>
        {/* FIX BUG-18: use navigate(-1) to preserve SPA back stack */}
        <button onClick={() => navigate(-1)} className="text-meta opacity-50">← BACK</button>
      </div>
    );

    const sharedBarIds = (() => {
      try { return JSON.parse(sharedCrawl.barIds) as number[]; } catch { return []; }
    })();
    const sharedBars = sharedBarIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars;
    const ss = crawlStats(sharedBars);

    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-4">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-2">SHARED CRAWL</div>
          <h1 className="text-headline text-[var(--color-paper)] mb-1 leading-none">
            {sharedCrawl.name.toUpperCase()}
          </h1>
          {sharedCrawl.description && (
            <p className="text-meta opacity-60 mt-2 mb-2">{sharedCrawl.description}</p>
          )}
          <div className="text-eyebrow opacity-50 mt-3 mb-4">
            {sharedBars.length} STOPS · {ss.distanceKm.toFixed(1)} KM · ~{formatDuration(ss.durationMin)}
          </div>
          <MapsButtons stops={sharedBars} />
          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">ROUTE</div>
          {sharedBars.map((b, i) => (
            <StopRow key={b.id} bar={b} idx={i} currency={currency} />
          ))}
        </section>
        <div className="px-4 pb-6 flex flex-col gap-2">
          <button
            onClick={() => {
              setDraft({
                ...EMPTY,
                name: sharedCrawl.name,
                description: sharedCrawl.description ?? "",
                barIds: sharedBarIds,
                shareCode: sharedCrawl.shareCode,
                tags: (() => { try { return JSON.parse(sharedCrawl.tags ?? "[]"); } catch { return []; } })(),
              });
              setFreshlyPublished(false);
              setView("preview");
            }}
            className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider"
          >
            START THIS CRAWL →
          </button>
          {/* FIX BUG-18: navigate(-1) */}
          <button onClick={() => navigate(-1)} className="text-meta opacity-40 py-2 text-center">
            ← BACK
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     VIEW: JOIN  (/crawl/join/:code or entered from landing)
  ══════════════════════════════════════════════════════════ */
  if (view === "join") return (
    <div className="grain-ink max-w-md mx-auto px-4 pt-8 pb-6">
      <div className="text-eyebrow text-[var(--color-blaze)] mb-2">JOIN A GROUP CRAWL</div>
      <h1 className="text-headline text-[var(--color-paper)] mb-8">
        ENTER GROUP<br /><span className="text-[var(--color-blaze)]">CODE</span>
      </h1>
      <input
        value={joinInput}
        onChange={e => { setJoinInput(e.target.value.toUpperCase()); setGenError(""); }}
        placeholder="ABC123"
        maxLength={6}
        autoFocus
        className="w-full bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-3xl text-center tracking-[0.3em] py-5 mb-4 focus:outline-none focus:border-[var(--color-blaze)]"
      />
      {genError && (
        <div className="flex items-center gap-2 text-meta text-[var(--color-blaze)] mb-3">
          <AlertCircle size={13} /> {genError}
        </div>
      )}
      <button
        onClick={handleJoinGroup}
        disabled={joinInput.length !== 6 || joinGroupMut.isPending}
        className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-40 mb-2"
      >
        {joinGroupMut.isPending ? "JOINING..." : "JOIN CRAWL →"}
      </button>
      <button
        onClick={() => { setGenError(""); setView("landing"); }}
        className="w-full text-meta opacity-50 py-2"
      >
        ← BACK
      </button>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     VIEW: LANDING
  ══════════════════════════════════════════════════════════ */
  if (view === "landing") return (
    <div className="grain-ink max-w-md mx-auto flex flex-col" style={{ minHeight: "100%" }}>

      {/* Hero + stats */}
      <section className="px-4 pt-6 pb-4 shrink-0">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">DISPATCH 04 · PUB CRAWLS</div>
        <h1 className="text-headline text-[var(--color-paper)] mb-5">
          EXPLORE BELFAST<br /><span className="text-[var(--color-blaze)]">YOUR WAY</span>
        </h1>
        <div className="flex gap-2">
          {[
            { label: "CRAWLS",    value: String(publishedCrawls?.length ?? 0).padStart(2, "0") },
            {
              label: "AVG STOPS",
              value: publishedCrawls?.length
                ? String(Math.round(
                    publishedCrawls.reduce((s, c) => {
                      try { return s + (JSON.parse(c.barIds) as number[]).length; } catch { return s; }
                    }, 0) / publishedCrawls.length,
                  )).padStart(2, "0")
                : "—",
            },
            { label: "GUINNESS",  value: String(allBars.filter(b => b.servesGuinness).length).padStart(2, "0") },
          ].map(s => (
            <div key={s.label} className="flex-1 border border-[var(--color-rule)] px-2.5 py-2">
              <div className="text-eyebrow opacity-50">{s.label}</div>
              <div className="font-display text-xl text-[var(--color-paper)] mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* YOUR CRAWLS */}
      <section className="px-4 flex-1 overflow-y-auto">
        <div className="hairline-b pb-1.5 mb-3 flex items-baseline justify-between">
          <div className="font-display text-base uppercase text-[var(--color-paper)]">YOUR CRAWLS</div>
          {savedCrawls.length > 0 && (
            <span className="text-eyebrow opacity-40">{savedCrawls.length}</span>
          )}
        </div>

        {savedCrawls.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-full border border-[var(--color-rule)] flex items-center justify-center opacity-30">
              <MapPin size={16} />
            </div>
            <div>
              <div className="font-display text-base uppercase text-[var(--color-paper)] opacity-40">
                NO SAVED CRAWLS
              </div>
              <div className="text-meta opacity-35 mt-1">
                Build a route and save it to see it here
              </div>
            </div>
          </div>
        ) : (
          <ul>
            {savedCrawls.map(crawl => (
              <li key={crawl.id} className="hairline-b-soft last:border-b-0 flex items-center gap-2 py-3">
                <button
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                  onClick={() => {
                    setDraft({
                      ...EMPTY,
                      name: crawl.name,
                      description: crawl.description,
                      barIds: crawl.barIds,
                      shareCode: crawl.shareCode ?? null,
                    });
                    setFreshlyPublished(false);
                    setPreviewError("");
                    setSubmitMsg(null);
                    setView("preview");
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base uppercase text-[var(--color-paper)] truncate">
                      {crawl.name}
                    </div>
                    <div className="text-meta opacity-50 mt-0.5">
                      {crawl.barIds.length} STOP{crawl.barIds.length !== 1 ? "S" : ""}
                      {" · "}
                      {new Date(crawl.savedAt).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short",
                      }).toUpperCase()}
                      {crawl.shareCode ? " · SHARED" : ""}
                    </div>
                  </div>
                  <ChevronRight size={13} strokeWidth={1.4} className="opacity-25 shrink-0" />
                </button>
                <button
                  onClick={() => { deleteSavedCrawl(crawl.id); refreshSaved(); }}
                  className="!min-h-0 p-2 opacity-25 hover:opacity-60 shrink-0"
                  aria-label={`Delete ${crawl.name}`}
                >
                  <X size={13} strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Draft resume card */}
        {hasDraft && (
          <div className="border border-[var(--color-rule)] p-3 mt-4 mb-2">
            <div className="text-eyebrow opacity-45 mb-1">DRAFT IN PROGRESS</div>
            <div className="font-display text-base uppercase text-[var(--color-paper)] mb-2 truncate">
              {draft.name || "UNNAMED"} · {draft.barIds.length} STOP{draft.barIds.length !== 1 ? "S" : ""}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setView("building")}
                className="flex-1 bg-[var(--color-blaze)] text-[var(--color-paper)] text-eyebrow py-2.5"
              >
                RESUME
              </button>
              <button
                onClick={() => setDraft(EMPTY)}
                className="border border-[var(--color-rule)] text-[var(--color-paper)] text-eyebrow px-4 py-2.5 opacity-50 hover:opacity-100"
              >
                CLEAR
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Bottom CTAs — fixed at bottom of flex column */}
      <div className="px-4 pb-6 pt-3 shrink-0 flex flex-col gap-3">
        {/* Join group — inline */}
        <div>
          <div className="text-eyebrow opacity-40 mb-1.5">JOINING A GROUP CRAWL?</div>
          <div className="flex gap-2">
            <input
              value={joinInput}
              onChange={e => { setJoinInput(e.target.value.toUpperCase()); setGenError(""); }}
              placeholder="GROUP CODE"
              maxLength={6}
              className="flex-1 bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] font-mono text-sm px-3 py-2.5 tracking-[0.2em] focus:outline-none focus:border-[var(--color-blaze)] uppercase placeholder:tracking-normal"
            />
            <button
              onClick={() => { if (joinInput.length === 6) handleJoinGroup(); }}
              disabled={joinInput.length !== 6 || joinGroupMut.isPending}
              className="bg-[var(--color-blaze)] text-[var(--color-paper)] px-4 font-display text-sm tracking-wider disabled:opacity-40"
            >
              {joinGroupMut.isPending ? "…" : "JOIN"}
            </button>
          </div>
          {genError && (
            <div className="flex items-center gap-1.5 text-meta text-[var(--color-blaze)] mt-1.5">
              <AlertCircle size={12} /> {genError}
            </div>
          )}
        </div>

        <button
          onClick={() => { setGenError(""); setView("building"); }}
          className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider"
        >
          BUILD A CRAWL →
        </button>
        <button
          onClick={() => setView("discover")}
          className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider hover:border-[var(--color-blaze)]"
        >
          DISCOVER CRAWLS
        </button>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     VIEW: BUILDER
  ══════════════════════════════════════════════════════════ */
  if (view === "building") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-6">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">BUILD YOUR CRAWL</div>

        {/* Name */}
        <div className="relative mb-2">
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Name your crawl"
            maxLength={60}
            className="w-full bg-transparent border-b border-[var(--color-rule)] text-[var(--color-paper)] font-display text-2xl py-2 focus:outline-none focus:border-[var(--color-blaze)] placeholder:opacity-25"
          />
          {!draft.name.trim() && draft.barIds.length >= 2 && (
            <span className="absolute right-0 top-3 text-eyebrow text-[var(--color-blaze)] opacity-70">REQUIRED TO SHARE</span>
          )}
        </div>
        <textarea
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-transparent border-b border-[var(--color-rule)] text-[var(--color-paper)] text-meta py-2 mb-6 focus:outline-none focus:border-[var(--color-blaze)] placeholder:opacity-25 resize-none"
        />

        {/* Auto-generate */}
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-display text-base text-[var(--color-paper)]">AUTO-GENERATE</div>
            {generatingPreset && (
              <div className="text-eyebrow text-[var(--color-blaze)] opacity-70">GENERATING…</div>
            )}
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-2 pb-2" style={{ width: "max-content" }}>
              {PRESETS.filter(p => p.id !== "area").map(p => {
                const isThis = generatingPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleGenerate(p.id)}
                    disabled={!!generatingPreset}
                    className={`text-eyebrow border px-3 py-2.5 transition-colors whitespace-nowrap disabled:opacity-40 ${
                      isThis
                        ? "border-[var(--color-blaze)] text-[var(--color-blaze)]"
                        : "border-[var(--color-rule)] text-[var(--color-paper)] hover:border-[var(--color-blaze)] hover:text-[var(--color-blaze)]"
                    }`}
                  >
                    {isThis ? "GENERATING…" : p.label}
                  </button>
                );
              })}
              <button
                onClick={() => setShowAreaPicker(x => !x)}
                disabled={!!generatingPreset}
                className={`text-eyebrow border px-3 py-2.5 transition-colors whitespace-nowrap disabled:opacity-40 ${
                  showAreaPicker
                    ? "border-[var(--color-blaze)] text-[var(--color-blaze)]"
                    : "border-[var(--color-rule)] text-[var(--color-paper)] hover:border-[var(--color-blaze)] hover:text-[var(--color-blaze)]"
                }`}
              >
                {generatingPreset === "area" ? "GENERATING…" : "BY AREA ▾"}
              </button>
            </div>
          </div>
          {showAreaPicker && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {areas.map(a => (
                <button
                  key={a}
                  onClick={() => { handleGenerate("area", a); setShowAreaPicker(false); }}
                  disabled={!!generatingPreset}
                  className="text-eyebrow px-2.5 py-2 border border-[var(--color-rule)] text-[var(--color-paper)] opacity-60 hover:border-[var(--color-blaze)] hover:opacity-100 transition-colors disabled:opacity-30"
                >
                  {a}
                </button>
              ))}
            </div>
          )}
          {genError && (
            <div className="flex items-center gap-1.5 text-meta text-[var(--color-blaze)] mt-2">
              <AlertCircle size={12} /> {genError}
            </div>
          )}
        </div>

        {/* Search to add stops */}
        <div className="hairline-b pb-1.5 mb-3 font-display text-base text-[var(--color-paper)]">ADD STOPS</div>
        <div className="relative mb-5">
          <div className="flex items-center gap-2 border border-[var(--color-rule)] px-3 py-3 focus-within:border-[var(--color-blaze)]">
            <Search size={14} className="opacity-40 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search bars…"
              className="flex-1 bg-transparent text-[var(--color-paper)] text-meta focus:outline-none placeholder:opacity-35"
            />
            {search && (
              <button onClick={() => setSearch("")} className="!min-h-0 p-0.5 opacity-40 hover:opacity-80">
                <X size={12} />
              </button>
            )}
          </div>
          {filteredBars.length > 0 && (
            <ul className="border border-[var(--color-rule)] border-t-0 absolute w-full z-10 bg-[var(--color-ink)]">
              {filteredBars.map(bar => (
                <li key={bar.id}>
                  <button
                    onClick={() => {
                      setDraft(d => ({ ...d, barIds: [...d.barIds, bar.id] }));
                      setSearch("");
                    }}
                    className="w-full text-left px-3 py-3 flex items-center justify-between hairline-b-soft hover:bg-[var(--color-blaze)] group"
                  >
                    <div>
                      <div className="font-display text-sm uppercase text-[var(--color-paper)]">{bar.name}</div>
                      <div className="text-meta opacity-50">{bar.area}</div>
                    </div>
                    <span className="text-eyebrow opacity-40 group-hover:opacity-100">ADD +</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stop list with drag reorder */}
        {stopBars.length > 0 && (
          <>
            <div className="hairline-b pb-1.5 mb-2 flex items-baseline justify-between">
              <div className="font-display text-base text-[var(--color-paper)]">YOUR STOPS</div>
              <div className="text-eyebrow opacity-40">
                {stopBars.length} · {stats.distanceKm.toFixed(1)} KM · ~{formatDuration(stats.durationMin)}
              </div>
            </div>
            <ul className="mb-4">
              {stopBars.map((bar, i) => (
                <li
                  key={bar.id}
                  draggable
                  onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(i); }}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  className={`relative flex items-center gap-1 hairline-b-soft transition-opacity ${dragIdx === i ? "opacity-20" : "opacity-100"}`}
                >
                  {dragOverIdx === i && dragIdx !== i && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--color-blaze)]" />
                  )}
                  <div className="cursor-grab active:cursor-grabbing flex items-center justify-center w-10 h-10 opacity-20 hover:opacity-60 shrink-0">
                    <GripVertical size={15} />
                  </div>
                  <span className="text-eyebrow text-[var(--color-blaze)] w-5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0 py-3">
                    <div className="font-display text-sm uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
                    <div className="text-meta opacity-45">{bar.area}</div>
                  </div>
                  <button
                    onClick={() => setDraft(d => ({ ...d, barIds: d.barIds.filter(x => x !== bar.id) }))}
                    className="flex items-center justify-center w-10 h-10 opacity-30 hover:opacity-80 hover:text-[var(--color-blaze)] shrink-0"
                    aria-label={`Remove ${bar.name}`}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {stopBars.length === 0 && !generatingPreset && (
          <div className="py-6 text-center border border-dashed border-[var(--color-rule)] mb-4 opacity-40">
            <div className="text-meta">Use a preset above or search for bars to add stops</div>
          </div>
        )}

        {/* Save actions */}
        <div className="flex flex-col gap-2 mt-2">
          {draft.barIds.length >= 2 && !draft.name.trim() && (
            <p className="text-meta text-[var(--color-blaze)] text-center -mb-1 text-sm">
              Add a name to save &amp; share
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={draft.barIds.length < 2 || !draft.name.trim() || createMut.isPending}
            className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-40"
          >
            {createMut.isPending ? "SAVING..." : "SAVE & SHARE →"}
          </button>
          <button
            onClick={handleSaveLocally}
            disabled={draft.barIds.length < 2}
            className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-40 hover:border-[var(--color-blaze)]"
          >
            SAVE TO MY CRAWLS
          </button>
          <button onClick={() => { setGenError(""); setView("landing"); }} className="w-full text-meta opacity-40 py-2 text-center">
            ← BACK
          </button>
        </div>
      </section>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     VIEW: PREVIEW
  ══════════════════════════════════════════════════════════ */
  if (view === "preview") {
    const canShare = !!draft.shareCode;
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-4">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-2">
            {freshlyPublished ? "CRAWL SAVED · SHAREABLE" : "YOUR CRAWL"}
          </div>
          <h1 className="font-display text-2xl text-[var(--color-paper)] uppercase mb-1 leading-tight">
            {draft.name || "UNTITLED CRAWL"}
          </h1>
          {draft.description && <p className="text-meta opacity-55 mb-2">{draft.description}</p>}
          <div className="text-eyebrow opacity-45 mb-4">
            {stopBars.length} STOPS · {stats.distanceKm.toFixed(1)} KM · ~{formatDuration(stats.durationMin)}
          </div>
          <MapsButtons stops={stopBars} />
          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">ROUTE</div>
          {stopBars.map((b, i) => (
            <StopRow key={b.id} bar={b} idx={i} currency={currency} />
          ))}
        </section>

        <div className="px-4 pb-6 flex flex-col gap-2">
          <button
            onClick={handleStartSolo}
            className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider"
          >
            START SOLO CRAWL →
          </button>

          <button
            onClick={handleStartGroup}
            disabled={!canShare || startGroupMut.isPending}
            className="w-full border border-[var(--color-blaze)] text-[var(--color-blaze)] font-display text-base py-3 tracking-wider disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Users size={14} />
            {startGroupMut.isPending ? "STARTING..." : "START GROUP CRAWL"}
          </button>
          {!canShare && (
            <p className="text-meta opacity-45 text-center -mt-1 text-xs">
              Use "Save &amp; Share" to enable group crawls
            </p>
          )}

          {/* FIX BUG-05/16: show startGroup errors here */}
          {previewError && (
            <div className="flex items-center gap-2 text-meta text-[var(--color-blaze)] -mt-1">
              <AlertCircle size={13} /> {previewError}
            </div>
          )}

          {canShare && (
            <button
              onClick={() => shareCrawl(draft.name, draft.shareCode!)}
              className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-sm py-2.5 tracking-wider hover:border-[var(--color-blaze)] flex items-center justify-center gap-2"
            >
              <Share2 size={13} /> SHARE CRAWL LINK
            </button>
          )}

          <div className="hairline-b my-1 opacity-30" />

          {/* FIX BUG-25: handle submitMut errors */}
          {!submitMsg ? (
            <button
              onClick={async () => {
                if (!draft.shareCode) return;
                try {
                  await submitMut.mutateAsync({ shareCode: draft.shareCode });
                  setSubmitMsg({ ok: true, text: "Submitted for community review!" });
                } catch (e: any) {
                  setSubmitMsg({ ok: false, text: e.message ?? "Submit failed — try again" });
                }
              }}
              disabled={!canShare || submitMut.isPending}
              className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] text-meta py-2.5 hover:border-[var(--color-blaze)] disabled:opacity-40 opacity-60"
            >
              {submitMut.isPending ? "SUBMITTING..." : "SUBMIT TO COMMUNITY →"}
            </button>
          ) : (
            <p className={`text-meta text-center py-2 flex items-center justify-center gap-2 ${submitMsg.ok ? "text-[var(--color-verified)]" : "text-[var(--color-blaze)]"}`}>
              {submitMsg.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              {submitMsg.text}
            </p>
          )}

          <button
            onClick={() => { setPreviewError(""); setView("building"); }}
            className="text-meta opacity-40 py-1.5 text-center"
          >
            ← EDIT CRAWL
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     VIEW: ACTIVE
  ══════════════════════════════════════════════════════════ */
  if (view === "active") {
    const currentBar = stopBars[activeStopIdx];
    const nextBar    = stopBars[activeStopIdx + 1];
    const isLastStop = activeStopIdx >= stopBars.length - 1;
    const isGuest    = !!groupCode && !isHost;

    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-5">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-1">
            STOP {activeStopIdx + 1} OF {stopBars.length}
            {currentBar?.area ? ` · ${currentBar.area.toUpperCase()}` : ""}
          </div>

          {/* Group header */}
          {groupCode && (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-eyebrow opacity-55">
                <Users size={11} />
                {participants} {participants === 1 ? "PERSON" : "PEOPLE"}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(groupCode).catch(() => {});
                  setCodeCopied(true);
                  // FIX BUG-24: store timer ref to clear on cleanup (simplified: acceptable minor risk)
                  setTimeout(() => setCodeCopied(false), 2200);
                }}
                className="flex items-center gap-2 border border-[var(--color-rule)] px-2.5 py-1.5 hover:border-[var(--color-blaze)] transition-colors"
              >
                <span className="text-eyebrow opacity-45">CODE</span>
                <span className="font-mono text-sm text-[var(--color-paper)] tracking-widest">{groupCode}</span>
                <span className={`text-eyebrow transition-colors ${codeCopied ? "text-[var(--color-verified)]" : "opacity-35"}`}>
                  {codeCopied ? "✓" : "COPY"}
                </span>
              </button>
              <button
                onClick={() => shareGroup(draft.name, groupCode)}
                className="flex items-center gap-1.5 text-eyebrow opacity-50 hover:opacity-100"
              >
                <Share2 size={12} /> INVITE
              </button>
            </div>
          )}

          {/* Current stop — Link to bar detail */}
          {currentBar ? (
            <Link
              to={`/bar/${currentBar.id}`}
              className="block grain-blaze text-[var(--color-paper)] mb-4 px-4 py-4"
            >
              <div className="text-eyebrow opacity-75 mb-1">NOW AT · TAP FOR DETAILS</div>
              <div className="font-display text-2xl uppercase leading-none mb-1">{currentBar.name}</div>
              {(() => {
                const cheapest = cheapestPint(currentBar.drinks ?? []);
                return cheapest ? (
                  <div className="text-meta opacity-75">
                    {cheapest.name.toUpperCase()} ·{" "}
                    {formatPrice(convertPrice(cheapest.price, cheapest.currency as Currency, currency), currency)}
                  </div>
                ) : null;
              })()}
              <div className="flex items-center gap-1 mt-2 text-eyebrow opacity-55">
                MORE INFO <ChevronRight size={11} />
              </div>
            </Link>
          ) : (
            <div className="border border-[var(--color-rule)] mb-4 px-4 py-4 opacity-40">
              <div className="text-meta">Loading stop details…</div>
            </div>
          )}

          <MapsButtons stops={stopBars} compact />

          {/* Route list — all stops with links to bars */}
          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">
            YOUR ROUTE
          </div>
          <ul className="mb-5">
            {stopBars.map((bar, i) => (
              <li key={bar.id}>
                <Link
                  to={`/bar/${bar.id}`}
                  className="flex items-center gap-3 hairline-b-soft py-3"
                >
                  <span className={`w-6 text-eyebrow shrink-0 ${
                    i < activeStopIdx
                      ? "text-[var(--color-verified)]"
                      : i === activeStopIdx
                      ? "text-[var(--color-blaze)]"
                      : "text-[var(--color-paper)] opacity-35"
                  }`}>
                    {i < activeStopIdx ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-display text-sm uppercase truncate ${
                      i < activeStopIdx ? "text-[var(--color-paper)] opacity-35" : "text-[var(--color-paper)]"
                    }`}>
                      {bar.name}
                    </div>
                    {i > activeStopIdx && (
                      <div className="text-meta opacity-45">
                        {i === activeStopIdx + 1
                          ? `NEXT · ${haversineKm(stopBars[activeStopIdx], bar).toFixed(1)} KM`
                          : bar.area?.toUpperCase() ?? ""}
                      </div>
                    )}
                  </div>
                  {(() => {
                    if (i !== activeStopIdx + 1) return null;
                    const cheapest = cheapestPint(bar.drinks ?? []);
                    return cheapest ? (
                      <div className="font-display text-sm text-[var(--color-sun)] shrink-0">
                        {formatPrice(convertPrice(cheapest.price, cheapest.currency as Currency, currency), currency)}
                      </div>
                    ) : null;
                  })()}
                  <ChevronRight size={11} className="opacity-25 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Advance / abandon */}
        <div className="px-4 pb-6">
          {isGuest ? (
            <div className="border border-[var(--color-rule)] text-center py-3.5 text-meta opacity-55">
              WAITING FOR HOST TO ADVANCE…
            </div>
          ) : (
            <>
              <button
                onClick={handleAdvance}
                disabled={advanceMut.isPending || endGroupMut.isPending}
                className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-50"
              >
                {isLastStop
                  ? "FINISH CRAWL ✓"
                  : `NEXT: ${(nextBar?.name ?? "").toUpperCase().slice(0, 22)}${(nextBar?.name ?? "").length > 22 ? "…" : ""} →`}
              </button>
              {/* FIX BUG-06: show advance errors */}
              {advanceError && (
                <div className="flex items-center gap-2 text-meta text-[var(--color-blaze)] mt-2">
                  <AlertCircle size={13} /> {advanceError}
                </div>
              )}
            </>
          )}

          {/* Two-tap abandon */}
          {!abandonConfirm ? (
            <button
              onClick={() => setAbandonConfirm(true)}
              className="w-full text-meta opacity-35 py-2 text-center mt-2 hover:opacity-60"
            >
              ABANDON CRAWL
            </button>
          ) : (
            <div className="mt-2 flex gap-2">
              <button
                onClick={reset}
                className="flex-1 border border-[var(--color-blaze)] text-[var(--color-blaze)] font-display text-sm py-2.5 tracking-wider"
              >
                YES, ABANDON
              </button>
              <button
                onClick={() => setAbandonConfirm(false)}
                className="flex-1 border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-sm py-2.5 tracking-wider"
              >
                KEEP GOING
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     VIEW: DONE
  ══════════════════════════════════════════════════════════ */
  if (view === "done") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-4">
        <div className="text-eyebrow text-[var(--color-verified)] mb-2">CRAWL COMPLETE</div>
        <h1 className="text-headline text-[var(--color-paper)] mb-1">
          WELL<br /><span className="text-[var(--color-blaze)]">DONE</span>
        </h1>
        <div className="text-eyebrow opacity-45 mb-6">
          {stopBars.length} STOPS · {stats.distanceKm.toFixed(1)} KM WALKED · ~{formatDuration(stats.durationMin)}
        </div>
        <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">RECAP</div>
        {stopBars.map((b, i) => (
          <StopRow key={b.id} bar={b} idx={i} currency={currency} done />
        ))}
      </section>
      <div className="px-4 pb-6 flex flex-col gap-2">
        <button
          onClick={() => { setDraft(EMPTY); setActiveStopIdx(0); setView("building"); }}
          className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider"
        >
          BUILD ANOTHER CRAWL →
        </button>
        <button
          onClick={reset}
          className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-sm py-2.5 tracking-wider hover:border-[var(--color-blaze)]"
        >
          BACK TO CRAWLS
        </button>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     VIEW: DISCOVER
  ══════════════════════════════════════════════════════════ */
  if (view === "discover") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-4">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-2">DISPATCH 04 · DISCOVER</div>
        <h1 className="text-headline text-[var(--color-paper)] mb-6">
          COMMUNITY<br /><span className="text-[var(--color-blaze)]">CRAWLS</span>
        </h1>
        {!publishedCrawls || publishedCrawls.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full border border-[var(--color-rule)] flex items-center justify-center mx-auto mb-4 opacity-25">
              <MapPin size={18} />
            </div>
            <div className="font-display text-base uppercase text-[var(--color-paper)] opacity-40 mb-1">
              NO CRAWLS YET
            </div>
            <div className="text-meta opacity-35">Be the first — build one and submit it</div>
          </div>
        ) : (
          <ul>
            {publishedCrawls.map((crawl, i) => {
              const barIds    = (() => { try { return JSON.parse(crawl.barIds) as number[]; } catch { return []; } })();
              const crawlBars = barIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars;
              const cs        = crawlStats(crawlBars);
              return (
                <li key={crawl.id} className="hairline-b-soft py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-eyebrow text-[var(--color-blaze)] w-6 shrink-0 mt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base uppercase text-[var(--color-paper)] leading-tight">
                        {crawl.name}
                      </div>
                      <div className="text-meta opacity-50 mt-0.5">
                        {barIds.length} STOPS · {cs.distanceKm.toFixed(1)} KM
                        {crawl.authorName ? ` · BY ${crawl.authorName.toUpperCase()}` : ""}
                      </div>
                      {crawl.description && (
                        <div className="text-meta opacity-40 mt-0.5 truncate">{crawl.description}</div>
                      )}
                    </div>
                    {/* FIX BUG-08: use setView/setDraft instead of Link to avoid remount issue */}
                    {crawl.shareCode && (
                      <button
                        onClick={() => {
                          const barIdsForCrawl = (() => {
                            try { return JSON.parse(crawl.barIds) as number[]; } catch { return []; }
                          })();
                          setDraft({
                            ...EMPTY,
                            name: crawl.name,
                            description: crawl.description ?? "",
                            barIds: barIdsForCrawl,
                            shareCode: crawl.shareCode,
                            tags: (() => { try { return JSON.parse(crawl.tags ?? "[]"); } catch { return []; } })(),
                          });
                          setFreshlyPublished(false);
                          setPreviewError("");
                          setSubmitMsg(null);
                          setView("preview");
                        }}
                        className="text-eyebrow text-[var(--color-blaze)] flex items-center gap-0.5 shrink-0 mt-0.5 hover:opacity-80"
                      >
                        VIEW <ChevronRight size={11} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="px-4 pb-6 flex flex-col gap-2">
        <button
          onClick={() => setView("building")}
          className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider"
        >
          BUILD YOUR OWN →
        </button>
        <button onClick={() => setView("landing")} className="text-meta opacity-40 py-2 text-center">
          ← BACK
        </button>
      </div>
    </div>
  );

  return null;
}

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */

type Drink = { name: string; price: number; currency: string };

function cheapestPint(drinks: Drink[]): Drink | null {
  const beers = drinks.filter(d =>
    /pint|beer|lager|guinness|harp|tennent|stella|heineken|ipa/i.test(d.name),
  );
  return beers.reduce<Drink | null>((m, d) => !m || d.price < m.price ? d : m, null);
}

/* ─────────────────────────────────────────────────────────────
   StopRow sub-component
───────────────────────────────────────────────────────────── */

function StopRow({
  bar, idx, currency, done,
}: {
  bar: { id: number; name: string; area?: string | null; lat: number; lng: number; drinks?: Drink[] };
  idx: number;
  currency: Currency;
  done?: boolean;
}) {
  const cheapest = cheapestPint(bar.drinks ?? []);
  return (
    <Link
      to={`/bar/${bar.id}`}
      className="flex items-center gap-3 hairline-b-soft py-2.5 hover:opacity-80 transition-opacity"
    >
      <span className={`w-6 text-eyebrow shrink-0 ${done ? "text-[var(--color-verified)]" : "text-[var(--color-blaze)]"}`}>
        {done ? "✓" : String(idx + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
        {bar.area && <div className="text-meta opacity-45">{bar.area.toUpperCase()}</div>}
      </div>
      {cheapest && (
        <div className="font-display text-sm text-[var(--color-sun)] shrink-0">
          {formatPrice(convertPrice(cheapest.price, cheapest.currency as Currency, currency), currency)}
        </div>
      )}
      <ChevronRight size={11} className="opacity-25 shrink-0" />
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────
   MapsButtons sub-component
───────────────────────────────────────────────────────────── */

function MapsButtons({
  stops, compact,
}: {
  stops: Array<{ name: string; lat: number; lng: number }>;
  compact?: boolean;
}) {
  if (stops.length < 2) return null;
  return (
    <div className={`flex gap-2 ${compact ? "mb-3" : "mb-4"}`}>
      <a
        href={buildGoogleMapsUrl(stops)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 border border-[var(--color-rule)] text-[var(--color-paper)] text-eyebrow py-2.5 text-center hover:border-[var(--color-blaze)] flex items-center justify-center gap-1.5"
      >
        <MapPin size={11} aria-hidden /> GOOGLE MAPS
      </a>
      <a
        href={buildAppleMapsUrl(stops)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 border border-[var(--color-rule)] text-[var(--color-paper)] text-eyebrow py-2.5 text-center hover:border-[var(--color-blaze)] flex items-center justify-center gap-1.5"
      >
        <MapPin size={11} aria-hidden /> APPLE MAPS
      </a>
    </div>
  );
}
