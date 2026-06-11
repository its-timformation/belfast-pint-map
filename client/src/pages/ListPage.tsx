import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAppStore, convertPrice, formatPrice, isOpenNow } from "../lib/store";
import { LoadingMessage } from "../components/LoadingMessage";
import { SearchTypeahead, FilterState } from "../components/SearchTypeahead";

type SortMode = "name" | "price" | "area";

export default function ListPage() {
  const { currency } = useAppStore();
  const { data: barsWithDetails, isLoading } = trpc.bars.getAllWithDetails.useQuery();
  const suggestBar = trpc.bars.suggestBar.useMutation();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = (searchParams.get('sort') as SortMode) || 'name';
  const setSort = (s: SortMode) => setSearchParams(prev => { prev.set('sort', s); return prev; }, { replace: true });

  const [openOnly, setOpenOnly] = useState(false);
  const [happyOnly, setHappyOnly] = useState(false);
  const [guinnessOnly, setGuinnessOnly] = useState(false);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [initialGuinness, setInitialGuinness] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestForm, setSuggestForm] = useState({ name: '', area: '', notes: '', submittedBy: '' });
  const [suggestDone, setSuggestDone] = useState(false);

  useEffect(() => {
    if ((location.state as any)?.guinnessFilter) {
      setInitialGuinness(true);
      window.history.replaceState({}, "", location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = useCallback((state: FilterState) => {
    setOpenOnly(state.openOnly);
    setHappyOnly(state.happyOnly);
    setGuinnessOnly(state.guinnessOnly);
    setAreaFilter(state.areaFilter);
    setQuery(state.query);
  }, []);

  const areas = useMemo(() => {
    if (!barsWithDetails) return [];
    return [...new Set(barsWithDetails.map(b => b.area).filter(Boolean))].sort() as string[];
  }, [barsWithDetails]);

  const [filterArea, setFilterArea] = useState('');

  const enriched = useMemo(() => {
    if (!barsWithDetails) return [];
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const dow = now.getDay();
    return barsWithDetails.map(b => {
      const beerDrinks = (b.drinks ?? []).filter(d =>
        /lager|beer|pint|kronen|stella|heineken|guinness|ipa|carlsberg|1664|mutzig/i.test(d.name)
      );
      const cheapest = beerDrinks.length
        ? beerDrinks.reduce((min, d) => {
            const p = convertPrice(d.price, d.currency as any, currency);
            return p < min.price ? { price: p, drink: d } : min;
          }, { price: Infinity, drink: beerDrinks[0] })
        : null;
      const hasActiveHappy = (b.deals ?? []).some(d => {
        if (!d.isActive || d.type !== "happy_hour" || !d.startTime || !d.endTime) return false;
        try {
          const days = d.daysOfWeek ? JSON.parse(d.daysOfWeek) as number[] : [0,1,2,3,4,5,6];
          if (!days.includes(dow)) return false;
          const [sh,sm] = d.startTime.split(":").map(Number);
          const [eh,em] = d.endTime.split(":").map(Number);
          return curMin >= sh*60+sm && curMin <= eh*60+em;
        } catch { return false; }
      });
      return {
        ...b,
        cheapest,
        hasActiveHappy,
        openState: isOpenNow(b.openingHours),
      };
    });
  }, [barsWithDetails, currency]);

  const filtered = useMemo(() => {
    let list = [...enriched];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(b =>
        b.name.toLowerCase().includes(q) ||
        b.area?.toLowerCase().includes(q) ||
        (b.drinks ?? []).some(d => d.name.toLowerCase().includes(q))
      );
    }
    if (openOnly) list = list.filter(b => b.openState.open);
    if (happyOnly) list = list.filter(b => b.hasActiveHappy);
    if (guinnessOnly) list = list.filter(b => b.servesGuinness);
    if (filterArea) list = list.filter(b => b.area === filterArea);
    else if (areaFilter) list = list.filter(b => b.area === areaFilter);

    list.sort((a, b) => {
      if (sort === "price") {
        const pa = a.cheapest?.price ?? Infinity;
        const pb = b.cheapest?.price ?? Infinity;
        return pa - pb;
      }
      if (sort === "area") return (a.area || "").localeCompare(b.area || "");
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [enriched, query, openOnly, happyOnly, guinnessOnly, areaFilter, filterArea, sort]);

  if (isLoading) return <LoadingMessage surface="list" />;

  return (
    <div className="grain-ink max-w-md mx-auto">
      <section className="px-4 pt-5 pb-3">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">DIRECTORY · {(barsWithDetails?.length ?? 0).toString().padStart(2,"0")} BARS</div>
        <h1 className="text-headline">EVERY BAR<br/>IN THE CITY</h1>
      </section>

      {/* Typeahead search with filter chips */}
      <div className="px-4 mb-3">
        <SearchTypeahead
          bars={(barsWithDetails ?? []).map(b => ({ id: b.id, name: b.name, area: b.area, drinks: b.drinks ?? [] }))}
          initialGuinness={initialGuinness}
          onChange={handleFilterChange}
        />
      </div>

      {/* Sort pills */}
      <div className="px-4 pb-3 flex gap-2">
        <span className="text-meta opacity-40 self-center shrink-0">SORT</span>
        {(["name","price","area"] as SortMode[]).map(s => (
          <button key={s} onClick={() => setSort(s)}
            className={`px-4 py-2 min-h-[44px] text-meta uppercase whitespace-nowrap ${sort === s ? "bg-[var(--color-blaze)] text-[var(--color-paper)]" : "border border-[var(--color-rule)] opacity-70"}`}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Area filter pills */}
      {areas.length > 0 && (
        <div className="overflow-x-auto scrollbar-hide pb-3">
          <div className="flex gap-1.5 px-4 min-w-max">
            {filterArea && (
              <button
                onClick={() => setFilterArea('')}
                className="px-3 py-1.5 text-meta border bg-[var(--color-blaze)] text-[var(--color-paper)] border-[var(--color-blaze)] whitespace-nowrap"
              >
                ✕ CLEAR
              </button>
            )}
            {areas.map(area => (
              <button
                key={area}
                onClick={() => setFilterArea(filterArea === area ? '' : area)}
                className={`px-3 py-1.5 text-meta border transition-colors whitespace-nowrap ${
                  filterArea === area
                    ? 'bg-[var(--color-blaze)] text-[var(--color-paper)] border-[var(--color-blaze)]'
                    : 'border-[var(--color-rule)] opacity-70'
                }`}
              >
                {area.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 && (
        <div className="py-12 text-center text-meta opacity-55 px-4">No bars match your filters.</div>
      )}
      {sort === 'area' ? (
        (() => {
          const grouped = filtered.reduce((acc, bar) => {
            const area = bar.area || 'Other';
            if (!acc[area]) acc[area] = [];
            acc[area].push(bar);
            return acc;
          }, {} as Record<string, typeof filtered>);

          return Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([area, bars]) => (
              <div key={area}>
                <div className="sticky top-0 z-10 bg-[var(--color-ink)] border-l-2 border-[var(--color-blaze)] px-4 py-2 flex items-center justify-between">
                  <span className="font-display text-sm uppercase text-[var(--color-blaze)]">{area}</span>
                  <span className="text-meta opacity-50">{bars.length.toString().padStart(2,'0')}</span>
                </div>
                <ul>
                  {bars.map((bar, i) => (
                    <li key={bar.id}>
                      <Link to={`/bar/${bar.id}`} className="hairline-b-soft last:border-b-0 flex items-center gap-3 py-3 px-4">
                        <span className="num-rail text-[var(--color-blaze)] w-7 shrink-0">{String(i+1).padStart(2,'0')}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-base uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
                          <div className="text-meta opacity-60 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {(bar as any).businessStatus === 'CLOSED_TEMPORARILY' ? (
                              <span className="text-[var(--color-blaze)]">TEMP CLOSED</span>
                            ) : (
                              <>
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${bar.openState.open ? 'bg-[var(--color-verified)]' : 'bg-[var(--color-paper)] opacity-35'}`} />
                                {bar.openState.open ? `OPEN UNTIL ${bar.openState.closesAt}` : `CLOSED`}
                                {bar.hasActiveHappy && <span className="text-[var(--color-sun)]">· HAPPY NOW</span>}
                              </>
                            )}
                          </div>
                        </div>
                        {bar.cheapest && (
                          <div className={`font-display text-lg text-[var(--color-sun)] ${!bar.openState.open ? 'opacity-55' : ''}`}>
                            {formatPrice(bar.cheapest.price, currency)}
                          </div>
                        )}
                        <ChevronRight size={14} strokeWidth={1.4} className="opacity-50 shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ));
        })()
      ) : (
        <ul className="px-4 pb-6">
          {filtered.map((bar, i) => (
            <li key={bar.id}>
              <Link to={`/bar/${bar.id}`} className="hairline-b-soft last:border-b-0 flex items-center gap-3 py-3">
                <span className="num-rail text-[var(--color-blaze)] w-7 shrink-0">{String(i+1).padStart(2,"0")}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-base uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
                  <div className="text-meta opacity-60 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {(bar as any).businessStatus === 'CLOSED_TEMPORARILY' ? (
                      <span className="text-[var(--color-blaze)]">TEMP CLOSED</span>
                    ) : (
                      <>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${bar.openState.open ? "bg-[var(--color-verified)]" : "bg-[var(--color-paper)] opacity-35"}`} />
                        {bar.area?.toUpperCase()}
                        {bar.hasActiveHappy && <span className="text-[var(--color-sun)]">· HAPPY NOW</span>}
                      </>
                    )}
                  </div>
                </div>
                {bar.cheapest && (
                  <div className={`font-display text-lg text-[var(--color-sun)] ${!bar.openState.open ? "opacity-55" : ""}`}>
                    {formatPrice(bar.cheapest.price, currency)}
                  </div>
                )}
                <ChevronRight size={14} strokeWidth={1.4} className="opacity-50 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Suggest a bar */}
      <div className="px-4 py-8 border-t border-[var(--color-rule)] mt-4">
        <div className="font-display text-lg uppercase mb-1">KNOW A BAR WE'RE MISSING?</div>
        <div className="text-meta opacity-55 mb-4">
          Help us build the most complete pint index in Belfast.
        </div>
        {!suggestOpen ? (
          <button
            onClick={() => setSuggestOpen(true)}
            className="border border-[var(--color-blaze)] text-[var(--color-blaze)] px-5 py-2.5 text-meta hover:bg-[var(--color-blaze)] hover:text-[var(--color-paper)] transition-colors"
          >
            SUGGEST A BAR →
          </button>
        ) : suggestDone ? (
          <div className="text-meta text-[var(--color-verified)]">✓ SUGGESTION SENT — THANKS!</div>
        ) : (
          <div className="space-y-2 border border-[var(--color-rule)] p-3">
            <input
              type="text"
              placeholder="Bar name *"
              value={suggestForm.name}
              onChange={e => setSuggestForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm"
            />
            <select
              value={suggestForm.area}
              onChange={e => setSuggestForm(f => ({ ...f, area: e.target.value }))}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm text-[var(--color-paper)]"
            >
              <option value="" className="bg-[var(--color-ink)]">Area (optional)</option>
              {["Cathedral Quarter","City Centre","Queen's Quarter","Ormeau Road","Lisburn Road","East Belfast","Stranmillis","Titanic Quarter","North Belfast","South Belfast"].map(a => (
                <option key={a} value={a} className="bg-[var(--color-ink)]">{a}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Why should it be included? (optional)"
              value={suggestForm.notes}
              onChange={e => setSuggestForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Your name (optional)"
              value={suggestForm.submittedBy}
              onChange={e => setSuggestForm(f => ({ ...f, submittedBy: e.target.value }))}
              className="w-full bg-[var(--color-ink-card)] border border-[var(--color-rule)] px-3 py-2 text-sm"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setSuggestOpen(false)}
                className="flex-1 border border-[var(--color-rule)] py-2 text-meta uppercase opacity-60"
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  if (!suggestForm.name.trim()) return;
                  await suggestBar.mutateAsync({
                    name: suggestForm.name.trim(),
                    area: suggestForm.area || undefined,
                    notes: suggestForm.notes || undefined,
                    submittedBy: suggestForm.submittedBy || undefined,
                  });
                  setSuggestDone(true);
                  setSuggestOpen(false);
                }}
                disabled={!suggestForm.name.trim() || suggestBar.isPending}
                className="flex-1 bg-[var(--color-blaze)] text-[var(--color-paper)] py-2 text-meta uppercase disabled:opacity-40"
              >
                {suggestBar.isPending ? 'SENDING…' : 'SUBMIT'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
