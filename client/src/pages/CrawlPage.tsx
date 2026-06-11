import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronRight, X, Search, Users, Share2, MapPin, GripVertical } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAppStore, formatPrice } from "../lib/store";
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
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
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

// Use bar names in Maps URLs — much clearer UX than raw coords
function buildGoogleMapsUrl(stops: Array<{ name: string; lat: number; lng: number }>) {
  if (stops.length < 2) return "";
  // /dir/ path format accepts place names; append Belfast to disambiguate
  const encode = (s: string) => encodeURIComponent(`${s}, Belfast`);
  return `https://www.google.com/maps/dir/${stops.map(s => encode(s.name)).join("/")}`;
}

function buildAppleMapsUrl(stops: Array<{ name: string; lat: number; lng: number }>) {
  if (stops.length < 2) return "";
  const encode = (s: string) => encodeURIComponent(`${s} Belfast`);
  // Apple Maps doesn't support multi-waypoint; link first → last by name
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

  const [view, setView] = useState<View>(() => isShared ? "shared" : isJoin ? "join" : "landing");
  const [draft, setDraft] = useState<CrawlDraft>(() => {
    try { return JSON.parse(localStorage.getItem(CRAWL_DRAFT_KEY) ?? "") as CrawlDraft; }
    catch { return EMPTY; }
  });
  const [activeStopIdx, setActiveStopIdx]   = useState(0);
  const [isHost, setIsHost]                 = useState(false);
  const [groupCode, setGroupCode]           = useState<string | null>(null);
  const [joinInput, setJoinInput]           = useState(params.code?.toUpperCase() ?? "");
  const [search, setSearch]                 = useState("");
  const [selectedAreas, setSelectedAreas]   = useState<string[]>([]);
  const [genError, setGenError]             = useState("");
  const [submitMsg, setSubmitMsg]           = useState("");
  // Drag state
  const [dragIdx, setDragIdx]               = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx]       = useState<number | null>(null);
  // Builder UI state
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [codeCopied, setCodeCopied]         = useState(false);

  useEffect(() => { localStorage.setItem(CRAWL_DRAFT_KEY, JSON.stringify(draft)); }, [draft]);

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
  }, []);

  const { data: allBarsData, isLoading: barsLoading } = trpc.bars.getAllWithDetails.useQuery();
  const allBars = allBarsData ?? [];

  const { data: sharedCrawl, isLoading: sharedLoading } = trpc.crawls.getByShareCode.useQuery(
    { shareCode: params.code ?? "" }, { enabled: view === "shared" && !!params.code }
  );
  const { data: publishedCrawls } = trpc.crawls.getPublished.useQuery(undefined, { enabled: view === "discover" });

  const createMut     = trpc.crawls.create.useMutation();
  const generateMut   = trpc.crawls.generate.useMutation();
  const submitMut     = trpc.crawls.submit.useMutation();
  const startGroupMut = trpc.crawls.startGroup.useMutation();
  const joinGroupMut  = trpc.crawls.joinGroup.useMutation();
  const advanceMut    = trpc.crawls.advanceStop.useMutation();
  const endGroupMut   = trpc.crawls.endGroup.useMutation();

  // Guest polling
  const [guestStopIdx, setGuestStopIdx] = useState(0);
  const [guestCount,   setGuestCount]   = useState(1);
  const groupStateQ = trpc.crawls.getGroupState.useQuery(
    { groupCode: groupCode ?? "" },
    { enabled: !!groupCode && !isHost, refetchInterval: 5000 }
  );
  useEffect(() => {
    if (groupStateQ.data) {
      setGuestStopIdx(groupStateQ.data.activeStopIndex);
      setGuestCount(groupStateQ.data.participantCount);
    }
  }, [groupStateQ.data]);

  const currentStopIdx = isHost ? activeStopIdx : guestStopIdx;
  const participants   = isHost ? 1 : guestCount;

  const stopBars = useMemo(
    () => draft.barIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars,
    [draft.barIds, allBars]
  );
  const stats   = useMemo(() => crawlStats(stopBars), [stopBars]);
  const areas   = useMemo(() => [...new Set(allBars.map(b => b.area).filter(Boolean))] as string[], [allBars]);

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
    setGenError("");
    try {
      const result = await generateMut.mutateAsync({
        preset,
        area: preset === "area" ? (areaOverride ?? selectedAreas[0]) : undefined,
        maxStops: 6,
      });
      setDraft(d => ({ ...d, barIds: result.barIds, name: d.name || result.name, tags: result.tags, generatedBy: "auto" }));
    } catch (e: any) { setGenError(e.message ?? "Generation failed"); }
  }

  async function handleSave() {
    if (!draft.name.trim() || draft.barIds.length < 2) return;
    const result = await createMut.mutateAsync({
      name: draft.name, description: draft.description || undefined,
      barIds: draft.barIds, authorName: draft.authorName || undefined,
      tags: draft.tags, generatedBy: draft.generatedBy,
    });
    setDraft(d => ({ ...d, shareCode: result.shareCode }));
    setView("preview");
  }

  function saveActive(idx: number, gc: string | null, host: boolean, isGroup: boolean) {
    localStorage.setItem(CRAWL_ACTIVE_KEY, JSON.stringify({ draft, activeStopIdx: idx, isHost: host, isGroup, groupCode: gc }));
  }

  function handleStartSolo() {
    setIsHost(true); setGroupCode(null); setActiveStopIdx(0);
    saveActive(0, null, true, false); setView("active");
  }

  async function handleStartGroup() {
    if (!draft.shareCode) return;
    const { groupCode: gc } = await startGroupMut.mutateAsync({ shareCode: draft.shareCode });
    setGroupCode(gc); setIsHost(true); setActiveStopIdx(0);
    saveActive(0, gc, true, true); setView("active");
  }

  async function handleJoinGroup() {
    const code = joinInput.trim().toUpperCase();
    if (!code) return;
    try {
      const res = await joinGroupMut.mutateAsync({ groupCode: code });
      const barIds = JSON.parse(res.barIds) as number[];
      setDraft(d => ({ ...d, name: res.name, barIds, shareCode: res.shareCode }));
      setGroupCode(code); setIsHost(false); setActiveStopIdx(res.activeStopIndex);
      setView("active");
    } catch (e: any) { setGenError(e.message ?? "Could not join group"); }
  }

  async function handleAdvance() {
    if (currentStopIdx >= stopBars.length - 1) {
      if (groupCode && isHost) await endGroupMut.mutateAsync({ groupCode });
      localStorage.removeItem(CRAWL_ACTIVE_KEY); setView("done"); return;
    }
    if (groupCode && isHost) {
      const res = await advanceMut.mutateAsync({ groupCode });
      setActiveStopIdx(res.activeStopIndex);
      saveActive(res.activeStopIndex, groupCode, true, true);
    } else {
      const next = activeStopIdx + 1;
      setActiveStopIdx(next); saveActive(next, null, true, false);
    }
  }

  function reset() {
    setDraft(EMPTY); setActiveStopIdx(0); setGroupCode(null); setIsHost(false);
    localStorage.removeItem(CRAWL_ACTIVE_KEY); setView("landing");
  }

  /* ── Views ──────────────────────────────────────────────── */

  if (barsLoading && view !== "discover" && view !== "shared") return <LoadingMessage />;

  /* SHARED */
  if (view === "shared") {
    if (sharedLoading) return <LoadingMessage />;
    if (!sharedCrawl) return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-2">NOT FOUND</div>
        <p className="text-meta opacity-60">This crawl link has expired or doesn't exist.</p>
      </div>
    );
    const sharedBarIds = JSON.parse(sharedCrawl.barIds) as number[];
    const sharedBars   = sharedBarIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars;
    const ss = crawlStats(sharedBars);
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-4">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-2">SHARED CRAWL</div>
          <h1 className="text-hero text-[var(--color-paper)] mb-1">{sharedCrawl.name.toUpperCase()}</h1>
          {sharedCrawl.description && <p className="text-meta opacity-60 mb-2">{sharedCrawl.description}</p>}
          <div className="text-eyebrow opacity-50">{sharedBars.length} STOPS · {ss.distanceKm.toFixed(1)} KM · ~{formatDuration(ss.durationMin)}</div>
        </section>
        <MapsButtons stops={sharedBars} />
        <section className="px-4 pb-4">
          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">ROUTE</div>
          {sharedBars.map((b, i) => <StopRow key={b.id} bar={b} idx={i} currency={currency} />)}
        </section>
        <div className="px-4 pb-6">
          <button onClick={() => {
            const barIds = JSON.parse(sharedCrawl.barIds) as number[];
            setDraft({ ...EMPTY, name: sharedCrawl.name, description: sharedCrawl.description ?? "", barIds, shareCode: sharedCrawl.shareCode, tags: JSON.parse(sharedCrawl.tags ?? "[]") });
            setView("preview");
          }} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">
            START THIS CRAWL →
          </button>
        </div>
      </div>
    );
  }

  /* JOIN */
  if (view === "join") return (
    <div className="grain-ink max-w-md mx-auto px-4 pt-8 pb-6">
      <div className="text-eyebrow text-[var(--color-blaze)] mb-2">JOIN A GROUP CRAWL</div>
      <h1 className="text-hero text-[var(--color-paper)] mb-8">ENTER<br/>GROUP<br/><span className="text-[var(--color-blaze)]">CODE</span></h1>
      <input value={joinInput} onChange={e => { setJoinInput(e.target.value.toUpperCase()); setGenError(""); }}
        placeholder="ABC123" maxLength={6}
        className="w-full bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-3xl text-center tracking-[0.3em] py-5 mb-4 focus:outline-none focus:border-[var(--color-blaze)]"
      />
      {genError && <p className="text-meta text-[var(--color-blaze)] mb-3">{genError}</p>}
      <button onClick={handleJoinGroup} disabled={joinInput.length !== 6 || joinGroupMut.isPending}
        className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-40 mb-2">
        {joinGroupMut.isPending ? "JOINING..." : "JOIN CRAWL →"}
      </button>
      <button onClick={() => setView("landing")} className="w-full text-meta opacity-50 py-2">← BACK</button>
    </div>
  );

  /* LANDING */
  if (view === "landing") {
    const hasDraft = draft.barIds.length > 0;
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-8">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-3">DISPATCH 04 · PUB CRAWLS</div>
          <h1 className="text-hero text-[var(--color-paper)] mb-8">
            EXPLORE<br/><span className="text-[var(--color-blaze)]">BELFAST</span><br/>YOUR WAY
          </h1>
          <div className="flex gap-2 mb-8">
            {[
              { label: "BARS",    value: String(allBars.length).padStart(2,"0") },
              { label: "AREAS",   value: String(areas.length).padStart(2,"0") },
              { label: "IN DRAFT",value: String(draft.barIds.length).padStart(2,"0") },
            ].map(s => (
              <div key={s.label} className="flex-1 border border-[var(--color-rule)] px-2.5 py-2.5">
                <div className="text-eyebrow opacity-50">{s.label}</div>
                <div className="font-display text-2xl text-[var(--color-paper)] mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>

          {hasDraft && (
            <div className="border border-[var(--color-rule)] p-3 mb-4">
              <div className="text-eyebrow opacity-50 mb-1">DRAFT IN PROGRESS</div>
              <div className="font-display text-base uppercase text-[var(--color-paper)] mb-2">
                {draft.name || "UNNAMED CRAWL"} · {draft.barIds.length} STOPS
              </div>
              <div className="flex gap-2">
                <button onClick={() => setView("building")} className="flex-1 bg-[var(--color-blaze)] text-[var(--color-paper)] text-eyebrow py-2.5">RESUME</button>
                <button onClick={() => setDraft(EMPTY)} className="border border-[var(--color-rule)] text-[var(--color-paper)] text-eyebrow px-4 py-2.5 opacity-60 hover:border-[var(--color-blaze)]">CLEAR</button>
              </div>
            </div>
          )}

          <button onClick={() => setView("building")} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider mb-3">BUILD A CRAWL →</button>
          <button onClick={() => setView("discover")} className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider mb-8 hover:border-[var(--color-blaze)]">DISCOVER CRAWLS</button>

          <div className="hairline-t pt-6">
            <div className="text-eyebrow opacity-50 mb-3">JOINING A GROUP?</div>
            <div className="flex gap-2">
              <input value={joinInput} onChange={e => { setJoinInput(e.target.value.toUpperCase()); setGenError(""); }}
                placeholder="ENTER CODE" maxLength={6}
                className="flex-1 bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] font-mono text-base px-3 py-3 tracking-[0.2em] focus:outline-none focus:border-[var(--color-blaze)]"
              />
              <button onClick={() => { if (joinInput.length === 6) handleJoinGroup(); }}
                disabled={joinInput.length !== 6 || joinGroupMut.isPending}
                className="bg-[var(--color-blaze)] text-[var(--color-paper)] px-5 font-display text-sm tracking-wider disabled:opacity-40">JOIN</button>
            </div>
            {genError && <p className="text-meta text-[var(--color-blaze)] mt-2">{genError}</p>}
          </div>
        </section>
      </div>
    );
  }

  /* BUILDER */
  if (view === "building") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-6">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">BUILD YOUR CRAWL</div>
        <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Name your crawl"
          className="w-full bg-transparent border-b border-[var(--color-rule)] text-[var(--color-paper)] font-display text-2xl py-2 mb-2 focus:outline-none focus:border-[var(--color-blaze)] placeholder:opacity-30"
        />
        <textarea value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          placeholder="Description (optional)" rows={2}
          className="w-full bg-transparent border-b border-[var(--color-rule)] text-[var(--color-paper)] text-meta py-2 mb-6 focus:outline-none focus:border-[var(--color-blaze)] placeholder:opacity-30 resize-none"
        />

        {/* Auto-generate — above stop list, single horizontal scroll row */}
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-display text-base text-[var(--color-paper)]">AUTO-GENERATE</div>
            <div className="text-eyebrow opacity-40">OPTIONAL</div>
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-2 pb-2" style={{ width: "max-content" }}>
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => handleGenerate(p.id)} disabled={generateMut.isPending}
                  className="text-eyebrow border border-[var(--color-rule)] text-[var(--color-paper)] px-3 py-2.5 hover:border-[var(--color-blaze)] hover:text-[var(--color-blaze)] disabled:opacity-40 transition-colors whitespace-nowrap">
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setShowAreaPicker(p => !p)}
                disabled={generateMut.isPending}
                className={`text-eyebrow border px-3 py-2.5 transition-colors whitespace-nowrap disabled:opacity-40 ${showAreaPicker ? "border-[var(--color-blaze)] text-[var(--color-blaze)]" : "border-[var(--color-rule)] text-[var(--color-paper)] hover:border-[var(--color-blaze)] hover:text-[var(--color-blaze)]"}`}>
                BY AREA ▾
              </button>
            </div>
          </div>
          {showAreaPicker && (
            <div className="flex flex-wrap gap-1.5 mt-1 mb-1">
              {areas.map(a => (
                <button key={a} onClick={() => { handleGenerate("area", a); setShowAreaPicker(false); }}
                  disabled={generateMut.isPending}
                  className="text-eyebrow px-2.5 py-2 border border-[var(--color-rule)] text-[var(--color-paper)] opacity-70 hover:border-[var(--color-blaze)] hover:opacity-100 transition-colors disabled:opacity-40">
                  {a}
                </button>
              ))}
            </div>
          )}
          {genError && <p className="text-meta text-[var(--color-blaze)] mt-2">{genError}</p>}
        </div>

        {/* Search */}
        <div className="hairline-b pb-1.5 mb-3 font-display text-base text-[var(--color-paper)]">ADD STOPS</div>
        <div className="relative mb-5">
          <div className="flex items-center gap-2 border border-[var(--color-rule)] px-3 py-3 focus-within:border-[var(--color-blaze)]">
            <Search size={14} className="opacity-40 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bars…"
              className="flex-1 bg-transparent text-[var(--color-paper)] text-meta focus:outline-none placeholder:opacity-40"
            />
          </div>
          {filteredBars.length > 0 && (
            <ul className="border border-[var(--color-rule)] border-t-0 absolute w-full z-10 bg-[var(--color-ink)]">
              {filteredBars.map(bar => (
                <li key={bar.id}>
                  <button onClick={() => { setDraft(d => ({ ...d, barIds: [...d.barIds, bar.id] })); setSearch(""); }}
                    className="w-full text-left px-3 py-3 flex items-center justify-between hairline-b-soft hover:bg-[var(--color-blaze)] group">
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

        {/* Stops list — draggable with improved visual */}
        {stopBars.length > 0 && (
          <>
            <div className="hairline-b pb-1.5 mb-2 flex items-baseline justify-between">
              <div className="font-display text-base text-[var(--color-paper)]">YOUR STOPS</div>
              <div className="text-eyebrow opacity-40">{stopBars.length} · {stats.distanceKm.toFixed(1)} KM · ~{formatDuration(stats.durationMin)}</div>
            </div>
            <ul className="mb-6">
              {stopBars.map((bar, i) => (
                <li key={bar.id}
                  draggable
                  onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(i); }}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  className={`relative flex items-center gap-1 hairline-b-soft transition-opacity duration-100 ${dragIdx === i ? "opacity-25" : "opacity-100"}`}
                >
                  {dragOverIdx === i && dragIdx !== i && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--color-blaze)]" />
                  )}
                  <div className="cursor-grab active:cursor-grabbing flex items-center justify-center w-11 h-11 opacity-25 hover:opacity-70 shrink-0 touch-none">
                    <GripVertical size={16} />
                  </div>
                  <span className="text-eyebrow text-[var(--color-blaze)] w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex-1 min-w-0 py-2.5">
                    <div className="font-display text-sm uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
                    <div className="text-meta opacity-50">{bar.area}</div>
                  </div>
                  <button onClick={() => setDraft(d => ({ ...d, barIds: d.barIds.filter(x => x !== bar.id) }))}
                    className="flex items-center justify-center w-11 h-11 text-[var(--color-blaze)] opacity-50 hover:opacity-100 shrink-0"
                    aria-label={`Remove ${bar.name}`}>
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-2">
          <button onClick={handleSave} disabled={draft.barIds.length < 2 || !draft.name.trim() || createMut.isPending}
            className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-40 mb-2">
            {createMut.isPending ? "SAVING..." : "SAVE & SHARE →"}
          </button>
          <button onClick={() => setView("landing")} className="w-full text-meta opacity-50 py-2 text-center">← BACK</button>
        </div>
      </section>
    </div>
  );

  /* PREVIEW */
  if (view === "preview") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-4">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-2">CRAWL SAVED</div>
        <h1 className="font-display text-2xl text-[var(--color-paper)] uppercase mb-1">{draft.name}</h1>
        {draft.description && <p className="text-meta opacity-60 mb-2">{draft.description}</p>}
        <div className="text-eyebrow opacity-50 mb-5">{stopBars.length} STOPS · {stats.distanceKm.toFixed(1)} KM · ~{formatDuration(stats.durationMin)}</div>
        <MapsButtons stops={stopBars} />
        <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">ROUTE</div>
        {stopBars.map((b, i) => <StopRow key={b.id} bar={b} idx={i} currency={currency} />)}
      </section>
      <div className="px-4 pb-2 flex flex-col gap-2">
        <button onClick={handleStartSolo} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">START SOLO CRAWL →</button>
        <button onClick={handleStartGroup} disabled={!draft.shareCode || startGroupMut.isPending}
          className="w-full border border-[var(--color-blaze)] text-[var(--color-blaze)] font-display text-base py-3 tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
          <Users size={15} />{startGroupMut.isPending ? "STARTING..." : "START GROUP CRAWL"}
        </button>
        {draft.shareCode && (
          <button onClick={() => shareCrawl(draft.name, draft.shareCode!)}
            className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-sm py-3 tracking-wider hover:border-[var(--color-blaze)] flex items-center justify-center gap-2">
            <Share2 size={14} /> SHARE CRAWL
          </button>
        )}
        {!submitMsg ? (
          <button onClick={async () => { if (!draft.shareCode) return; await submitMut.mutateAsync({ shareCode: draft.shareCode }); setSubmitMsg("Submitted for community review."); }}
            disabled={!draft.shareCode || submitMut.isPending}
            className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] text-meta py-2.5 hover:border-[var(--color-blaze)] disabled:opacity-40">
            {submitMut.isPending ? "SUBMITTING..." : "SUBMIT TO COMMUNITY →"}
          </button>
        ) : <p className="text-meta text-[var(--color-verified)] text-center py-2">{submitMsg}</p>}
        <button onClick={() => setView("building")} className="text-meta opacity-50 py-2 text-center">← EDIT CRAWL</button>
      </div>
    </div>
  );

  /* ACTIVE */
  if (view === "active") {
    const currentBar = stopBars[currentStopIdx];
    const nextBar    = stopBars[currentStopIdx + 1];
    const isLastStop = currentStopIdx >= stopBars.length - 1;
    const isGuest    = !!groupCode && !isHost;

    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-5">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-1">STOP {currentStopIdx + 1} OF {stopBars.length} · {currentBar?.area?.toUpperCase()}</div>

          {groupCode && (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-eyebrow opacity-60"><Users size={12} />{participants} {participants === 1 ? "PERSON" : "PEOPLE"}</div>
              <button
                onClick={() => { navigator.clipboard?.writeText(groupCode!).catch(() => {}); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                className="flex items-center gap-2 border border-[var(--color-rule)] px-2.5 py-1.5 hover:border-[var(--color-blaze)] transition-colors"
              >
                <span className="text-eyebrow opacity-50">CODE</span>
                <span className="font-mono text-sm text-[var(--color-paper)] tracking-widest">{groupCode}</span>
                <span className={`text-eyebrow transition-colors ${codeCopied ? "text-[var(--color-verified)] opacity-100" : "opacity-40"}`}>{codeCopied ? "✓" : "COPY"}</span>
              </button>
              <button onClick={() => shareGroup(draft.name, groupCode)}
                className="flex items-center gap-1.5 text-eyebrow opacity-60 hover:opacity-100"><Share2 size={13} /> INVITE</button>
            </div>
          )}

          {/* Current stop — link to bar detail */}
          {currentBar && (
            <Link to={`/bar/${currentBar.id}`} className="block grain-blaze text-[var(--color-paper)] mb-4 px-4 py-4">
              <div className="text-eyebrow opacity-80 mb-1">NOW AT — TAP FOR DETAILS</div>
              <div className="font-display text-2xl uppercase leading-none mb-1">{currentBar.name}</div>
              {(() => {
                const beers = (currentBar.drinks ?? []).filter(d => /pint|beer|lager|guinness|harp|tennent|stella|ipa/i.test(d.name));
                const cheapest = beers.reduce<typeof beers[0] | null>((m, d) => !m || d.price < m.price ? d : m, null);
                return cheapest ? <div className="text-meta opacity-80">{cheapest.name.toUpperCase()} · {formatPrice(cheapest.price, currency)}</div> : null;
              })()}
              <div className="flex items-center gap-1 mt-2 text-eyebrow opacity-60">MORE INFO <ChevronRight size={11} /></div>
            </Link>
          )}

          <MapsButtons stops={stopBars} compact />

          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">YOUR ROUTE</div>
          <ul className="mb-4">
            {stopBars.map((bar, i) => (
              <li key={bar.id}>
                <Link to={`/bar/${bar.id}`} className="flex items-center gap-3 hairline-b-soft py-3">
                  <span className={`num-rail w-6 text-eyebrow shrink-0 ${i < currentStopIdx ? "text-[var(--color-verified)]" : i === currentStopIdx ? "text-[var(--color-blaze)]" : "text-[var(--color-paper)] opacity-40"}`}>
                    {i < currentStopIdx ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-display text-sm uppercase truncate ${i < currentStopIdx ? "text-[var(--color-paper)] opacity-40" : "text-[var(--color-paper)]"}`}>{bar.name}</div>
                    {i > currentStopIdx && (
                      <div className="text-meta opacity-50">
                        {i === currentStopIdx + 1 ? `${haversineKm(stopBars[currentStopIdx], bar).toFixed(1)} KM` : bar.area?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  {i === currentStopIdx + 1 && (() => {
                    const beers = (bar.drinks ?? []).filter(d => /pint|beer|lager|guinness|harp|tennent|stella|ipa/i.test(d.name));
                    const cheapest = beers.reduce<typeof beers[0] | null>((m, d) => !m || d.price < m.price ? d : m, null);
                    return cheapest ? <div className="font-display text-base text-[var(--color-sun)] shrink-0">{formatPrice(cheapest.price, currency)}</div> : null;
                  })()}
                  <ChevronRight size={12} className="opacity-30 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="px-4 pb-6">
          {isGuest ? (
            <div className="border border-[var(--color-rule)] text-center py-3 text-meta opacity-60">WAITING FOR HOST TO ADVANCE…</div>
          ) : (
            <button onClick={handleAdvance} disabled={advanceMut.isPending || endGroupMut.isPending}
              className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">
              {isLastStop ? "FINISH CRAWL ✓" : `NEXT STOP → ${nextBar?.name.toUpperCase()}`}
            </button>
          )}
          <button onClick={reset} className="w-full text-meta opacity-40 py-2 text-center mt-1">ABANDON CRAWL</button>
        </div>
      </div>
    );
  }

  /* DONE */
  if (view === "done") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-4">
        <div className="text-eyebrow text-[var(--color-verified)] mb-2">CRAWL COMPLETE</div>
        <h1 className="text-hero text-[var(--color-paper)] mb-1">WELL<br/><span className="text-[var(--color-blaze)]">DONE</span></h1>
        <div className="text-eyebrow opacity-50 mb-6">{stopBars.length} STOPS · {stats.distanceKm.toFixed(1)} KM WALKED</div>
        <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">RECAP</div>
        {stopBars.map((b, i) => <StopRow key={b.id} bar={b} idx={i} currency={currency} done />)}
      </section>
      <div className="px-4 pb-6 flex flex-col gap-2">
        <button onClick={() => { setDraft(EMPTY); setActiveStopIdx(0); setView("building"); }}
          className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">BUILD ANOTHER CRAWL →</button>
        <button onClick={reset} className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-sm py-2.5 tracking-wider hover:border-[var(--color-blaze)]">BACK TO CRAWLS</button>
      </div>
    </div>
  );

  /* DISCOVER */
  if (view === "discover") return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-6 pb-4">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-2">DISPATCH 04 · DISCOVER</div>
        <h1 className="text-hero text-[var(--color-paper)] mb-6">COMMUNITY<br/><span className="text-[var(--color-blaze)]">CRAWLS</span></h1>
        {!publishedCrawls || publishedCrawls.length === 0 ? (
          <div className="py-16 text-center">
            <MapPin size={28} className="mx-auto mb-4 opacity-20" />
            <div className="text-meta opacity-50">No community crawls yet.</div>
            <div className="text-meta opacity-40">Be the first — build one and submit it.</div>
          </div>
        ) : (
          <ul>
            {publishedCrawls.map((crawl, i) => {
              const barIds = JSON.parse(crawl.barIds) as number[];
              const crawlBars = barIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars;
              const cs = crawlStats(crawlBars);
              return (
                <li key={crawl.id} className="hairline-b-soft py-3">
                  <div className="flex items-start gap-3">
                    <span className="num-rail text-[var(--color-blaze)] w-6 text-eyebrow">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base uppercase text-[var(--color-paper)]">{crawl.name}</div>
                      <div className="text-meta opacity-50 mt-0.5">
                        {barIds.length} STOPS · {cs.distanceKm.toFixed(1)} KM{crawl.authorName ? ` · BY ${crawl.authorName.toUpperCase()}` : ""}
                      </div>
                      {crawl.description && <div className="text-meta opacity-50 mt-0.5 truncate">{crawl.description}</div>}
                    </div>
                    <button onClick={() => navigate(`/crawl/c/${crawl.shareCode}`)}
                      className="text-eyebrow text-[var(--color-blaze)] flex items-center gap-0.5 shrink-0">
                      VIEW <ChevronRight size={12} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="px-4 pb-6 flex flex-col gap-2">
        <button onClick={() => setView("building")} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">BUILD YOUR OWN →</button>
        <button onClick={() => setView("landing")} className="text-meta opacity-50 py-2 text-center">← BACK</button>
      </div>
    </div>
  );

  return null;
}

/* ── Shared sub-components ───────────────────────────────── */

function StopRow({ bar, idx, currency, done }: {
  bar: { id: number; name: string; area?: string | null; drinks?: Array<{ name: string; price: number; currency: string }> };
  idx: number; currency: string; done?: boolean;
}) {
  const beers = (bar.drinks ?? []).filter(d => /pint|beer|lager|guinness|harp|tennent|stella|ipa/i.test(d.name));
  const cheapest = beers.reduce<typeof beers[0] | null>((m, d) => !m || d.price < m.price ? d : m, null);
  return (
    <div className="flex items-center gap-3 hairline-b-soft py-2.5">
      <span className={`num-rail w-6 text-eyebrow ${done ? "text-[var(--color-verified)]" : "text-[var(--color-blaze)]"}`}>
        {done ? "✓" : String(idx + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
        <div className="text-meta opacity-50">{bar.area?.toUpperCase()}</div>
      </div>
      {cheapest && <div className="font-display text-base text-[var(--color-sun)]">{formatPrice(cheapest.price, currency)}</div>}
    </div>
  );
}

function MapsButtons({ stops, compact }: { stops: Array<{ name: string; lat: number; lng: number }>; compact?: boolean }) {
  if (stops.length < 2) return null;
  return (
    <div className={`flex gap-2 ${compact ? "mb-3" : "mb-4"}`}>
      <a href={buildGoogleMapsUrl(stops)} target="_blank" rel="noopener noreferrer"
        className="flex-1 border border-[var(--color-rule)] text-[var(--color-paper)] text-eyebrow py-2.5 text-center hover:border-[var(--color-blaze)] flex items-center justify-center gap-1.5">
        <MapPin size={12} aria-hidden />GOOGLE MAPS
      </a>
      <a href={buildAppleMapsUrl(stops)} target="_blank" rel="noopener noreferrer"
        className="flex-1 border border-[var(--color-rule)] text-[var(--color-paper)] text-eyebrow py-2.5 text-center hover:border-[var(--color-blaze)] flex items-center justify-center gap-1.5">
        <MapPin size={12} aria-hidden />APPLE MAPS
      </a>
    </div>
  );
}
