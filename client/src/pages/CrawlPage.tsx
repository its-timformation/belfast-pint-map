import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronRight, X, Search, Users, Share2, MapPin, GripVertical, Check } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAppStore, formatPrice, convertPrice } from "../lib/store";
import { LoadingMessage } from "../components/LoadingMessage";

/* ── Types ─────────────────────────────────────────────────── */

type View = "landing" | "building" | "preview" | "active" | "done" | "discover" | "shared" | "join";
type Preset = "cheapest" | "guinness" | "craft" | "trad" | "area" | "brewery" | "epic";

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

/* ── Saved crawls (local-only) ──────────────────────────────── */

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
  // Deduplicate: if same name + same stops already saved, replace it
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

/* ── Utilities ─────────────────────────────────────────────── */

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
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

function buildGoogleMapsUrl(stops: Array<{ name: string; lat: number; lng: number }>) {
  if (stops.length < 2) return "";
  const encode = (s: string) => encodeURIComponent(`${s}, Belfast`);
  return `https://www.google.com/maps/dir/${stops.map(s => encode(s.name)).join("/")}`;
}

function buildAppleMapsUrl(stops: Array<{ name: string; lat: number; lng: number }>) {
  if (stops.length < 2) return "";
  const encode = (s: string) => encodeURIComponent(`${s} Belfast`);
  return `https://maps.apple.com/?saddr=${encode(stops[0].name)}&daddr=${encode(stops[stops.length - 1].name)}&dirflg=w`;
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

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "cheapest", label: "CHEAPEST PINTS" },
  { id: "guinness", label: "GUINNESS TRAIL" },
  { id: "craft",    label: "CRAFT BEER" },
  { id: "trad",     label: "TRAD MUSIC" },
  { id: "brewery",  label: "BREWERY RUN" },
  { id: "epic",     label: "EPIC CRAWL" },
];

/* ── Main component ─────────────────────────────────────────── */

export default function CrawlPage() {
  const params   = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { currency } = useAppStore();

  const isShared = window.location.pathname.includes("/crawl/c/");
  const isJoin   = window.location.pathname.includes("/crawl/join/");

  const [view, setView] = useState<View>(() =>
    isShared ? "shared" : isJoin ? "join" : "landing"
  );
  const [draft, setDraft] = useState<CrawlDraft>(() => {
    try { return JSON.parse(localStorage.getItem(CRAWL_DRAFT_KEY) ?? "") as CrawlDraft; }
    catch { return EMPTY; }
  });
  const [activeStopIdx, setActiveStopIdx] = useState(0);
  const [isHost,       setIsHost]         = useState(false);
  const [groupCode,    setGroupCode]      = useState<string | null>(null);
  const [joinInput,    setJoinInput]      = useState(params.code?.toUpperCase() ?? "");
  const [search,       setSearch]         = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [genError,     setGenError]       = useState("");
  const [submitMsg,    setSubmitMsg]      = useState("");
  const [dragIdx,      setDragIdx]        = useState<number | null>(null);
  const [dragOverIdx,  setDragOverIdx]    = useState<number | null>(null);
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [codeCopied,   setCodeCopied]     = useState(false);
  const [savedCrawls,  setSavedCrawls]    = useState<SavedCrawl[]>(() => loadSavedCrawls());
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  // Which preset is currently generating (for per-button loading state)
  const [generatingPreset, setGeneratingPreset] = useState<Preset | "area" | null>(null);
  // Track whether draft was freshly published (controls preview header)
  const [freshlyPublished, setFreshlyPublished] = useState(false);

  function refreshSaved() { setSavedCrawls(loadSavedCrawls()); }

  useEffect(() => {
    localStorage.setItem(CRAWL_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  // Restore active crawl on mount
  useEffect(() => {
    if (isShared || isJoin) return;
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

  /* ── tRPC ──────────────────────────────────────────────────── */

  const { data: allBarsData, isLoading: barsLoading } = trpc.bars.getAllWithDetails.useQuery();
  const allBars = allBarsData ?? [];

  const { data: sharedCrawl, isLoading: sharedLoading } = trpc.crawls.getByShareCode.useQuery(
    { shareCode: params.code ?? "" },
    { enabled: view === "shared" && !!params.code }
  );
  const { data: publishedCrawls } = trpc.crawls.getPublished.useQuery(
    undefined,
    { enabled: view === "discover" || view === "landing" }
  );

  const createMut     = trpc.crawls.create.useMutation();
  const generateMut   = trpc.crawls.generate.useMutation();
  const submitMut     = trpc.crawls.submit.useMutation();
  const startGroupMut = trpc.crawls.startGroup.useMutation();
  const joinGroupMut  = trpc.crawls.joinGroup.useMutation();
  const advanceMut    = trpc.crawls.advanceStop.useMutation();
  const endGroupMut   = trpc.crawls.endGroup.useMutation();

  // Group state — enabled for both host and guest once a groupCode exists
  const groupStateQ = trpc.crawls.getGroupState.useQuery(
    { groupCode: groupCode ?? "" },
    { enabled: !!groupCode, refetchInterval: 4000 }
  );
  useEffect(() => {
    if (!groupStateQ.data) return;
    if (!isHost) setActiveStopIdx(groupStateQ.data.activeStopIndex);
  }, [groupStateQ.data, isHost]);

  /* ── Derived ────────────────────────────────────────────────── */

  const currentStopIdx = activeStopIdx;
  const participants   = groupStateQ.data?.participantCount ?? 1;

  const stopBars = useMemo(
    () => draft.barIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars,
    [draft.barIds, allBars]
  );
  const stats  = useMemo(() => crawlStats(stopBars), [stopBars]);
  const areas  = useMemo(
    () => [...new Set(allBars.map(b => b.area).filter(Boolean))] as string[],
    [allBars]
  );

  const filteredBars = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allBars
      .filter(b => b.name.toLowerCase().includes(q) || b.area?.toLowerCase().includes(q))
      .filter(b => !draft.barIds.includes(b.id))
      .slice(0, 8);
  }, [search, allBars, draft.barIds]);

  /* ── Drag ────────────────────────────────────────────────── */

  function handleDrop(toIdx: number) {
    if (dragIdx !== null && dragIdx !== toIdx) {
      const next = [...draft.barIds];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(toIdx, 0, moved);
      setDraft(d => ({ ...d, barIds: next }));
    }
    setDragIdx(null); setDragOverIdx(null);
  }

  /* ── Handlers ────────────────────────────────────────────── */

  function toggleArea(a: string) {
    setSelectedAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }

  async function handleGenerate(preset: Preset, areaOverride?: string) {
    setGenError(""); setGeneratingPreset(preset === "area" ? "area" : preset);
    try {
      const result = await generateMut.mutateAsync({
        preset,
        area: preset === "area" ? (areaOverride ?? selectedAreas[0]) : undefined,
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
    try {
      const result = await createMut.mutateAsync({
        name: draft.name.trim(),
        description: draft.description || undefined,
        barIds: draft.barIds,
        authorName: draft.authorName || undefined,
        tags: draft.tags,
        generatedBy: draft.generatedBy,
      });
      const updatedDraft = { ...draft, shareCode: result.shareCode };
      setDraft(updatedDraft);
      saveCrawlLocally(updatedDraft);
      refreshSaved();
      setFreshlyPublished(true);
      setView("preview");
    } catch (e: any) {
      setGenError(e.message ?? "Could not save crawl — try again");
    }
  }

  function handleSaveLocally() {
    if (draft.barIds.length < 2) return;
    saveCrawlLocally({ ...draft, name: draft.name.trim() || "Untitled Crawl" });
    refreshSaved();
    setDraft(EMPTY); // clear draft — it's now in the saved list
    setView("landing");
  }

  function saveActive(idx: number, gc: string | null, host: boolean, isGroup: boolean) {
    localStorage.setItem(
      CRAWL_ACTIVE_KEY,
      JSON.stringify({ draft, activeStopIdx: idx, isHost: host, isGroup, groupCode: gc })
    );
  }

  function handleStartSolo() {
    setIsHost(true); setGroupCode(null); setActiveStopIdx(0);
    saveActive(0, null, true, false);
    setAbandonConfirm(false);
    setView("active");
  }

  async function handleStartGroup() {
    if (!draft.shareCode) return;
    try {
      const { groupCode: gc } = await startGroupMut.mutateAsync({ shareCode: draft.shareCode });
      setGroupCode(gc); setIsHost(true); setActiveStopIdx(0);
      saveActive(0, gc, true, true);
      setAbandonConfirm(false);
      setView("active");
    } catch (e: any) {
      setGenError(e.message ?? "Could not start group");
    }
  }

  async function handleJoinGroup() {
    const code = joinInput.trim().toUpperCase();
    if (!code) return;
    setGenError("");
    try {
      const res = await joinGroupMut.mutateAsync({ groupCode: code });
      const barIds = JSON.parse(res.barIds) as number[];
      setDraft(d => ({ ...d, name: res.name, barIds, shareCode: res.shareCode }));
      setGroupCode(code); setIsHost(false); setActiveStopIdx(res.activeStopIndex);
      setAbandonConfirm(false);
      setView("active");
    } catch (e: any) {
      setGenError(e.message ?? "Could not join — check the code and try again");
    }
  }

  async function handleAdvance() {
    if (currentStopIdx >= stopBars.length - 1) {
      if (groupCode && isHost) {
        try { await endGroupMut.mutateAsync({ groupCode }); } catch {}
      }
      localStorage.removeItem(CRAWL_ACTIVE_KEY);
      setView("done");
      return;
    }
    if (groupCode && isHost) {
      const res = await advanceMut.mutateAsync({ groupCode });
      setActiveStopIdx(res.activeStopIndex);
      saveActive(res.activeStopIndex, groupCode, true, true);
    } else {
      const next = activeStopIdx + 1;
      setActiveStopIdx(next);
      saveActive(next, null, true, false);
    }
  }

  function reset() {
    setDraft(EMPTY); setActiveStopIdx(0); setGroupCode(null);
    setIsHost(false); setAbandonConfirm(false); setFreshlyPublished(false);
    localStorage.removeItem(CRAWL_ACTIVE_KEY);
    setView("landing");
  }

  /* ── Views ──────────────────────────────────────────────── */

  if (barsLoading && view !== "discover" && view !== "shared") return <LoadingMessage />;

  /* ── SHARED ─────────────────────────────────────────────── */
  if (view === "shared") {
    if (sharedLoading) return <LoadingMessage />;
    if (!sharedCrawl) return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">NOT FOUND</div>
        <p className="text-meta opacity-60 mb-6">This crawl link has expired or doesn't exist.</p>
        <button onClick={() => setView("landing")} className="text-meta opacity-50">← BACK TO CRAWLS</button>
      </div>
    );
    const sharedBarIds = (() => { try { return JSON.parse(sharedCrawl.barIds) as number[]; } catch { return []; } })();
    const sharedBars   = sharedBarIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars;
    const ss = crawlStats(sharedBars);
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-4">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-2">SHARED CRAWL</div>
          <h1 className="text-headline text-[var(--color-paper)] mb-1 leading-none">{sharedCrawl.name.toUpperCase()}</h1>
          {sharedCrawl.description && <p className="text-meta opacity-60 mt-2 mb-2">{sharedCrawl.description}</p>}
          <div className="text-eyebrow opacity-50 mt-3">
            {sharedBars.length} STOPS · {ss.distanceKm.toFixed(1)} KM · ~{formatDuration(ss.durationMin)}
          </div>
        </section>
        <MapsButtons stops={sharedBars} />
        <section className="px-4 pb-4">
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
          <button
            onClick={() => navigate("/crawl")}
            className="text-meta opacity-40 py-2 text-center"
          >
            ← BACK
          </button>
        </div>
      </div>
    );
  }

  /* ── JOIN ───────────────────────────────────────────────── */
  if (view === "join") return (
    <div className="grain-ink max-w-md mx-auto px-4 pt-8 pb-6">
      <div className="text-eyebrow text-[var(--color-blaze)] mb-2">JOIN A GROUP CRAWL</div>
      <h1 className="text-headline text-[var(--color-paper)] mb-8">
        ENTER GROUP<br/><span className="text-[var(--color-blaze)]">CODE</span>
      </h1>
      <input
        value={joinInput}
        onChange={e => { setJoinInput(e.target.value.toUpperCase()); setGenError(""); }}
        placeholder="ABC123" maxLength={6} autoFocus
        className="w-full bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-3xl text-center tracking-[0.3em] py-5 mb-4 focus:outline-none focus:border-[var(--color-blaze)]"
      />
      {genError && <p className="text-meta text-[var(--color-blaze)] mb-3">{genError}</p>}
      <button
        onClick={handleJoinGroup}
        disabled={joinInput.length !== 6 || joinGroupMut.isPending}
        className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-40 mb-2"
      >
        {joinGroupMut.isPending ? "JOINING..." : "JOIN CRAWL →"}
      </button>
      <button onClick={() => setView("landing")} className="w-full text-meta opacity-50 py-2">← BACK</button>
    </div>
  );

  /* ── LANDING ────────────────────────────────────────────── */
  if (view === "landing") {
    const hasDraft = draft.barIds.length > 0;
    return (
      <div
        className="grain-ink max-w-md mx-auto flex flex-col"
        style={{ minHeight: "calc(100dvh - var(--shell-top, 100px) - var(--shell-bottom, 60px))" }}
      >
        {/* Header + stats */}
        <section className="px-4 pt-6 pb-4 shrink-0">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-3">DISPATCH 04 · PUB CRAWLS</div>
          <h1 className="text-headline text-[var(--color-paper)] mb-5">
            EXPLORE BELFAST<br/><span className="text-[var(--color-blaze)]">YOUR WAY</span>
          </h1>
          <div className="flex gap-2">
            {[
              {
                label: "CRAWLS",
                value: String(publishedCrawls?.length ?? 0).padStart(2, "0"),
              },
              {
                label: "AVG STOPS",
                value: publishedCrawls?.length
                  ? String(Math.round(
                      publishedCrawls.reduce((s, c) => {
                        try { return s + (JSON.parse(c.barIds) as number[]).length; } catch { return s; }
                      }, 0) / publishedCrawls.length
                    )).padStart(2, "0")
                  : "—",
              },
              {
                label: "GUINNESS",
                value: String(allBars.filter(b => b.servesGuinness).length).padStart(2, "0"),
              },
            ].map(s => (
              <div key={s.label} className="flex-1 border border-[var(--color-rule)] px-2.5 py-2">
                <div className="text-eyebrow opacity-50">{s.label}</div>
                <div className="font-display text-xl text-[var(--color-paper)] mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* YOUR CRAWLS — fills space */}
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
                      setView("preview");
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base uppercase text-[var(--color-paper)] truncate">
                        {crawl.name}
                      </div>
                      <div className="text-meta opacity-50 mt-0.5">
                        {crawl.barIds.length} STOPS
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

          {/* Draft resume — only shown if a draft exists that isn't already saved */}
          {hasDraft && (
            <div className="border border-[var(--color-rule)] p-3 mt-4 mb-2">
              <div className="text-eyebrow opacity-45 mb-1">DRAFT IN PROGRESS</div>
              <div className="font-display text-base uppercase text-[var(--color-paper)] mb-2 truncate">
                {draft.name || "UNNAMED CRAWL"} · {draft.barIds.length} STOP{draft.barIds.length !== 1 ? "S" : ""}
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

        {/* Bottom CTAs */}
        <div className="px-4 pb-6 pt-3 shrink-0 flex flex-col gap-3">
          {/* Join group */}
          <div>
            <div className="text-eyebrow opacity-40 mb-1.5">JOINING A GROUP?</div>
            <div className="flex gap-2">
              <input
                value={joinInput}
                onChange={e => { setJoinInput(e.target.value.toUpperCase()); setGenError(""); }}
                placeholder="GROUP CODE"
                maxLength={6}
                className="flex-1 bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] font-mono text-sm px-3 py-2.5 tracking-[0.2em] focus:outline-none focus:border-[var(--color-blaze)] uppercase"
              />
              <button
                onClick={() => { if (joinInput.length === 6) handleJoinGroup(); }}
                disabled={joinInput.length !== 6 || joinGroupMut.isPending}
                className="bg-[var(--color-blaze)] text-[var(--color-paper)] px-4 font-display text-sm tracking-wider disabled:opacity-40"
              >
                {joinGroupMut.isPending ? "…" : "JOIN"}
              </button>
            </div>
            {genError && <p className="text-meta text-[var(--color-blaze)] mt-1.5">{genError}</p>}
          </div>

          <button
            onClick={() => setView("building")}
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
  }

  /* ── BUILDER ────────────────────────────────────────────── */
  if (view === "building") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-6">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">BUILD YOUR CRAWL</div>

        {/* Name + description */}
        <div className="relative mb-2">
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Name your crawl"
            maxLength={60}
            className="w-full bg-transparent border-b border-[var(--color-rule)] text-[var(--color-paper)] font-display text-2xl py-2 focus:outline-none focus:border-[var(--color-blaze)] placeholder:opacity-25"
          />
          {!draft.name.trim() && draft.barIds.length >= 2 && (
            <span className="absolute right-0 top-3 text-eyebrow text-[var(--color-blaze)] opacity-70">REQUIRED</span>
          )}
        </div>
        <textarea
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-transparent border-b border-[var(--color-rule)] text-[var(--color-paper)] text-meta py-2 mb-6 focus:outline-none focus:border-[var(--color-blaze)] placeholder:opacity-25 resize-none"
        />

        {/* Auto-generate presets */}
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-display text-base text-[var(--color-paper)]">AUTO-GENERATE</div>
            {generatingPreset && (
              <div className="text-eyebrow text-[var(--color-blaze)] opacity-70">GENERATING…</div>
            )}
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-2 pb-2" style={{ width: "max-content" }}>
              {PRESETS.map(p => {
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
                onClick={() => setShowAreaPicker(p => !p)}
                disabled={!!generatingPreset}
                className={`text-eyebrow border px-3 py-2.5 transition-colors whitespace-nowrap disabled:opacity-40 ${
                  showAreaPicker
                    ? "border-[var(--color-blaze)] text-[var(--color-blaze)]"
                    : "border-[var(--color-rule)] text-[var(--color-paper)] hover:border-[var(--color-blaze)] hover:text-[var(--color-blaze)]"
                }`}
              >
                BY AREA ▾
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
          {genError && <p className="text-meta text-[var(--color-blaze)] mt-2">{genError}</p>}
        </div>

        {/* Add stops search */}
        <div className="hairline-b pb-1.5 mb-3 font-display text-base text-[var(--color-paper)]">
          ADD STOPS
        </div>
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

        {/* Stop list */}
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

        {/* Empty stops hint */}
        {stopBars.length === 0 && !generatingPreset && (
          <div className="py-6 text-center border border-dashed border-[var(--color-rule)] mb-4 opacity-40">
            <div className="text-meta">Use a preset above or search for bars to add stops</div>
          </div>
        )}

        {/* Save actions */}
        <div className="flex flex-col gap-2 mt-2">
          {draft.barIds.length >= 2 && !draft.name.trim() && (
            <p className="text-meta text-[var(--color-blaze)] text-center -mb-1">
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
          <button onClick={() => setView("landing")} className="w-full text-meta opacity-40 py-2 text-center">
            ← BACK
          </button>
        </div>
      </section>
    </div>
  );

  /* ── PREVIEW ────────────────────────────────────────────── */
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
              Use "Save &amp; Share" first to enable group crawls
            </p>
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

          {!submitMsg ? (
            <button
              onClick={async () => {
                if (!draft.shareCode) return;
                await submitMut.mutateAsync({ shareCode: draft.shareCode });
                setSubmitMsg("Submitted for community review!");
              }}
              disabled={!canShare || submitMut.isPending}
              className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] text-meta py-2.5 hover:border-[var(--color-blaze)] disabled:opacity-40 opacity-60"
            >
              {submitMut.isPending ? "SUBMITTING..." : "SUBMIT TO COMMUNITY →"}
            </button>
          ) : (
            <p className="text-meta text-[var(--color-verified)] text-center py-2 flex items-center justify-center gap-2">
              <Check size={14} /> {submitMsg}
            </p>
          )}

          <button onClick={() => setView("building")} className="text-meta opacity-40 py-1.5 text-center">
            ← EDIT CRAWL
          </button>
        </div>
      </div>
    );
  }

  /* ── ACTIVE ─────────────────────────────────────────────── */
  if (view === "active") {
    const currentBar = stopBars[currentStopIdx];
    const nextBar    = stopBars[currentStopIdx + 1];
    const isLastStop = currentStopIdx >= stopBars.length - 1;
    const isGuest    = !!groupCode && !isHost;

    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-5">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-1">
            STOP {currentStopIdx + 1} OF {stopBars.length}
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

          {/* Current stop card */}
          {currentBar && (
            <Link
              to={`/bar/${currentBar.id}`}
              className="block grain-blaze text-[var(--color-paper)] mb-4 px-4 py-4"
            >
              <div className="text-eyebrow opacity-75 mb-1">NOW AT · TAP FOR DETAILS</div>
              <div className="font-display text-2xl uppercase leading-none mb-1">{currentBar.name}</div>
              {(() => {
                const beers = (currentBar.drinks ?? []).filter(d =>
                  /pint|beer|lager|guinness|harp|tennent|stella|ipa/i.test(d.name)
                );
                const cheapest = beers.reduce<typeof beers[0] | null>(
                  (m, d) => !m || d.price < m.price ? d : m, null
                );
                return cheapest ? (
                  <div className="text-meta opacity-75">
                    {cheapest.name.toUpperCase()} ·{" "}
                    {formatPrice(convertPrice(cheapest.price, cheapest.currency as any, currency), currency)}
                  </div>
                ) : null;
              })()}
              <div className="flex items-center gap-1 mt-2 text-eyebrow opacity-55">
                MORE INFO <ChevronRight size={11} />
              </div>
            </Link>
          )}

          <MapsButtons stops={stopBars} compact />

          {/* Route list */}
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
                    i < currentStopIdx
                      ? "text-[var(--color-verified)]"
                      : i === currentStopIdx
                      ? "text-[var(--color-blaze)]"
                      : "text-[var(--color-paper)] opacity-35"
                  }`}>
                    {i < currentStopIdx ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-display text-sm uppercase truncate ${
                      i < currentStopIdx ? "text-[var(--color-paper)] opacity-35" : "text-[var(--color-paper)]"
                    }`}>
                      {bar.name}
                    </div>
                    {i > currentStopIdx && (
                      <div className="text-meta opacity-45">
                        {i === currentStopIdx + 1
                          ? `NEXT · ${haversineKm(stopBars[currentStopIdx], bar).toFixed(1)} KM`
                          : bar.area?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  {i === currentStopIdx + 1 && (() => {
                    const beers = (bar.drinks ?? []).filter(d =>
                      /pint|beer|lager|guinness|harp|tennent|stella|ipa/i.test(d.name)
                    );
                    const cheapest = beers.reduce<typeof beers[0] | null>(
                      (m, d) => !m || d.price < m.price ? d : m, null
                    );
                    return cheapest ? (
                      <div className="font-display text-sm text-[var(--color-sun)] shrink-0">
                        {formatPrice(convertPrice(cheapest.price, cheapest.currency as any, currency), currency)}
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
            <button
              onClick={handleAdvance}
              disabled={advanceMut.isPending || endGroupMut.isPending}
              className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-50"
            >
              {isLastStop
                ? "FINISH CRAWL ✓"
                : `NEXT: ${(nextBar?.name ?? "").toUpperCase().slice(0, 22)}${(nextBar?.name ?? "").length > 22 ? "…" : ""} →`}
            </button>
          )}

          {/* Abandon — two-step confirm */}
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

  /* ── DONE ───────────────────────────────────────────────── */
  if (view === "done") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-4">
        <div className="text-eyebrow text-[var(--color-verified)] mb-2">CRAWL COMPLETE</div>
        <h1 className="text-headline text-[var(--color-paper)] mb-1">
          WELL<br/><span className="text-[var(--color-blaze)]">DONE</span>
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

  /* ── DISCOVER ───────────────────────────────────────────── */
  if (view === "discover") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-4">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-2">DISPATCH 04 · DISCOVER</div>
        <h1 className="text-headline text-[var(--color-paper)] mb-6">
          COMMUNITY<br/><span className="text-[var(--color-blaze)]">CRAWLS</span>
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
              const barIds  = (() => { try { return JSON.parse(crawl.barIds) as number[]; } catch { return []; } })();
              const crawlBars = barIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars;
              const cs = crawlStats(crawlBars);
              return (
                <li key={crawl.id} className="hairline-b-soft py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-eyebrow text-[var(--color-blaze)] w-6 shrink-0">
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
                    <Link
                      to={`/crawl/c/${crawl.shareCode}`}
                      className="text-eyebrow text-[var(--color-blaze)] flex items-center gap-0.5 shrink-0 mt-0.5"
                    >
                      VIEW <ChevronRight size={11} />
                    </Link>
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

/* ── Sub-components ─────────────────────────────────────── */

function StopRow({
  bar, idx, currency, done,
}: {
  bar: { id: number; name: string; area?: string | null; drinks?: Array<{ name: string; price: number; currency: string }> };
  idx: number;
  currency: string;
  done?: boolean;
}) {
  const beers = (bar.drinks ?? []).filter(d =>
    /pint|beer|lager|guinness|harp|tennent|stella|heineken|ipa/i.test(d.name)
  );
  const cheapest = beers.reduce<typeof beers[0] | null>(
    (m, d) => !m || d.price < m.price ? d : m, null
  );
  return (
    <div className="flex items-center gap-3 hairline-b-soft py-2.5">
      <span className={`w-6 text-eyebrow shrink-0 ${done ? "text-[var(--color-verified)]" : "text-[var(--color-blaze)]"}`}>
        {done ? "✓" : String(idx + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
        {bar.area && <div className="text-meta opacity-45">{bar.area.toUpperCase()}</div>}
      </div>
      {cheapest && (
        <div className="font-display text-sm text-[var(--color-sun)] shrink-0">
          {formatPrice(convertPrice(cheapest.price, cheapest.currency as any, currency), currency)}
        </div>
      )}
    </div>
  );
}

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
