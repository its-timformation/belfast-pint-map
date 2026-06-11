import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronLeft, Trash2, Edit2, ChevronDown, ChevronUp, X, Upload, Search, Plus } from "lucide-react";
import { trpc } from "../lib/trpc";
import { GroupedList } from "./admin/GroupedList";
import { DrinkNameInput } from "./DrinkNameInput";
import { SizeSelect } from "./SizeSelect";
import { detectDrinkType, DRINK_TYPE_LABELS, DRINK_TYPE_ORDER, parseSizeValue } from "../lib/detectDrinkType";

interface Props { onBack: () => void; }

type SortMode = 'NAME' | 'AREA' | 'TYPE';

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

function SortPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 min-h-[44px] px-3 text-meta uppercase transition-colors ${active ? 'border border-[var(--color-blaze)] text-[var(--color-blaze)]' : 'border border-[var(--color-rule)] text-[var(--color-paper)] opacity-60'}`}>
      {label}
    </button>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 min-h-[44px] px-3 text-meta uppercase transition-colors ${active ? 'bg-[var(--color-blaze)] text-[var(--color-paper)]' : 'border border-[var(--color-rule)] text-[var(--color-paper)] opacity-60'}`}>
      {label}
    </button>
  );
}

function SectionHeading({ groupKey, count }: { groupKey: string; count: number }) {
  return (
    <div className="sticky top-0 z-10 bg-[var(--color-ink)] border-l-2 border-[var(--color-blaze)] font-display text-sm uppercase px-3 py-2 text-[var(--color-blaze)] flex items-center justify-between">
      <span>{groupKey}</span>
      <span className="font-mono text-xs opacity-50">{count}</span>
    </div>
  );
}


/* ── AddBarForm ──────────────────────────────────────────────── */
function AddBarForm({ onCreated, areas }: { onCreated: () => void; areas: string[] }) {
  const createBar = trpc.admin.createBar.useMutation({ onSuccess: () => { onCreated(); setForm(BLANK); setOpen(false); } });
  const resolveMap = trpc.admin.resolveMapLink.useMutation();
  const [open, setOpen] = useState(false);
  const BLANK = { name: '', type: 'bar', area: '', address: '', lat: 0, lng: 0, openingHours: '', websiteUrl: '', phoneNumber: '', googleMapsUrl: '', servesGuinness: false, businessStatus: '', rating: null as number | null };
  const [form, setForm] = useState(BLANK);
  const [mapInput, setMapInput] = useState('');
  const [mapStep, setMapStep] = useState<'idle' | 'resolving' | 'success' | 'error'>('idle');
  const [mapMessage, setMapMessage] = useState('');

  const [openTime = '12:00', closeTime = '23:00'] = (form.openingHours || '12:00-23:00').split('-');

  function applyResult(url: string, result: any) {
    setForm((f: any) => ({
      ...f,
      lat: result.lat,
      lng: result.lng,
      googleMapsUrl: result.googleMapsUrl || url,
      ...(result.placeName ? { name: result.placeName } : {}),
      ...(result.websiteUrl ? { websiteUrl: result.websiteUrl } : {}),
      ...(result.phoneNumber ? { phoneNumber: result.phoneNumber } : {}),
      ...(result.openingHours ? { openingHours: result.openingHours } : {}),
      ...(result.address ? { address: result.address } : {}),
      ...(result.businessStatus ? { businessStatus: result.businessStatus } : {}),
      ...(result.rating != null ? { rating: result.rating } : {}),
    }));
    const parts = [
      `✓ ${(result.placeName || 'LOCATION').toUpperCase()} FOUND`,
      `${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`,
      result.websiteUrl ? '· WEBSITE' : '',
      result.phoneNumber ? '· PHONE' : '',
      result.openingHours ? '· HOURS' : '',
      result.rating ? `· ${result.rating}★` : '',
    ].filter(Boolean).join(' ');
    setMapStep('success');
    setMapMessage(parts);
    setMapInput('');
    setTimeout(() => setMapStep('idle'), 6000);
  }

  async function handlePaste(pasted: string) {
    const url = pasted.trim();
    if (!url || !url.match(/google\.com\/maps|maps\.app\.goo\.gl|maps\.google\.com/i)) {
      setMapStep('error');
      setMapMessage("This doesn't look like a Google Maps link.");
      return;
    }
    setMapStep('resolving');
    setMapMessage('FINDING LOCATION...');
    try {
      const result = await resolveMap.mutateAsync({ url });
      applyResult(result.finalUrl, result);
    } catch (e: any) {
      setMapStep('error');
      setMapMessage(e?.message || 'COULD NOT READ LINK');
    }
  }

  if (!open) {
    return (
      <div className="px-3 mb-4">
        <button
          onClick={() => setOpen(true)}
          className="w-full border border-[var(--color-blaze)] text-[var(--color-blaze)] font-display uppercase py-3 flex items-center justify-center gap-2 hover:bg-[var(--color-blaze)] hover:text-[var(--color-paper)] transition-colors"
        >
          + ADD NEW BAR
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 mb-4">
      <div className="border border-[var(--color-blaze)] p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-eyebrow text-[var(--color-blaze)]">NEW BAR</span>
          <button onClick={() => { setOpen(false); setForm(BLANK); }} className="text-meta opacity-60 min-h-[44px] px-2">CANCEL</button>
        </div>

        {/* Maps paste field at top */}
        <div className="space-y-1.5">
          <div className="text-eyebrow opacity-60">GOOGLE MAPS LINK — AUTO-FILLS EVERYTHING BELOW</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={mapInput}
              onChange={e => setMapInput(e.target.value)}
              onPaste={e => { const p = e.clipboardData.getData('text'); e.preventDefault(); setMapInput(p); setTimeout(() => handlePaste(p), 0); }}
              placeholder="Paste a Google Maps link to auto-fill"
              className="flex-1 bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 text-[var(--color-paper)] text-sm"
              disabled={mapStep === 'resolving'}
            />
            <button
              type="button"
              onClick={() => handlePaste(mapInput)}
              disabled={!mapInput.trim() || mapStep === 'resolving'}
              className="shrink-0 border border-[var(--color-rule)] px-3 py-2.5 text-meta disabled:opacity-30 hover:border-[var(--color-blaze)] transition-colors"
            >
              {mapStep === 'resolving' ? '…' : 'USE'}
            </button>
          </div>
          {mapStep === 'resolving' && <div className="text-meta opacity-60 animate-pulse">{mapMessage}</div>}
          {mapStep === 'success' && <div className="text-meta text-[var(--color-verified)]">{mapMessage}</div>}
          {mapStep === 'error' && <div className="text-meta text-[var(--color-blaze)]">{mapMessage}</div>}
        </div>

        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="Bar name" className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px]" />

        <AreaCombo value={form.area} onChange={v => setForm({ ...form, area: v })} areas={areas} />

        <div className="flex gap-2">
          <div className="flex-1">
            <div className="text-meta opacity-60 mb-1">OPENS</div>
            <select value={openTime} onChange={e => setForm({ ...form, openingHours: `${e.target.value}-${closeTime}` })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px]">
              {TIME_OPTIONS.map(t => <option key={t} value={t} className="bg-[var(--color-ink)]">{t}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <div className="text-meta opacity-60 mb-1">CLOSES</div>
            <select value={closeTime} onChange={e => setForm({ ...form, openingHours: `${openTime}-${e.target.value}` })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px]">
              {TIME_OPTIONS.map(t => <option key={t} value={t} className="bg-[var(--color-ink)]">{t}</option>)}
            </select>
          </div>
        </div>

        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
          className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px]">
          {['bar', 'pub', 'restaurant-bar', 'club', 'brewery', 'taproom'].map(t => <option key={t} value={t} className="bg-[var(--color-ink)]">{t}</option>)}
        </select>

        <label className="flex items-center gap-2 py-2 cursor-pointer">
          <input type="checkbox" checked={form.servesGuinness} onChange={e => setForm({ ...form, servesGuinness: e.target.checked })} className="w-4 h-4" />
          <span className="text-meta">POURS GUINNESS</span>
        </label>

        <input value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })}
          placeholder="Website URL (auto-filled)" className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm" />

        <div className="flex gap-2">
          <div className="flex-1">
            <div className="text-meta opacity-60 mb-1">LAT</div>
            <input type="number" step="0.00001" value={form.lat || ''} onChange={e => setForm({ ...form, lat: parseFloat(e.target.value) })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2" />
          </div>
          <div className="flex-1">
            <div className="text-meta opacity-60 mb-1">LNG</div>
            <input type="number" step="0.00001" value={form.lng || ''} onChange={e => setForm({ ...form, lng: parseFloat(e.target.value) })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2" />
          </div>
        </div>

        <button
          onClick={() => {
            if (!form.name || !form.lat || !form.lng) return alert('Name and coordinates are required.');
            createBar.mutate({
              name: form.name,
              type: form.type,
              area: form.area || undefined,
              address: form.address || undefined,
              lat: form.lat,
              lng: form.lng,
              openingHours: form.openingHours || undefined,
              servesGuinness: form.servesGuinness,
              googleMapsUrl: form.googleMapsUrl || null,
              websiteUrl: form.websiteUrl || null,
              phoneNumber: form.phoneNumber || null,
              rating: form.rating ?? null,
              businessStatus: form.businessStatus || null,
            });
          }}
          disabled={createBar.isPending}
          className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] py-3 font-display uppercase disabled:opacity-50"
        >
          {createBar.isPending ? 'CREATING…' : 'CREATE BAR'}
        </button>
      </div>
    </div>
  );
}

/* ── BarsManager ─────────────────────────────────────────────── */
export default function BarsManager({ onBack }: Props) {
  const { data: bars, refetch } = trpc.bars.getAll.useQuery();
  const deleteBar = trpc.admin.deleteBar.useMutation({ onSuccess: () => refetch() });
  const refreshAll = trpc.admin.refreshAllBars.useMutation();
  const [refreshResult, setRefreshResult] = useState<any>(null);

  const [expandedBar, setExpandedBar] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('NAME');
  const [areaFilters, setAreaFilters] = useState<Set<string>>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDropdownOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const uniqueAreas = useMemo(() =>
    [...new Set((bars || []).map(b => b.area).filter(Boolean))].sort() as string[]
  , [bars]);

  const uniqueTypes = useMemo(() =>
    [...new Set((bars || []).map(b => b.type).filter(Boolean))].sort() as string[]
  , [bars]);

  const filteredBars = useMemo(() => {
    let result = [...(bars || [])];
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(b =>
        b.name.toLowerCase().includes(q) ||
        (b.area && b.area.toLowerCase().includes(q)) ||
        (b.type && b.type.toLowerCase().includes(q)) ||
        (b.address && b.address.toLowerCase().includes(q))
      );
    }
    if (areaFilters.size > 0) result = result.filter(b => b.area && areaFilters.has(b.area));
    if (typeFilters.size > 0) result = result.filter(b => b.type && typeFilters.has(b.type));
    return result;
  }, [bars, query, areaFilters, typeFilters]);

  const dropdownResults = useMemo(() => {
    if (query.length < 2) return null;
    const q = query.toLowerCase();
    const all = bars || [];
    const matchBars = all.filter(b => b.name.toLowerCase().includes(q)).slice(0, 5);
    const matchAreas = uniqueAreas.filter(a => a.toLowerCase().includes(q)).slice(0, 5);
    const matchTypes = uniqueTypes.filter(t => t.toLowerCase().includes(q)).slice(0, 5);
    if (!matchBars.length && !matchAreas.length && !matchTypes.length) return null;
    return { bars: matchBars, areas: matchAreas, types: matchTypes };
  }, [bars, query, uniqueAreas, uniqueTypes]);

  const sortFn = (a: any, b: any): number => {
    if (sortMode === 'AREA') return (a.area ?? '').localeCompare(b.area ?? '') || a.name.localeCompare(b.name);
    if (sortMode === 'TYPE') return (a.type ?? '').localeCompare(b.type ?? '') || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  };
  const groupFn: ((item: any) => string) | null =
    sortMode === 'AREA' ? (b: any) => b.area ?? 'Unknown' :
    sortMode === 'TYPE' ? (b: any) => b.type ?? 'Unknown' :
    null;

  const activeChips = [
    ...[...areaFilters].map(a => ({ label: a, remove: () => setAreaFilters(s => toggleSet(s, a)) })),
    ...[...typeFilters].map(t => ({ label: t, remove: () => setTypeFilters(s => toggleSet(s, t)) })),
  ];

  return (
    <div className="grain-ink pb-8 max-w-md mx-auto">
      <div className="px-4 py-3 flex items-center justify-between hairline-b">
        <button onClick={onBack} className="flex items-center gap-1.5 text-meta opacity-70">
          <ChevronLeft size={16} strokeWidth={1.6} />
          ADMIN
        </button>
        <span className="text-meta bg-[var(--color-blaze)] text-[var(--color-paper)] px-2 py-1">SECTION 02</span>
      </div>

      <section className="px-4 pt-5 pb-3">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">
          DIRECTORY · {filteredBars.length.toString().padStart(2, "0")} BARS
        </div>
        <h1 className="text-headline">BARS<br />DIRECTORY</h1>
      </section>

      {/* Add new bar */}
      <AddBarForm onCreated={refetch} areas={uniqueAreas} />

      {/* Search + typeahead */}
      <div className="px-3 mb-2" ref={searchRef}>
        <div className="relative">
          <div className="flex items-center gap-2 border border-[var(--color-rule)] px-3 bg-[var(--color-ink-card)]">
            <Search size={16} strokeWidth={1.6} className="opacity-50 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={e => { setQuery(e.target.value); setDropdownOpen(true); }}
              onFocus={() => { if (query.length >= 2) setDropdownOpen(true); }}
              placeholder="Search bars, areas, types..."
              className="flex-1 bg-transparent py-2.5 focus:outline-none placeholder:opacity-40"
            />
            {query && (
              <button onClick={() => { setQuery(''); setDropdownOpen(false); }} className="opacity-50 min-h-[44px] flex items-center">
                <X size={14} />
              </button>
            )}
          </div>

          {dropdownOpen && dropdownResults && (
            <div className="absolute top-full left-0 right-0 z-50 bg-[var(--color-ink)] border border-[var(--color-rule)] border-t-0 max-h-80 overflow-y-auto">
              {dropdownResults.bars.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-eyebrow opacity-50">BARS</div>
                  {dropdownResults.bars.map((bar: any) => (
                    <button key={bar.id}
                      onClick={() => { setExpandedBar(bar.id); setQuery(''); setDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-[var(--color-ink-card)] flex items-center gap-2"
                    >
                      <span className="font-display text-sm uppercase">{bar.name}</span>
                      {bar.area && <span className="text-meta opacity-50">{bar.area.toUpperCase()}</span>}
                    </button>
                  ))}
                </>
              )}
              {dropdownResults.areas.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-eyebrow opacity-50 border-t border-[var(--color-rule)]">AREAS</div>
                  {dropdownResults.areas.map((area: string) => (
                    <button key={area}
                      onClick={() => { setAreaFilters(s => toggleSet(s, area)); setQuery(''); setDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-[var(--color-ink-card)] text-meta"
                    >
                      {area.toUpperCase()}
                    </button>
                  ))}
                </>
              )}
              {dropdownResults.types.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-eyebrow opacity-50 border-t border-[var(--color-rule)]">TYPES</div>
                  {dropdownResults.types.map((type: string) => (
                    <button key={type}
                      onClick={() => { setTypeFilters(s => toggleSet(s, type)); setQuery(''); setDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-[var(--color-ink-card)] text-meta"
                    >
                      {type.toUpperCase()}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Active chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {activeChips.map((chip, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--color-ink-card)] border border-[var(--color-rule)] font-mono text-xs uppercase">
                {chip.label}
                <button onClick={chip.remove} className="opacity-60 hover:opacity-100"><X size={10} /></button>
              </span>
            ))}
            <button
              onClick={() => { setAreaFilters(new Set()); setTypeFilters(new Set()); }}
              className="text-meta text-xs opacity-40 hover:opacity-70 px-1"
            >
              CLEAR ALL
            </button>
          </div>
        )}
      </div>

      {/* Sort + filter pills */}
      <div className="overflow-x-auto scrollbar-hide mb-3">
        <div className="flex gap-1.5 px-3 pb-1 min-w-max">
          <div className="flex gap-1 pr-2.5 border-r border-[var(--color-rule)] mr-0.5">
            {(['NAME', 'AREA', 'TYPE'] as SortMode[]).map(s => (
              <SortPill key={s} label={s} active={sortMode === s} onClick={() => setSortMode(s)} />
            ))}
          </div>
          {uniqueAreas.map(area => (
            <FilterPill key={area} label={area} active={areaFilters.has(area)} onClick={() => setAreaFilters(s => toggleSet(s, area))} />
          ))}
          {uniqueTypes.length > 0 && <div className="w-px bg-[var(--color-rule)] self-stretch mx-0.5" />}
          {uniqueTypes.map(type => (
            <FilterPill key={type} label={type} active={typeFilters.has(type)} onClick={() => setTypeFilters(s => toggleSet(s, type))} />
          ))}
        </div>
      </div>

      {/* Refresh all bar data */}
      <div className="px-3 mb-1">
        <button
          onClick={async () => {
            if (!confirm('Refresh data for all bars with a Google Maps link? This checks opening hours, status, and contact details. Takes about a minute.')) return;
            setRefreshResult({ loading: true });
            try {
              const result = await refreshAll.mutateAsync();
              setRefreshResult(result);
              refetch();
            } catch (e: any) {
              setRefreshResult({ error: e.message });
            }
          }}
          disabled={refreshAll.isPending}
          className="w-full border border-[var(--color-rule)] py-2.5 text-meta mb-3 hover:border-[var(--color-blaze)] transition-colors disabled:opacity-40"
        >
          {refreshAll.isPending ? 'REFRESHING ALL BARS...' : '↻ REFRESH ALL BAR DATA'}
        </button>

        {refreshResult && !refreshResult.loading && (
          <div className="mb-3 px-3 py-2.5 border border-[var(--color-rule)] text-meta">
            {refreshResult.error ? (
              <span className="text-[var(--color-blaze)]">{refreshResult.error}</span>
            ) : (
              <>
                <div className="text-[var(--color-verified)]">
                  ✓ UPDATED {refreshResult.updated} · FAILED {refreshResult.failed}
                </div>
                {refreshResult.tempClosed > 0 && (
                  <div className="text-[var(--color-sun)] mt-1">
                    ⚠ {refreshResult.tempClosed} TEMPORARILY CLOSED
                  </div>
                )}
                {refreshResult.details?.length > 0 && (
                  <div className="mt-1.5 opacity-60 space-y-0.5">
                    {refreshResult.details.map((d: any, i: number) => (
                      <div key={i}>{d.name}: {d.status}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bar list */}
      <div className="px-3">
        <GroupedList
          items={filteredBars}
          groupBy={groupFn}
          sortItems={sortFn}
          renderSubheading={(key, count) => <SectionHeading key={key} groupKey={key} count={count} />}
          renderItem={(bar: any) => (
            <div className="border border-[var(--color-rule)] mb-3">
              <div className="flex justify-between items-center p-3">
                <button
                  className="flex-1 text-left min-h-[44px] py-1"
                  onClick={() => setExpandedBar(expandedBar === bar.id ? null : bar.id)}
                >
                  <div className="font-display text-base uppercase flex items-center gap-2">
                    {bar.name}
                    {expandedBar === bar.id
                      ? <ChevronUp size={14} strokeWidth={1.6} />
                      : <ChevronDown size={14} strokeWidth={1.6} />}
                  </div>
                  <div className="text-meta opacity-60 mt-0.5">
                    {bar.area?.toUpperCase()}{bar.servesGuinness ? " · POURS GUINNESS" : ""}
                  </div>
                </button>
                <button
                  onClick={() => { if (confirm('Delete bar and all its drinks/deals?')) deleteBar.mutate({ id: bar.id }); }}
                  disabled={deleteBar.isPending}
                  className="p-2 min-h-[44px] min-w-[44px] opacity-60 hover:opacity-100"
                  aria-label="Delete bar"
                >
                  <Trash2 size={14} strokeWidth={1.6} />
                </button>
              </div>
              {expandedBar === bar.id && (
                <div className="p-3 border-t border-[var(--color-rule)] bg-[var(--color-ink-card)] bg-opacity-50">
                  <BarDetailsEditor barId={bar.id} barData={bar} onUpdate={refetch} areas={uniqueAreas} />
                </div>
              )}
            </div>
          )}
          keyExtractor={(bar: any) => bar.id}
        />
        {filteredBars.length === 0 && (
          <div className="text-meta opacity-50 py-8 text-center">NO BARS MATCH</div>
        )}
      </div>
    </div>
  );
}

/* ── Supporting constants ────────────────────────────────────── */

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4).toString().padStart(2, "0");
  const m = ((i % 4) * 15).toString().padStart(2, "0");
  return `${h}:${m}`;
});

/* ── AreaCombo ───────────────────────────────────────────────── */
function AreaCombo({ value, onChange, areas }: { value: string; onChange: (v: string) => void; areas: string[] }) {
  const [mode, setMode] = useState<'select' | 'custom'>(
    value && !areas.includes(value) ? 'custom' : 'select'
  );

  if (mode === 'select') {
    return (
      <select
        value={value || ''}
        onChange={e => {
          if (e.target.value === '__new__') {
            setMode('custom');
            onChange('');
          } else {
            onChange(e.target.value);
          }
        }}
        className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px] text-[var(--color-paper)]"
      >
        <option value="" className="bg-[var(--color-ink)]">Select area…</option>
        {areas.map(a => (
          <option key={a} value={a} className="bg-[var(--color-ink)]">{a}</option>
        ))}
        <option value="__new__" className="bg-[var(--color-ink)]">+ Enter new area…</option>
      </select>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="New area name (e.g. Les Lindarets)"
        autoFocus
        className="flex-1 bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px] text-[var(--color-paper)]"
      />
      <button
        type="button"
        onClick={() => setMode('select')}
        className="text-meta opacity-60 hover:opacity-100 px-3 border border-[var(--color-rule)]"
      >
        ← LIST
      </button>
    </div>
  );
}

/* ── BarDetailsEditor ────────────────────────────────────────── */
function BarDetailsEditor({ barId, barData, onUpdate, areas }: { barId: number; barData: any; onUpdate: () => void; areas: string[] }) {
  const { data: barDetails, refetch } = trpc.bars.getById.useQuery({ id: barId });
  const utils = trpc.useUtils();
  const deleteDrink = trpc.admin.deleteDrink.useMutation({ onSuccess: () => refetch() });
  const deleteDeal = trpc.admin.deleteDeal.useMutation({ onSuccess: () => refetch() });
  const updateBar = trpc.admin.updateBar.useMutation({ onSuccess: () => { refetch(); onUpdate(); } });
  const resolveMap = trpc.admin.resolveMapLink.useMutation();
  const createDrink = trpc.admin.createDrink.useMutation({ onSuccess: () => { refetch(); setAddDrinkOpen(false); setDrinkForm(BLANK_DRINK); } });
  const createBulk = trpc.admin.createDrinksBulk.useMutation();
  const deleteAllDrinks = trpc.admin.deleteAllDrinksForBar.useMutation();
  const createDeal = trpc.admin.createDeal.useMutation({ onSuccess: () => refetch() });

  const BLANK_DRINK = { name: '', size: 'Pint', price: '', currency: 'EUR', drinkType: 'other' };
  const [addDrinkOpen, setAddDrinkOpen] = useState(false);
  const [drinkForm, setDrinkForm] = useState(BLANK_DRINK);

  const BLANK_DEAL = { title: '', type: 'happy_hour', description: '', startTime: '16:00', endTime: '18:00', days: [] as number[] };
  const [addingDeal, setAddingDeal] = useState(false);
  const [dealForm, setDealForm] = useState(BLANK_DEAL);
  const resetDealForm = () => setDealForm(BLANK_DEAL);

  const [importRows, setImportRows] = useState<any[] | null>(null);
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const [importWorking, setImportWorking] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  async function handleCsvFile(file: File) {
    const text = await file.text();
    const { parseMenuCsv } = await import('../lib/parseMenuCsv');
    const { rows, error } = parseMenuCsv(text);
    if (error) { alert(error); return; }
    setImportRows(rows);
    setImportMode('add');
  }

  async function doImport() {
    if (!importRows) return;
    const included = importRows.filter(r => r.include);
    setImportWorking(true);
    try {
      if (importMode === 'replace') {
        await deleteAllDrinks.mutateAsync({ barId });
      }
      await createBulk.mutateAsync({
        barId,
        drinks: included.map(r => ({ name: r.name, size: r.size, price: r.price, currency: r.currency, drinkType: r.drinkType })),
      });
      utils.bars.invalidate();
      refetch();
      setImportRows(null);
    } finally {
      setImportWorking(false);
    }
  }

  function downloadTemplate() {
    const csv = 'name,size,price,currency,type\nMaxi Bière,70CL,11.50,EUR,draft_beer\nPelforth,25CL,4.00,EUR,draft_beer\nGuinness,50CL,9.00,EUR,draft_beer\nVin Rouge,75CL,28.00,EUR,wine\nMojito,,12.00,EUR,cocktail\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const AI_PROMPT = `Read the attached drinks menu image and convert it into a downloadable CSV file with exactly these columns: name, size, price, currency, type

Rules:
- One row per drink. Include a header row.
- When a drink lists multiple sizes/prices, create a separate row for each.
- name — drink name only, no size or price.
- size — volume as shown (e.g. 70CL, 25CL, 4CL). Blank if not shown.
- price — number only, no currency symbol.
- currency — EUR unless clearly shown otherwise. Values: EUR, GBP, CHF.
- type — one of: draft_beer, bottled_beer, canned_beer, wine, cocktail, shot, spirit, vin_chaud, other
- Skip section headings and items without a clear price.
- Output only raw CSV, nothing else — no explanation, no markdown fences.

Output as a downloadable .csv file named after the bar.`;

  const [editingBar, setEditingBar] = useState(false);
  const [barForm, setBarForm] = useState(barData);
  const [uploading, setUploading] = useState(false);
  const [mapStep, setMapStep] = useState<'idle' | 'resolving' | 'success' | 'error'>('idle');
  const [mapInput, setMapInput] = useState('');
  const [mapMessage, setMapMessage] = useState('');

  function applyCoords(url: string, result: any) {
    setBarForm((f: any) => ({
      ...f,
      lat: result.lat,
      lng: result.lng,
      googleMapsUrl: result.googleMapsUrl || url,
      ...(result.websiteUrl && !f.websiteUrl ? { websiteUrl: result.websiteUrl } : {}),
      ...(result.phoneNumber && !f.phoneNumber ? { phoneNumber: result.phoneNumber } : {}),
      ...(result.openingHours && !f.openingHours ? { openingHours: result.openingHours } : {}),
      ...(result.address && !f.address ? { address: result.address } : {}),
      ...(result.placeName && !f.name ? { name: result.placeName } : {}),
    }));

    const parts = [
      `✓ ${(result.placeName || 'LOCATION').toUpperCase()} FOUND`,
      `${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`,
      result.websiteUrl ? '· WEBSITE' : '',
      result.phoneNumber ? '· PHONE' : '',
      result.openingHours ? '· HOURS' : '',
      result.rating ? `· ${result.rating}★` : '',
    ].filter(Boolean).join(' ');

    setMapStep('success');
    setMapMessage(parts);
    setMapInput('');
    setTimeout(() => setMapStep('idle'), 6000);
  }

  async function handleFirstPaste(pasted: string) {
    const url = pasted.trim();
    if (!url) return;
    if (!url.match(/google\.com\/maps|maps\.app\.goo\.gl|maps\.google\.com/i)) {
      setMapStep('error');
      setMapMessage("This doesn't look like a Google Maps link.");
      return;
    }
    setMapStep('resolving');
    setMapMessage('FINDING LOCATION...');
    try {
      const result = await resolveMap.mutateAsync({ url });
      applyCoords(result.finalUrl, result);
    } catch (e: any) {
      setMapStep('error');
      setMapMessage(e?.message || 'COULD NOT READ LINK — try copying the URL from your browser address bar instead.');
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setBarForm({ ...barForm, imageUrl: data.url });
    } catch {
      alert("Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const [openTime = "12:00", closeTime = "23:00"] = (barForm.openingHours || "12:00-23:00").split("-");

  if (!barDetails) return <div className="text-meta opacity-60">Loading details…</div>;

  return (
    <div className="space-y-5">
      <div className="bg-[var(--color-ink-soft)] bg-opacity-50 p-3 border border-[var(--color-rule)]">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-eyebrow opacity-70">BAR DETAILS</h3>
          <button onClick={() => setEditingBar(!editingBar)} className="text-meta text-[var(--color-blaze)] min-h-[44px] flex items-center gap-1 px-2">
            {editingBar ? <X size={12} /> : <Edit2 size={12} />} {editingBar ? 'CANCEL' : 'EDIT'}
          </button>
        </div>

        {editingBar ? (
          <div className="space-y-2">
            <input value={barForm.name} onChange={e => setBarForm({ ...barForm, name: e.target.value })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-3 min-h-[44px]" placeholder="Name" />
            <AreaCombo value={barForm.area || ""} onChange={v => setBarForm({ ...barForm, area: v })} areas={areas} />
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-meta opacity-60 mb-1">OPENS</div>
                <select value={openTime} onChange={e => setBarForm({ ...barForm, openingHours: `${e.target.value}-${closeTime}` })}
                  className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-3 min-h-[44px]">
                  {TIME_OPTIONS.map(t => <option key={t} value={t} className="bg-[var(--color-ink)]">{t}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <div className="text-meta opacity-60 mb-1">CLOSES</div>
                <select value={closeTime} onChange={e => setBarForm({ ...barForm, openingHours: `${openTime}-${e.target.value}` })}
                  className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-3 min-h-[44px]">
                  {TIME_OPTIONS.map(t => <option key={t} value={t} className="bg-[var(--color-ink)]">{t}</option>)}
                </select>
              </div>
            </div>
            <select value={barForm.type} onChange={e => setBarForm({ ...barForm, type: e.target.value })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-3 min-h-[44px]">
              {["bar", "pub", "restaurant-bar", "club", "brewery", "taproom"].map(t => <option key={t} value={t} className="bg-[var(--color-ink)]">{t}</option>)}
            </select>

            <label className="flex items-center gap-2 py-2 cursor-pointer">
              <input type="checkbox" checked={!!barForm.servesGuinness} onChange={e => setBarForm({ ...barForm, servesGuinness: e.target.checked })} className="w-4 h-4" />
              <span className="text-meta">POURS GUINNESS</span>
            </label>

            <div className="space-y-2">
              <label className="block text-eyebrow opacity-60">GOOGLE MAPS LINK</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mapInput}
                  onChange={e => setMapInput(e.target.value)}
                  onPaste={e => {
                    const pasted = e.clipboardData.getData('text');
                    e.preventDefault();
                    setMapInput(pasted);
                    setTimeout(() => handleFirstPaste(pasted), 0);
                  }}
                  placeholder="Paste any Google Maps link or URL"
                  className="flex-1 bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 text-[var(--color-paper)] text-sm"
                  disabled={mapStep === 'resolving'}
                />
                <button
                  type="button"
                  onClick={() => handleFirstPaste(mapInput)}
                  disabled={!mapInput.trim() || mapStep === 'resolving'}
                  className="shrink-0 border border-[var(--color-rule)] px-3 py-2.5 text-meta disabled:opacity-30 hover:border-[var(--color-blaze)] transition-colors"
                >
                  {mapStep === 'resolving' ? '…' : 'USE'}
                </button>
              </div>
              {mapStep === 'resolving' && (
                <div className="text-meta opacity-60 animate-pulse">{mapMessage}</div>
              )}
              {mapStep === 'success' && (
                <div className="text-meta text-[var(--color-verified)]">{mapMessage}</div>
              )}
              {mapStep === 'error' && (
                <div className="text-meta text-[var(--color-blaze)] leading-relaxed">{mapMessage}</div>
              )}
              <div className="text-meta opacity-40">Works with google.com/maps URLs and maps.app.goo.gl share links.</div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-meta opacity-60 mb-1">LAT</div>
                <input type="number" step="0.00001" value={barForm.lat ?? ''} onChange={e => setBarForm({ ...barForm, lat: parseFloat(e.target.value) })}
                  className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2" />
              </div>
              <div className="flex-1">
                <div className="text-meta opacity-60 mb-1">LNG</div>
                <input type="number" step="0.00001" value={barForm.lng ?? ''} onChange={e => setBarForm({ ...barForm, lng: parseFloat(e.target.value) })}
                  className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2" />
              </div>
            </div>

            <input type="text" value={barForm.websiteUrl || ''} onChange={e => setBarForm({ ...barForm, websiteUrl: e.target.value || null })}
              placeholder="Website URL (https://…)" className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm" />

            <label className="flex items-center justify-center gap-2 bg-[var(--color-ink-card)] border border-[var(--color-rule)] cursor-pointer p-2 relative overflow-hidden">
              {uploading ? <span className="animate-pulse text-meta">UPLOADING…</span> : (
                <><Upload size={14} strokeWidth={1.6} /><span className="text-meta">{barForm.imageUrl ? 'CHANGE IMAGE' : 'UPLOAD IMAGE'}</span></>
              )}
              <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            {barForm.imageUrl && <img src={barForm.imageUrl} alt="Preview" className="w-full h-32 object-cover border border-[var(--color-rule)]" />}

            <button
              onClick={() => {
                updateBar.mutate({
                  id: barId, name: barForm.name, area: barForm.area, openingHours: barForm.openingHours,
                  type: barForm.type, lat: barForm.lat, lng: barForm.lng, imageUrl: barForm.imageUrl,
                  address: barForm.address ?? null,
                  servesGuinness: !!barForm.servesGuinness,
                  googleMapsUrl: barForm.googleMapsUrl ?? null,
                  websiteUrl: barForm.websiteUrl ?? null,
                  phoneNumber: barForm.phoneNumber ?? null,
                  rating: barForm.rating ?? null,
                });
                setEditingBar(false);
              }}
              className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] py-2 font-display uppercase mt-2"
            >SAVE BAR</button>
          </div>
        ) : (
          <div className="text-meta opacity-80 space-y-1">
            {barData.imageUrl && <img src={barData.imageUrl} alt={barData.name} className="w-full h-24 object-cover mb-2 opacity-60" />}
            <div><span className="opacity-60">AREA:</span> {barData.area?.toUpperCase()}</div>
            <div><span className="opacity-60">HOURS:</span> {barData.openingHours}</div>
            <div><span className="opacity-60">TYPE:</span> {barData.type?.toUpperCase()}</div>
            <div><span className="opacity-60">GUINNESS:</span> {barData.servesGuinness ? "YES" : "NO"}</div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-eyebrow opacity-70">DRINKS</h3>
          <div className="flex items-center gap-1">
            {(barDetails?.drinks?.length ?? 0) > 0 && (
              <button
                onClick={async () => {
                  if (!confirm(`Delete all ${barDetails!.drinks.length} drinks for this bar? This cannot be undone.`)) return;
                  await deleteAllDrinks.mutateAsync({ barId });
                  utils.bars.invalidate();
                  refetch();
                }}
                className="text-meta text-[var(--color-blaze)] opacity-50 hover:opacity-100 min-h-[44px] px-2"
              >
                DELETE ALL
              </button>
            )}
            <button
              onClick={() => csvInputRef.current?.click()}
              className="flex items-center gap-1 text-meta text-[var(--color-paper)] opacity-60 hover:opacity-100 min-h-[44px] px-2"
            >
              ↑ IMPORT CSV
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv,.txt"
              className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }}
            />
            <button
              onClick={() => { setAddDrinkOpen(!addDrinkOpen); setDrinkForm(BLANK_DRINK); }}
              className="flex items-center gap-1 text-meta text-[var(--color-blaze)] min-h-[44px] px-2"
            >
              {addDrinkOpen ? <X size={12} /> : <Plus size={12} />}
              {addDrinkOpen ? 'CANCEL' : 'ADD DRINK'}
            </button>
          </div>
        </div>

        {importRows && (
          <div className="mb-3 border border-[var(--color-rule)] bg-[var(--color-ink-card)] bg-opacity-50">
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--color-rule)]">
              <span className="text-eyebrow text-[var(--color-blaze)]">CSV IMPORT REVIEW</span>
              <button onClick={() => setImportRows(null)} className="text-meta opacity-50 hover:opacity-100 min-h-[44px] px-2">CANCEL</button>
            </div>

            {/* Mode toggle */}
            <div className="px-3 py-2 border-b border-[var(--color-rule)] space-y-1.5">
              <div className="flex gap-2">
                {(['add', 'replace'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setImportMode(mode)}
                    className={`flex-1 py-2 text-meta uppercase border transition-colors ${importMode === mode ? 'border-[var(--color-blaze)] text-[var(--color-blaze)]' : 'border-[var(--color-rule)] opacity-50'}`}
                  >
                    {mode === 'add' ? 'ADD TO EXISTING' : 'REPLACE ALL'}
                  </button>
                ))}
              </div>
              {importMode === 'replace' && (
                <div className="text-meta text-[var(--color-blaze)] opacity-80">
                  ⚠ This deletes all current drinks for this bar first.
                </div>
              )}
            </div>

            {/* Format hint */}
            <div className="px-3 py-2 border-b border-[var(--color-rule)] space-y-1.5">
              <div className="text-meta opacity-50 text-xs">
                CSV COLUMNS: name, size, price, currency, type · type is optional (auto-detected if blank).
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={downloadTemplate}
                  className="text-meta text-xs text-[var(--color-blaze)] opacity-70 hover:opacity-100"
                >
                  ↓ DOWNLOAD TEMPLATE
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(AI_PROMPT).then(() => alert('Prompt copied!'))}
                  className="text-meta text-xs text-[var(--color-blaze)] opacity-70 hover:opacity-100"
                >
                  ⎘ COPY AI PROMPT
                </button>
              </div>
            </div>

            {/* Rows */}
            <div className="max-h-80 overflow-y-auto">
              {importRows.map((d, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--color-rule)] last:border-b-0 ${!d.include ? 'opacity-40' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={e => setImportRows(prev => prev!.map((r, j) => j === i ? { ...r, include: e.target.checked } : r))}
                    className="w-4 h-4 shrink-0"
                  />
                  {d.warning && (
                    <span className="text-[var(--color-blaze)] text-xs shrink-0" title={d.warning}>⚠</span>
                  )}
                  <input
                    type="text"
                    value={d.name}
                    onChange={e => setImportRows(prev => prev!.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                    className="flex-1 min-w-0 bg-transparent border border-[var(--color-rule)] px-2 py-1 text-sm font-display uppercase focus:outline-none focus:border-[var(--color-blaze)]"
                  />
                  <input
                    type="text"
                    value={d.size ?? ''}
                    onChange={e => setImportRows(prev => prev!.map((r, j) => j === i ? { ...r, size: e.target.value || null } : r))}
                    placeholder="size"
                    className="w-16 bg-transparent border border-[var(--color-rule)] px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-blaze)]"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={d.price}
                    onChange={e => setImportRows(prev => prev!.map((r, j) => j === i ? { ...r, price: parseFloat(e.target.value) || 0 } : r))}
                    className="w-16 bg-transparent border border-[var(--color-rule)] px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-blaze)]"
                  />
                  <select
                    value={d.currency}
                    onChange={e => setImportRows(prev => prev!.map((r, j) => j === i ? { ...r, currency: e.target.value } : r))}
                    className="bg-transparent border border-[var(--color-rule)] px-1 py-1 text-meta text-[var(--color-paper)]"
                  >
                    <option value="EUR" className="bg-[var(--color-ink)]">EUR €</option>
                    <option value="GBP" className="bg-[var(--color-ink)]">GBP £</option>
                    <option value="CHF" className="bg-[var(--color-ink)]">CHF</option>
                    <option value="USD" className="bg-[var(--color-ink)]">USD $</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setImportRows(prev => prev!.filter((_, j) => j !== i))}
                    className="shrink-0 opacity-40 hover:opacity-100 hover:text-[var(--color-blaze)] min-h-[44px] px-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            {/* Summary + import button */}
            <div className="px-3 py-2 border-t border-[var(--color-rule)] space-y-2">
              {(() => {
                const ready = importRows.filter(r => r.include);
                const excluded = importRows.length - ready.length;
                return (
                  <>
                    <div className="text-meta opacity-60 text-xs">
                      {ready.length} DRINK{ready.length !== 1 ? 'S' : ''} READY
                      {excluded > 0 && ` · ${excluded} EXCLUDED`}
                    </div>
                    <button
                      onClick={doImport}
                      disabled={importWorking || ready.length === 0}
                      className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] py-2.5 font-display uppercase text-sm disabled:opacity-40"
                    >
                      {importWorking ? 'IMPORTING…' : `IMPORT ${ready.length} DRINK${ready.length !== 1 ? 'S' : ''}`}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {addDrinkOpen && (
          <div key="add-drink-form" className="mb-3 p-3 border border-[var(--color-blaze)] space-y-2">
            <DrinkNameInput
              value={drinkForm.name}
              onChange={v => setDrinkForm(f => ({ ...f, name: v, drinkType: detectDrinkType(v) }))}
              placeholder="Drink name"
            />
            <select
              value={drinkForm.drinkType}
              onChange={e => setDrinkForm(f => ({ ...f, drinkType: e.target.value }))}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm text-[var(--color-paper)]"
            >
              {DRINK_TYPE_ORDER.map(t => (
                <option key={t} value={t} className="bg-[var(--color-ink)]">{DRINK_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <SizeSelect
              value={drinkForm.size}
              onChange={v => setDrinkForm(f => ({ ...f, size: v }))}
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={drinkForm.price}
                onChange={e => setDrinkForm(f => ({ ...f, price: e.target.value }))}
                placeholder="Price"
                className="flex-1 bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px] text-sm"
              />
              <select
                value={drinkForm.currency}
                onChange={e => setDrinkForm(f => ({ ...f, currency: e.target.value }))}
                className="bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-2 min-h-[44px] text-sm text-[var(--color-paper)]"
              >
                <option value="EUR" className="bg-[var(--color-ink)]">EUR €</option>
                <option value="GBP" className="bg-[var(--color-ink)]">GBP £</option>
                <option value="CHF" className="bg-[var(--color-ink)]">CHF</option>
              </select>
            </div>
            <button
              onClick={() => {
                if (!drinkForm.name || !drinkForm.price) return;
                createDrink.mutate({
                  barId,
                  name: drinkForm.name,
                  size: drinkForm.size || undefined,
                  price: parseFloat(drinkForm.price),
                  currency: drinkForm.currency,
                  drinkType: drinkForm.drinkType,
                  isVerified: true,
                });
              }}
              disabled={createDrink.isPending || !drinkForm.name || !drinkForm.price}
              className="w-full bg-[var(--color-blaze)] text-[var(--color-paper)] py-2.5 font-display uppercase text-sm disabled:opacity-40"
            >
              {createDrink.isPending ? 'SAVING…' : 'SAVE DRINK'}
            </button>
          </div>
        )}

        {barDetails.drinks?.length === 0 && <div className="text-meta opacity-55">No drinks yet.</div>}
        {(() => {
          const sortedDrinks = [...(barDetails.drinks ?? [])].sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return parseSizeValue(a.size) - parseSizeValue(b.size);
          });
          const grouped = DRINK_TYPE_ORDER.reduce((acc, type) => {
            const typeDrinks = sortedDrinks.filter(d => ((d as any).drinkType || detectDrinkType(d.name)) === type);
            if (typeDrinks.length > 0) acc[type] = typeDrinks;
            return acc;
          }, {} as Record<string, typeof sortedDrinks>);
          return Object.entries(grouped).map(([type, typeDrinks]) => (
            <div key={type} className="mb-2">
              <div className="border-l-2 border-[var(--color-blaze)] px-2 py-1 flex items-center justify-between mb-1">
                <span className="text-eyebrow text-[var(--color-blaze)]">{DRINK_TYPE_LABELS[type as keyof typeof DRINK_TYPE_LABELS]}</span>
                <span className="text-meta opacity-40">{typeDrinks.length.toString().padStart(2,'0')}</span>
              </div>
              <div className="space-y-1.5">
                {typeDrinks.map(drink => (
                  <DrinkRow key={drink.id} drink={drink} onDelete={() => deleteDrink.mutate({ id: drink.id })} onUpdate={refetch} />
                ))}
              </div>
            </div>
          ));
        })()}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-eyebrow opacity-70">DEALS & EVENTS</h3>
          <button
            onClick={() => { setAddingDeal(true); resetDealForm(); }}
            className="text-meta text-[var(--color-blaze)] min-h-[44px] px-2"
          >
            + ADD DEAL
          </button>
        </div>

        <div className="space-y-1.5">
          {barDetails.deals?.map(deal => (
            <DealRow key={deal.id} deal={deal} onDelete={() => deleteDeal.mutate({ id: deal.id })} onUpdate={refetch} />
          ))}
          {barDetails.deals?.length === 0 && !addingDeal && (
            <div className="text-meta opacity-55">No deals yet.</div>
          )}
        </div>

        {addingDeal && (
          <div className="mt-2 p-3 border border-[var(--color-rule)] space-y-2">
            <input
              type="text"
              placeholder="Deal title (e.g. Happy Hour)"
              value={dealForm.title}
              onChange={e => setDealForm({ ...dealForm, title: e.target.value })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm"
            />
            <select
              value={dealForm.type}
              onChange={e => setDealForm({ ...dealForm, type: e.target.value })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm text-[var(--color-paper)]"
            >
              <option value="happy_hour" className="bg-[var(--color-ink)]">Happy Hour</option>
              <option value="event" className="bg-[var(--color-ink)]">Event</option>
              <option value="promotion" className="bg-[var(--color-ink)]">Promotion</option>
            </select>
            <input
              type="text"
              placeholder="Description (optional)"
              value={dealForm.description}
              onChange={e => setDealForm({ ...dealForm, description: e.target.value })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-meta opacity-55 mb-1">START</div>
                <input
                  type="time"
                  value={dealForm.startTime}
                  onChange={e => setDealForm({ ...dealForm, startTime: e.target.value })}
                  className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <div className="text-meta opacity-55 mb-1">END</div>
                <input
                  type="time"
                  value={dealForm.endTime}
                  onChange={e => setDealForm({ ...dealForm, endTime: e.target.value })}
                  className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <div className="text-meta opacity-55 mb-1">DAYS</div>
              <div className="flex gap-1 flex-wrap">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const days = dealForm.days.includes(idx)
                        ? dealForm.days.filter((d: number) => d !== idx)
                        : [...dealForm.days, idx];
                      setDealForm({ ...dealForm, days });
                    }}
                    className={`px-2 py-1 text-meta border transition-colors ${
                      dealForm.days.includes(idx)
                        ? 'bg-[var(--color-blaze)] text-[var(--color-paper)] border-[var(--color-blaze)]'
                        : 'border-[var(--color-rule)] opacity-60'
                    }`}
                  >
                    {day.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setAddingDeal(false); resetDealForm(); }}
                className="flex-1 border border-[var(--color-rule)] py-2 text-meta uppercase"
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  await createDeal.mutateAsync({
                    barId,
                    title: dealForm.title,
                    type: dealForm.type,
                    description: dealForm.description || null,
                    startTime: dealForm.startTime,
                    endTime: dealForm.endTime,
                    daysOfWeek: JSON.stringify(dealForm.days.length ? dealForm.days : [0, 1, 2, 3, 4, 5, 6]),
                    isActive: true,
                  });
                  setAddingDeal(false);
                  resetDealForm();
                }}
                disabled={createDeal.isPending || !dealForm.title || !dealForm.startTime || !dealForm.endTime}
                className="flex-1 bg-[var(--color-blaze)] text-[var(--color-paper)] py-2 text-meta uppercase disabled:opacity-40"
              >
                {createDeal.isPending ? 'SAVING…' : 'SAVE DEAL'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── DrinkRow ────────────────────────────────────────────────── */
function DrinkRow({ drink, onDelete, onUpdate }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(drink);
  const updateDrink = trpc.admin.updateDrink.useMutation({ onSuccess: () => { onUpdate(); setEditing(false); } });

  if (editing) {
    return (
      <div className="space-y-2 p-2 bg-[var(--color-ink-soft)] border border-[var(--color-rule)]">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value, drinkType: form.drinkType || detectDrinkType(e.target.value) })}
          className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px] text-sm" placeholder="Drink name" />
        <select value={form.drinkType || detectDrinkType(form.name)} onChange={e => setForm({ ...form, drinkType: e.target.value })}
          className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm text-[var(--color-paper)]">
          {DRINK_TYPE_ORDER.map(t => <option key={t} value={t} className="bg-[var(--color-ink)]">{DRINK_TYPE_LABELS[t]}</option>)}
        </select>
        <SizeSelect value={form.size || ''} onChange={v => setForm({ ...form, size: v })} />
        <div className="flex gap-2">
          <input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
            className="flex-1 bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px] text-sm" placeholder="Price" />
          <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
            className="bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-2 min-h-[44px] text-sm text-[var(--color-paper)]">
            <option value="EUR" className="bg-[var(--color-ink)]">EUR €</option>
            <option value="GBP" className="bg-[var(--color-ink)]">GBP £</option>
            <option value="CHF" className="bg-[var(--color-ink)]">CHF</option>
          </select>
        </div>
        <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={form.isVerified} onChange={e => setForm({ ...form, isVerified: e.target.checked })} className="w-5 h-5" />
          <span className="text-meta opacity-70">VERIFIED</span>
        </label>
        <div className="flex gap-2">
          <button onClick={() => updateDrink.mutate({ id: drink.id, name: form.name, size: form.size || null, drinkType: form.drinkType || null, price: parseFloat(form.price), currency: form.currency, isVerified: form.isVerified })}
            className="flex-1 bg-[var(--color-verified)] text-[var(--color-ink)] min-h-[44px] font-display uppercase text-sm">SAVE</button>
          <button onClick={() => setEditing(false)} className="flex-1 border border-[var(--color-rule)] min-h-[44px] text-meta uppercase opacity-70">CANCEL</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2 bg-[var(--color-ink-soft)] bg-opacity-50 min-h-[44px]">
      <div className="flex-1 min-w-0">
        <span className="font-display text-sm uppercase truncate block">{drink.name}</span>
        <span className="text-meta opacity-65">{drink.price.toFixed(2)} {drink.currency}{drink.isVerified ? " · VER" : ""}</span>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 min-h-[44px] border border-[var(--color-rule)] text-[var(--color-blaze)]">
          <Edit2 size={12} strokeWidth={1.6} /><span className="text-meta">EDIT</span>
        </button>
        <button onClick={() => { if (confirm('Delete drink?')) onDelete(); }} className="flex items-center gap-1.5 px-3 min-h-[44px] border border-[var(--color-rule)] opacity-60 hover:opacity-100 hover:text-[var(--color-blaze)]">
          <Trash2 size={12} strokeWidth={1.6} /><span className="text-meta">DEL</span>
        </button>
      </div>
    </div>
  );
}

/* ── DealRow ─────────────────────────────────────────────────── */
function DealRow({ deal, onDelete, onUpdate }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...deal, days: (() => { try { return JSON.parse(deal.daysOfWeek || '[]'); } catch { return []; } })() });
  const updateDeal = trpc.admin.updateDeal.useMutation({ onSuccess: () => { onUpdate(); setEditing(false); } });

  if (editing) {
    return (
      <div className="space-y-2 p-2 bg-[var(--color-ink-soft)] border border-[var(--color-rule)]">
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
          className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2.5 min-h-[44px] text-sm" placeholder="Title" />
        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
          className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm text-[var(--color-paper)]">
          <option value="happy_hour" className="bg-[var(--color-ink)]">Happy Hour</option>
          <option value="event" className="bg-[var(--color-ink)]">Event</option>
          <option value="promotion" className="bg-[var(--color-ink)]">Promotion</option>
        </select>
        <input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })}
          className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm" placeholder="Description (optional)" />
        <div className="flex gap-2">
          <div className="flex-1">
            <div className="text-meta opacity-55 mb-1">START</div>
            <input type="time" value={form.startTime || ''} onChange={e => setForm({ ...form, startTime: e.target.value })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm" />
          </div>
          <div className="flex-1">
            <div className="text-meta opacity-55 mb-1">END</div>
            <input type="time" value={form.endTime || ''} onChange={e => setForm({ ...form, endTime: e.target.value })}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <div className="text-meta opacity-55 mb-1">DAYS</div>
          <div className="flex gap-1 flex-wrap">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, idx) => (
              <button key={idx} type="button"
                onClick={() => {
                  const days = form.days.includes(idx) ? form.days.filter((d: number) => d !== idx) : [...form.days, idx];
                  setForm({ ...form, days });
                }}
                className={`px-2 py-1 text-meta border transition-colors ${form.days.includes(idx) ? 'bg-[var(--color-blaze)] text-[var(--color-paper)] border-[var(--color-blaze)]' : 'border-[var(--color-rule)] opacity-60'}`}
              >{day.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
          <span className="text-meta opacity-70">ACTIVE</span>
        </label>
        <div className="flex gap-2">
          <button onClick={() => updateDeal.mutate({
            id: deal.id, title: form.title, type: form.type,
            description: form.description || null,
            startTime: form.startTime, endTime: form.endTime,
            daysOfWeek: JSON.stringify(form.days.length ? form.days : [0,1,2,3,4,5,6]),
            isActive: !!form.isActive,
          })}
            className="flex-1 bg-[var(--color-verified)] text-[var(--color-ink)] min-h-[44px] font-display uppercase text-sm">SAVE</button>
          <button onClick={() => setEditing(false)} className="flex-1 border border-[var(--color-rule)] min-h-[44px] text-meta uppercase opacity-70">CANCEL</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2 bg-[var(--color-ink-soft)] bg-opacity-50 min-h-[44px]">
      <div className="flex-1 min-w-0">
        <span className="font-display text-sm uppercase block truncate">{deal.title}</span>
        <span className="text-meta opacity-60">
          {deal.type?.toUpperCase()}
          {deal.startTime ? ` · ${deal.startTime}–${deal.endTime}` : ''}
          {!deal.isActive ? ' · INACTIVE' : ''}
        </span>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 min-h-[44px] border border-[var(--color-rule)] text-[var(--color-blaze)]">
          <Edit2 size={12} strokeWidth={1.6} /><span className="text-meta">EDIT</span>
        </button>
        <button onClick={() => { if (confirm('Delete deal?')) onDelete(); }} className="flex items-center gap-1.5 px-3 min-h-[44px] border border-[var(--color-rule)] opacity-60 hover:opacity-100 hover:text-[var(--color-blaze)]">
          <Trash2 size={12} strokeWidth={1.6} /><span className="text-meta">DEL</span>
        </button>
      </div>
    </div>
  );
}
