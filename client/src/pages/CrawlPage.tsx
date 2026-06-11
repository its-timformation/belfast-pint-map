import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronRight, ChevronUp, ChevronDown, X, Search, Users, Copy, Share2, MapPin } from "lucide-react";
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

const DRAFT_KEY = "bpm-crawl-draft";
const ACTIVE_KEY = "bpm-crawl-active";

const EMPTY_DRAFT: CrawlDraft = {
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

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}`.trim() : `${m}m`;
}

function buildGoogleMapsUrl(stops: Array<{ lat: number; lng: number }>): string {
  if (stops.length < 2) return "";
  const origin = `${stops[0].lat},${stops[0].lng}`;
  const destination = `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`;
  const waypoints = stops.slice(1, -1).map(s => `${s.lat},${s.lng}`).join("|");
  const params = new URLSearchParams({ api: "1", origin, destination, travelmode: "walking" });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildAppleMapsUrl(stops: Array<{ lat: number; lng: number }>): string {
  if (stops.length < 2) return "";
  const origin = `${stops[0].lat},${stops[0].lng}`;
  const destination = `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`;
  return `https://maps.apple.com/?saddr=${origin}&daddr=${destination}&dirflg=w`;
}

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function nativeShare(title: string, url: string) {
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
  } else {
    copyToClipboard(url);
  }
}

const PRESETS: Array<{ id: Preset; label: string; desc: string }> = [
  { id: "cheapest", label: "CHEAPEST PINTS", desc: "Sorted by lowest avg price" },
  { id: "guinness", label: "GUINNESS TRAIL", desc: "Best Guinness pourers" },
  { id: "craft", label: "CRAFT BEER", desc: "IPAs, pale ales & local breweries" },
  { id: "trad", label: "TRAD MUSIC", desc: "Bars with live sessions" },
  { id: "brewery", label: "BREWERY RUN", desc: "Breweries & taprooms" },
  { id: "area", label: "AREA CRAWL", desc: "Best bars in one neighbourhood" },
  { id: "epic", label: "EPIC CRAWL", desc: "One bar from every area" },
];

/* ── Main component ─────────────────────────────────────────── */

export default function CrawlPage() {
  const params = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { currency } = useAppStore();

  // Determine initial view from route
  const routeMode = window.location.pathname.includes("/crawl/join/") ? "join"
    : window.location.pathname.includes("/crawl/c/") ? "shared"
    : null;

  const [view, setView] = useState<View>(routeMode ?? "landing");
  const [draft, setDraft] = useState<CrawlDraft>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "") as CrawlDraft; } catch { return EMPTY_DRAFT; }
  });
  const [activeStopIdx, setActiveStopIdx] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState(params.code?.toUpperCase() ?? "");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const [genError, setGenError] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist draft
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  // Restore active crawl if app reloaded mid-crawl
  useEffect(() => {
    if (routeMode) return;
    try {
      const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? "");
      if (saved?.barIds?.length) {
        setDraft(saved.draft);
        setActiveStopIdx(saved.activeStopIdx ?? 0);
        setIsHost(saved.isHost ?? false);
        setGroupCode(saved.groupCode ?? null);
        setView(saved.isGroup ? (saved.isHost ? "active" : "active") : "active");
      }
    } catch {}
  }, []);

  // Fetch all bars (for builder typeahead + stop details)
  const { data: allBarsData, isLoading: barsLoading } = trpc.bars.getAllWithDetails.useQuery();
  const allBars = allBarsData ?? [];

  // Shared crawl query
  const { data: sharedCrawl, isLoading: sharedLoading } = trpc.crawls.getByShareCode.useQuery(
    { shareCode: params.code ?? "" },
    { enabled: view === "shared" && !!params.code }
  );

  // Discover query
  const { data: publishedCrawls } = trpc.crawls.getPublished.useQuery(
    undefined,
    { enabled: view === "discover" }
  );

  // Mutations
  const createMut = trpc.crawls.create.useMutation();
  const generateMut = trpc.crawls.generate.useMutation();
  const submitMut = trpc.crawls.submit.useMutation();
  const startGroupMut = trpc.crawls.startGroup.useMutation();
  const joinGroupMut = trpc.crawls.joinGroup.useMutation();
  const advanceMut = trpc.crawls.advanceStop.useMutation();
  const endGroupMut = trpc.crawls.endGroup.useMutation();

  // Guest polling
  const [groupState, setGroupState] = useState<{ activeStopIndex: number; participantCount: number } | null>(null);
  const groupStateQuery = trpc.crawls.getGroupState.useQuery(
    { groupCode: groupCode ?? "" },
    { enabled: !!groupCode && !isHost, refetchInterval: 5000 }
  );
  useEffect(() => {
    if (groupStateQuery.data) setGroupState(groupStateQuery.data);
  }, [groupStateQuery.data]);

  const currentStopIdx = isHost ? activeStopIdx : (groupState?.activeStopIndex ?? activeStopIdx);

  // Resolve stop bars
  const stopBars = useMemo(() =>
    draft.barIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars,
    [draft.barIds, allBars]
  );

  const stats = useMemo(() => crawlStats(stopBars), [stopBars]);
  const shareUrl = draft.shareCode ? `${window.location.origin}/crawl/c/${draft.shareCode}` : null;
  const groupUrl = groupCode ? `${window.location.origin}/crawl/join/${groupCode}` : null;

  // Typeahead filtered bars
  const filteredBars = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allBars
      .filter(b => b.name.toLowerCase().includes(q) || b.area?.toLowerCase().includes(q))
      .filter(b => !draft.barIds.includes(b.id))
      .slice(0, 8);
  }, [search, allBars, draft.barIds]);

  const areas = useMemo(() =>
    [...new Set(allBars.map(b => b.area).filter(Boolean))] as string[],
    [allBars]
  );

  /* ── Handlers ────────────────────────────────────────────── */

  function addBar(id: number) {
    setDraft(d => ({ ...d, barIds: [...d.barIds, id] }));
    setSearch("");
  }

  function removeBar(id: number) {
    setDraft(d => ({ ...d, barIds: d.barIds.filter(x => x !== id) }));
  }

  function moveBar(idx: number, dir: -1 | 1) {
    const next = [...draft.barIds];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setDraft(d => ({ ...d, barIds: next }));
  }

  async function handleGenerate(preset: Preset) {
    setGenError("");
    try {
      const result = await generateMut.mutateAsync({
        preset,
        area: preset === "area" ? areaFilter : undefined,
        maxStops: 6,
      });
      setDraft(d => ({ ...d, barIds: result.barIds, name: d.name || result.name, tags: result.tags, generatedBy: "auto" }));
    } catch (e: any) {
      setGenError(e.message ?? "Generation failed");
    }
  }

  async function handleSave() {
    if (!draft.name.trim()) return;
    const result = await createMut.mutateAsync({
      name: draft.name,
      description: draft.description || undefined,
      barIds: draft.barIds,
      authorName: draft.authorName || undefined,
      tags: draft.tags,
      generatedBy: draft.generatedBy,
    });
    setDraft(d => ({ ...d, shareCode: result.shareCode }));
    setView("preview");
  }

  function handleStartSolo() {
    setIsHost(true);
    setGroupCode(null);
    setActiveStopIdx(0);
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ draft, activeStopIdx: 0, isHost: true, isGroup: false }));
    setView("active");
  }

  async function handleStartGroup() {
    if (!draft.shareCode) return;
    const { groupCode: gc } = await startGroupMut.mutateAsync({ shareCode: draft.shareCode });
    setGroupCode(gc);
    setIsHost(true);
    setActiveStopIdx(0);
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ draft, activeStopIdx: 0, isHost: true, isGroup: true, groupCode: gc }));
    setView("active");
  }

  async function handleJoinGroup() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    try {
      const result = await joinGroupMut.mutateAsync({ groupCode: code });
      const joinedBarIds = JSON.parse(result.barIds) as number[];
      setDraft(d => ({ ...d, name: result.name, barIds: joinedBarIds, shareCode: result.shareCode }));
      setGroupCode(code);
      setIsHost(false);
      setActiveStopIdx(result.activeStopIndex);
      setView("active");
    } catch (e: any) {
      setGenError(e.message ?? "Could not join group");
    }
  }

  async function handleAdvance() {
    if (currentStopIdx >= stopBars.length - 1) {
      if (groupCode && isHost) await endGroupMut.mutateAsync({ groupCode });
      localStorage.removeItem(ACTIVE_KEY);
      setView("done");
      return;
    }
    if (groupCode && isHost) {
      const result = await advanceMut.mutateAsync({ groupCode });
      setActiveStopIdx(result.activeStopIndex);
    } else {
      setActiveStopIdx(i => i + 1);
    }
  }

  async function handleSubmitCommunity() {
    if (!draft.shareCode) return;
    await submitMut.mutateAsync({ shareCode: draft.shareCode });
    setSubmitMsg("Submitted! It'll appear in Discover once approved.");
  }

  function handleCopy(text: string) {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startFromShared() {
    if (!sharedCrawl) return;
    const barIds = JSON.parse(sharedCrawl.barIds) as number[];
    setDraft({ ...EMPTY_DRAFT, name: sharedCrawl.name, description: sharedCrawl.description ?? "", barIds, shareCode: sharedCrawl.shareCode, tags: JSON.parse(sharedCrawl.tags ?? "[]") });
    setView("preview");
  }

  function reset() {
    setDraft(EMPTY_DRAFT);
    setActiveStopIdx(0);
    setGroupCode(null);
    setIsHost(false);
    localStorage.removeItem(ACTIVE_KEY);
    setView("landing");
  }

  /* ── Sub-views ──────────────────────────────────────────── */

  if (barsLoading && view !== "discover") return <LoadingMessage />;

  /* SHARED VIEW */
  if (view === "shared") {
    if (sharedLoading) return <LoadingMessage />;
    if (!sharedCrawl) return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-2">NOT FOUND</div>
        <p className="text-meta opacity-60">This crawl link has expired or doesn't exist.</p>
      </div>
    );
    const sharedBarIds = JSON.parse(sharedCrawl.barIds) as number[];
    const sharedBars = sharedBarIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars;
    const sharedStats = crawlStats(sharedBars);
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-4">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-2">SHARED CRAWL</div>
          <h1 className="text-hero text-[var(--color-paper)] mb-1">{sharedCrawl.name.toUpperCase()}</h1>
          {sharedCrawl.description && <p className="text-meta text-[var(--color-paper)] opacity-60 mb-3">{sharedCrawl.description}</p>}
          <div className="text-eyebrow opacity-50">{sharedBars.length} STOPS · {sharedStats.distanceKm.toFixed(1)} KM · ~{formatDuration(sharedStats.durationMin)}</div>
        </section>
        <MapsButtons stops={sharedBars} />
        <section className="px-4 pb-4">
          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">ROUTE</div>
          {sharedBars.map((bar, i) => <StopRow key={bar.id} bar={bar} idx={i} currency={currency} />)}
        </section>
        <div className="px-4 pb-6">
          <button onClick={startFromShared} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">
            START THIS CRAWL →
          </button>
        </div>
      </div>
    );
  }

  /* JOIN VIEW */
  if (view === "join") {
    return (
      <div className="grain-ink max-w-md mx-auto px-4 pt-6">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-2">JOIN A GROUP CRAWL</div>
        <h1 className="text-hero text-[var(--color-paper)] mb-6">ENTER<br/>GROUP<br/><span className="text-[var(--color-blaze)]">CODE</span></h1>
        <input
          value={joinCodeInput}
          onChange={e => { setJoinCodeInput(e.target.value.toUpperCase()); setGenError(""); }}
          placeholder="ABC123"
          maxLength={6}
          className="w-full bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-3xl text-center tracking-[0.3em] py-4 mb-4 focus:outline-none focus:border-[var(--color-blaze)]"
        />
        {genError && <p className="text-meta text-[var(--color-blaze)] mb-3">{genError}</p>}
        <button
          onClick={handleJoinGroup}
          disabled={joinCodeInput.length !== 6 || joinGroupMut.isPending}
          className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-40"
        >
          {joinGroupMut.isPending ? "JOINING..." : "JOIN CRAWL →"}
        </button>
        <button onClick={() => setView("landing")} className="w-full mt-2 text-meta opacity-50 py-2">← BACK</button>
      </div>
    );
  }

  /* LANDING VIEW */
  if (view === "landing") {
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-6">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-3">DISPATCH 04 · PUB CRAWLS</div>
          <h1 className="text-hero text-[var(--color-paper)] mb-6">
            EXPLORE<br/><span className="text-[var(--color-blaze)]">BELFAST</span><br/>YOUR WAY
          </h1>
          <button onClick={() => setView("building")} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider mb-3">
            BUILD A CRAWL →
          </button>
          <button onClick={() => setView("discover")} className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider mb-3 hover:border-[var(--color-blaze)]">
            DISCOVER CRAWLS
          </button>
          <div className="hairline-t pt-4 mt-2">
            <div className="text-eyebrow opacity-50 mb-2">JOINING A GROUP?</div>
            <div className="flex gap-2">
              <input
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                maxLength={6}
                className="flex-1 bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] font-mono text-base px-3 py-2 tracking-[0.2em] focus:outline-none focus:border-[var(--color-blaze)]"
              />
              <button
                onClick={() => { if (joinCodeInput.length === 6) handleJoinGroup(); }}
                disabled={joinCodeInput.length !== 6}
                className="bg-[var(--color-blaze)] text-[var(--color-paper)] px-4 font-display text-sm tracking-wider disabled:opacity-40"
              >
                JOIN
              </button>
            </div>
            {genError && <p className="text-meta text-[var(--color-blaze)] mt-2">{genError}</p>}
          </div>
        </section>
      </div>
    );
  }

  /* BUILDER VIEW */
  if (view === "building") {
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-3">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-3">BUILD YOUR CRAWL</div>
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Name your crawl"
            className="w-full bg-transparent border-b border-[var(--color-rule)] text-[var(--color-paper)] font-display text-2xl py-2 mb-2 focus:outline-none focus:border-[var(--color-blaze)] placeholder:opacity-30"
          />
          <textarea
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="Description (optional)"
            rows={2}
            className="w-full bg-transparent border-b border-[var(--color-rule)] text-[var(--color-paper)] text-meta py-2 mb-4 focus:outline-none focus:border-[var(--color-blaze)] placeholder:opacity-30 resize-none"
          />

          {/* Auto-generate */}
          <div className="hairline-b pb-1.5 mb-3 flex items-baseline justify-between">
            <div className="font-display text-base text-[var(--color-paper)]">AUTO-GENERATE</div>
            <div className="text-eyebrow opacity-40">PICK A PRESET</div>
          </div>
          <div className="flex flex-wrap gap-2 mb-1">
            {PRESETS.filter(p => p.id !== "area").map(p => (
              <button
                key={p.id}
                onClick={() => handleGenerate(p.id)}
                disabled={generateMut.isPending}
                className="text-eyebrow border border-[var(--color-rule)] text-[var(--color-paper)] px-2.5 py-1.5 hover:border-[var(--color-blaze)] hover:text-[var(--color-blaze)] disabled:opacity-40 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <select
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              className="flex-1 bg-transparent border border-[var(--color-rule)] text-[var(--color-paper)] text-meta px-2 py-1.5 focus:outline-none focus:border-[var(--color-blaze)]"
            >
              <option value="">Area crawl — pick area</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              onClick={() => { if (areaFilter) handleGenerate("area"); }}
              disabled={!areaFilter || generateMut.isPending}
              className="text-eyebrow border border-[var(--color-rule)] text-[var(--color-paper)] px-3 py-1.5 hover:border-[var(--color-blaze)] disabled:opacity-40"
            >
              GO
            </button>
          </div>
          {genError && <p className="text-meta text-[var(--color-blaze)] mb-3">{genError}</p>}

          {/* Selected stops */}
          {draft.barIds.length > 0 && (
            <>
              <div className="hairline-b pb-1.5 mb-2 flex items-baseline justify-between">
                <div className="font-display text-base text-[var(--color-paper)]">YOUR STOPS</div>
                <div className="text-eyebrow opacity-40">{draft.barIds.length} ADDED · {stats.distanceKm.toFixed(1)} KM · ~{formatDuration(stats.durationMin)}</div>
              </div>
              <ul className="mb-4">
                {stopBars.map((bar, i) => (
                  <li key={bar.id} className="flex items-center gap-2 hairline-b-soft py-2">
                    <span className="num-rail text-[var(--color-blaze)] w-6 text-eyebrow">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-sm uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
                      <div className="text-meta opacity-50">{bar.area}</div>
                    </div>
                    <button onClick={() => moveBar(i, -1)} disabled={i === 0} className="p-1 opacity-40 hover:opacity-100 disabled:opacity-20"><ChevronUp size={14} /></button>
                    <button onClick={() => moveBar(i, 1)} disabled={i === stopBars.length - 1} className="p-1 opacity-40 hover:opacity-100 disabled:opacity-20"><ChevronDown size={14} /></button>
                    <button onClick={() => removeBar(bar.id)} className="p-1 opacity-40 hover:opacity-100 text-[var(--color-blaze)]"><X size={14} /></button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Typeahead search */}
          <div className="relative mb-4">
            <div className="flex items-center gap-2 border border-[var(--color-rule)] px-3 py-2 focus-within:border-[var(--color-blaze)]">
              <Search size={14} className="opacity-40 shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search bars to add…"
                className="flex-1 bg-transparent text-[var(--color-paper)] text-meta focus:outline-none placeholder:opacity-40"
              />
            </div>
            {filteredBars.length > 0 && (
              <ul className="border border-[var(--color-rule)] border-t-0">
                {filteredBars.map(bar => (
                  <li key={bar.id}>
                    <button
                      onClick={() => addBar(bar.id)}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between hairline-b-soft hover:bg-[var(--color-blaze)] hover:text-[var(--color-paper)] group"
                    >
                      <div>
                        <div className="font-display text-sm uppercase text-[var(--color-paper)] group-hover:text-[var(--color-paper)]">{bar.name}</div>
                        <div className="text-meta opacity-50">{bar.area}</div>
                      </div>
                      <span className="text-eyebrow opacity-40 group-hover:opacity-100">ADD +</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={draft.barIds.length < 2 || !draft.name.trim() || createMut.isPending}
            className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider disabled:opacity-40 mb-2"
          >
            {createMut.isPending ? "SAVING..." : "SAVE & GET SHARE LINK →"}
          </button>
          <button onClick={() => setView("landing")} className="w-full text-meta opacity-50 py-2 text-center">← BACK</button>
        </section>
      </div>
    );
  }

  /* PREVIEW VIEW */
  if (view === "preview") {
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-4">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-2">CRAWL SAVED</div>
          <h1 className="font-display text-2xl text-[var(--color-paper)] uppercase mb-1">{draft.name}</h1>
          {draft.description && <p className="text-meta text-[var(--color-paper)] opacity-60 mb-2">{draft.description}</p>}
          <div className="text-eyebrow opacity-50 mb-4">{stopBars.length} STOPS · {stats.distanceKm.toFixed(1)} KM · ~{formatDuration(stats.durationMin)}</div>

          <MapsButtons stops={stopBars} />

          {/* Share */}
          {shareUrl && (
            <div className="border border-[var(--color-rule)] p-3 mb-4">
              <div className="text-eyebrow opacity-50 mb-1">SHARE LINK</div>
              <div className="flex items-center gap-2">
                <span className="text-meta text-[var(--color-paper)] opacity-60 truncate flex-1 font-mono text-xs">{shareUrl}</span>
                <button onClick={() => handleCopy(shareUrl)} className="p-1.5 border border-[var(--color-rule)] hover:border-[var(--color-blaze)]">
                  {copied ? <span className="text-eyebrow text-[var(--color-verified)]">✓</span> : <Copy size={13} />}
                </button>
                <button onClick={() => nativeShare(draft.name, shareUrl)} className="p-1.5 border border-[var(--color-rule)] hover:border-[var(--color-blaze)]">
                  <Share2 size={13} />
                </button>
              </div>
            </div>
          )}

          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">ROUTE</div>
          {stopBars.map((bar, i) => <StopRow key={bar.id} bar={bar} idx={i} currency={currency} />)}
        </section>

        <div className="px-4 pb-2 flex flex-col gap-2">
          <button onClick={handleStartSolo} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">
            START SOLO CRAWL →
          </button>
          <button onClick={handleStartGroup} disabled={!draft.shareCode || startGroupMut.isPending} className="w-full border border-[var(--color-blaze)] text-[var(--color-blaze)] font-display text-base py-3 tracking-wider disabled:opacity-40">
            <Users size={15} className="inline mr-2 mb-0.5" />
            {startGroupMut.isPending ? "STARTING..." : "START GROUP CRAWL"}
          </button>
          {!submitMsg ? (
            <button onClick={handleSubmitCommunity} disabled={!draft.shareCode || submitMut.isPending} className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-sm py-2.5 tracking-wider hover:border-[var(--color-blaze)] disabled:opacity-40">
              {submitMut.isPending ? "SUBMITTING..." : "SUBMIT TO COMMUNITY →"}
            </button>
          ) : (
            <p className="text-meta text-[var(--color-verified)] text-center py-2">{submitMsg}</p>
          )}
          <button onClick={() => setView("building")} className="text-meta opacity-50 py-2 text-center">← EDIT CRAWL</button>
        </div>
      </div>
    );
  }

  /* ACTIVE VIEW (solo + group host + group guest) */
  if (view === "active") {
    const currentBar = stopBars[currentStopIdx];
    const nextBar = stopBars[currentStopIdx + 1];
    const isLastStop = currentStopIdx >= stopBars.length - 1;
    const isGuest = !!groupCode && !isHost;
    const participants = groupState?.participantCount ?? 1;

    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-5">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-1">
            STOP {currentStopIdx + 1} OF {stopBars.length} · {currentBar?.area?.toUpperCase()}
          </div>
          {groupCode && (
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5 text-eyebrow opacity-60">
                <Users size={12} />{participants} {participants === 1 ? "PERSON" : "PEOPLE"}
              </div>
              <div className="flex items-center gap-1.5 border border-[var(--color-rule)] px-2 py-1">
                <span className="text-eyebrow text-[var(--color-paper)] opacity-50">CODE</span>
                <span className="font-mono text-sm text-[var(--color-paper)] tracking-widest">{groupCode}</span>
                <button onClick={() => handleCopy(groupCode)} className="opacity-50 hover:opacity-100"><Copy size={11} /></button>
              </div>
              {groupUrl && (
                <button onClick={() => nativeShare(`Join ${draft.name}`, groupUrl)} className="opacity-50 hover:opacity-100">
                  <Share2 size={13} />
                </button>
              )}
            </div>
          )}

          {/* Current stop — blaze block */}
          <div className="grain-blaze text-[var(--color-paper)] mx-0 mb-4 px-4 py-4">
            <div className="text-eyebrow opacity-80 mb-1">NOW AT</div>
            <div className="font-display text-2xl uppercase leading-none mb-1">{currentBar?.name}</div>
            {(() => {
              const beers = (currentBar?.drinks ?? []).filter(d => /pint|beer|lager|guinness|harp|tennent|stella|ipa/i.test(d.name));
              const cheapest = beers.reduce<typeof beers[0] | null>((min, d) => !min || d.price < min.price ? d : min, null);
              return cheapest ? (
                <div className="text-meta opacity-80">{cheapest.name.toUpperCase()} · {formatPrice(cheapest.price, currency)}</div>
              ) : null;
            })()}
          </div>

          {/* Maps buttons */}
          <MapsButtons stops={stopBars} compact />

          {/* Route list */}
          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">YOUR ROUTE</div>
          <ul className="mb-4">
            {stopBars.map((bar, i) => (
              <li key={bar.id} className="flex items-center gap-3 hairline-b-soft py-2.5">
                <span className={`num-rail w-6 text-eyebrow ${i < currentStopIdx ? "text-[var(--color-verified)]" : i === currentStopIdx ? "text-[var(--color-blaze)]" : "text-[var(--color-paper)] opacity-40"}`}>
                  {i < currentStopIdx ? "✓" : String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`font-display text-sm uppercase truncate ${i < currentStopIdx ? "text-[var(--color-paper)] opacity-40" : "text-[var(--color-paper)]"}`}>
                    {bar.name}
                  </div>
                  {i > currentStopIdx && (
                    <div className="text-meta opacity-50">
                      {i === currentStopIdx + 1 ? `${haversineKm(stopBars[currentStopIdx], bar).toFixed(1)} KM` : bar.area?.toUpperCase()}
                    </div>
                  )}
                </div>
                {i === currentStopIdx + 1 && (() => {
                  const beers = (bar.drinks ?? []).filter(d => /pint|beer|lager|guinness|harp|tennent|stella|ipa/i.test(d.name));
                  const cheapest = beers.reduce<typeof beers[0] | null>((min, d) => !min || d.price < min.price ? d : min, null);
                  return cheapest ? <div className="font-display text-base text-[var(--color-sun)]">{formatPrice(cheapest.price, currency)}</div> : null;
                })()}
              </li>
            ))}
          </ul>
        </section>

        <div className="px-4 pb-6">
          {isGuest ? (
            <div className="border border-[var(--color-rule)] text-center py-3 text-meta opacity-60">
              WAITING FOR HOST TO ADVANCE…
            </div>
          ) : (
            <button
              onClick={handleAdvance}
              disabled={advanceMut.isPending || endGroupMut.isPending}
              className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider"
            >
              {isLastStop ? "FINISH CRAWL ✓" : `NEXT STOP → ${nextBar?.name.toUpperCase()}`}
            </button>
          )}
          <button onClick={reset} className="w-full text-meta opacity-40 py-2 text-center mt-1">ABANDON CRAWL</button>
        </div>
      </div>
    );
  }

  /* DONE VIEW */
  if (view === "done") {
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-4">
          <div className="text-eyebrow text-[var(--color-verified)] mb-2">CRAWL COMPLETE</div>
          <h1 className="text-hero text-[var(--color-paper)] mb-1">
            WELL<br/><span className="text-[var(--color-blaze)]">DONE</span>
          </h1>
          <div className="text-eyebrow opacity-50 mb-6">{stopBars.length} STOPS · {stats.distanceKm.toFixed(1)} KM WALKED</div>
          <div className="hairline-b pb-1.5 mb-2 font-display text-base text-[var(--color-paper)]">RECAP</div>
          {stopBars.map((bar, i) => <StopRow key={bar.id} bar={bar} idx={i} currency={currency} done />)}
        </section>
        <div className="px-4 pb-6 flex flex-col gap-2">
          <button onClick={() => { setDraft(EMPTY_DRAFT); setActiveStopIdx(0); setView("building"); }} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">
            BUILD ANOTHER CRAWL →
          </button>
          <button onClick={reset} className="w-full border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-sm py-2.5 tracking-wider hover:border-[var(--color-blaze)]">
            BACK TO CRAWLS
          </button>
        </div>
      </div>
    );
  }

  /* DISCOVER VIEW */
  if (view === "discover") {
    return (
      <div className="grain-ink max-w-md mx-auto">
        <section className="px-4 pt-6 pb-4">
          <div className="text-eyebrow text-[var(--color-blaze)] mb-2">DISPATCH 04 · DISCOVER</div>
          <h1 className="text-hero text-[var(--color-paper)] mb-6">COMMUNITY<br/><span className="text-[var(--color-blaze)]">CRAWLS</span></h1>
          {!publishedCrawls || publishedCrawls.length === 0 ? (
            <div className="py-12 text-center text-meta opacity-50">
              <MapPin size={24} className="mx-auto mb-3 opacity-30" />
              No community crawls yet. Build one and submit it.
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
                          {barIds.length} STOPS · {cs.distanceKm.toFixed(1)} KM
                          {crawl.authorName ? ` · BY ${crawl.authorName.toUpperCase()}` : ""}
                        </div>
                        {crawl.description && <div className="text-meta opacity-50 mt-0.5 truncate">{crawl.description}</div>}
                      </div>
                      <button
                        onClick={() => navigate(`/crawl/c/${crawl.shareCode}`)}
                        className="text-eyebrow text-[var(--color-blaze)] flex items-center gap-0.5 shrink-0"
                      >
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
          <button onClick={() => setView("building")} className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-base py-3 tracking-wider">
            BUILD YOUR OWN →
          </button>
          <button onClick={() => setView("landing")} className="text-meta opacity-50 py-2 text-center">← BACK</button>
        </div>
      </div>
    );
  }

  return null;
}

/* ── Shared sub-components ───────────────────────────────── */

function StopRow({ bar, idx, currency, done }: {
  bar: { id: number; name: string; area?: string | null; drinks?: Array<{ name: string; price: number; currency: string }> };
  idx: number; currency: string; done?: boolean;
}) {
  const beers = (bar.drinks ?? []).filter(d => /pint|beer|lager|guinness|harp|tennent|stella|ipa/i.test(d.name));
  const cheapest = beers.reduce<typeof beers[0] | null>((min, d) => !min || d.price < min.price ? d : min, null);
  return (
    <div className="flex items-center gap-3 hairline-b-soft py-2.5">
      <span className={`num-rail w-6 text-eyebrow ${done ? "text-[var(--color-verified)]" : "text-[var(--color-blaze)]"}`}>
        {done ? "✓" : String(idx + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
        <div className="text-meta opacity-50">{bar.area?.toUpperCase()}</div>
      </div>
      {cheapest && (
        <div className="font-display text-base text-[var(--color-sun)]">{formatPrice(cheapest.price, currency)}</div>
      )}
    </div>
  );
}

function MapsButtons({ stops, compact }: {
  stops: Array<{ lat: number; lng: number; name: string }>;
  compact?: boolean;
}) {
  if (stops.length < 2) return null;
  const googleUrl = buildGoogleMapsUrl(stops);
  const appleUrl = buildAppleMapsUrl(stops);
  const overLimit = stops.length > 10;

  return (
    <div className={`flex gap-2 ${compact ? "mb-3" : "mb-4"}`}>
      <a
        href={googleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 border border-[var(--color-rule)] text-[var(--color-paper)] text-eyebrow py-2.5 text-center hover:border-[var(--color-blaze)] flex items-center justify-center gap-1.5"
      >
        <MapPin size={12} aria-hidden /> GOOGLE MAPS
      </a>
      <a
        href={appleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 border border-[var(--color-rule)] text-[var(--color-paper)] text-eyebrow py-2.5 text-center hover:border-[var(--color-blaze)] flex items-center justify-center gap-1.5"
      >
        <MapPin size={12} aria-hidden /> APPLE MAPS
      </a>
      {overLimit && (
        <div className="w-full text-meta opacity-40 text-center -mt-2 pb-1">
          Google Maps shows first 10 stops only
        </div>
      )}
    </div>
  );
}
