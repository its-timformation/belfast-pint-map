import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { useAppStore, convertPrice, formatPrice, isOpenNow } from '../lib/store';
import { LoadingMessage } from '../components/LoadingMessage';

export default function LiveNow() {
  const navigate = useNavigate();
  const { currency } = useAppStore();
  const { data: barsWithDetails, isLoading } = trpc.bars.getAllWithDetails.useQuery();

  const now = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  const dow = now.getDay();

  const activeDeals = useMemo(() => {
    if (!barsWithDetails) return [];
    const results: Array<{
      deal: any;
      bar: any;
      cheapest: { price: number; drink: any } | null;
    }> = [];

    for (const bar of barsWithDetails) {
      for (const deal of bar.deals ?? []) {
        if (!deal.isActive) continue;
        if (!deal.startTime || !deal.endTime) continue;
        try {
          const days = deal.daysOfWeek
            ? JSON.parse(deal.daysOfWeek) as number[]
            : [0, 1, 2, 3, 4, 5, 6];
          if (!days.includes(dow)) continue;
          const [sh, sm] = deal.startTime.split(':').map(Number);
          const [eh, em] = deal.endTime.split(':').map(Number);
          const start = sh * 60 + sm;
          const end = eh * 60 + em;
          if (curMin < start || curMin > end) continue;
        } catch { continue; }

        const beerDrinks = (bar.drinks ?? []).filter((d: any) =>
          /lager|beer|pint|kronen|stella|heineken|guinness|ipa|carlsberg|1664|mutzig/i.test(d.name)
        );
        const cheapest = beerDrinks.length
          ? beerDrinks.reduce((min: any, d: any) => {
              const p = convertPrice(d.price, d.currency, currency);
              return p < min.price ? { price: p, drink: d } : min;
            }, { price: Infinity, drink: beerDrinks[0] })
          : null;

        results.push({ deal, bar, cheapest });
      }
    }
    return results;
  }, [barsWithDetails, currency, curMin, dow]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof activeDeals> = {};
    for (const item of activeDeals) {
      const type = item.deal.type?.toUpperCase().replace('_', ' ') || 'OTHER';
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    }
    return groups;
  }, [activeDeals]);

  const typeOrder = ['HAPPY HOUR', 'EVENT', 'PROMOTION', 'OTHER'];
  const sortedGroups = typeOrder
    .filter(t => grouped[t]?.length)
    .map(t => [t, grouped[t]] as [string, typeof activeDeals])
    .concat(
      Object.entries(grouped).filter(([t]) => !typeOrder.includes(t))
    );

  if (isLoading) return <LoadingMessage surface="dashboard" />;

  return (
    <div className="grain-ink max-w-md mx-auto pb-6">
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-meta opacity-70 !min-h-0"
        >
          <ChevronLeft size={16} strokeWidth={1.6} />
          BACK
        </button>
      </div>

      <section className="px-4 pt-2 pb-5">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">
          LIVE · {activeDeals.length.toString().padStart(2, '0')} ACTIVE
        </div>
        <h1 className="text-headline">LIVE NOW</h1>
      </section>

      {activeDeals.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <div className="font-display text-2xl uppercase">NOTHING ON RIGHT NOW</div>
          <div className="text-meta opacity-55 mt-3">Check back later — happy hours start from 16:00.</div>
        </div>
      ) : (
        sortedGroups.map(([type, items]) => (
          <div key={type}>
            <div className="sticky top-0 z-10 bg-[var(--color-ink)] border-l-2 border-[var(--color-blaze)] px-4 py-2 flex items-center justify-between">
              <span className="font-display text-sm uppercase text-[var(--color-blaze)]">{type}</span>
              <span className="text-meta opacity-50">{items.length.toString().padStart(2, '0')}</span>
            </div>
            <ul>
              {items.map(({ deal, bar, cheapest }, i) => {
                const openState = isOpenNow(bar.openingHours);
                return (
                  <li key={deal.id}>
                    <Link
                      to={`/bar/${bar.id}`}
                      className="hairline-b-soft last:border-b-0 flex items-center gap-3 px-4 py-3.5"
                    >
                      <span className="num-rail text-[var(--color-blaze)] w-6 shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base uppercase truncate text-[var(--color-paper)]">
                          {bar.name}
                        </div>
                        <div className="text-meta opacity-60 mt-0.5">
                          {deal.title.toUpperCase()} · {deal.startTime}–{deal.endTime}
                        </div>
                        <div className="text-meta opacity-40 mt-0.5 flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${openState.open ? 'bg-[var(--color-verified)]' : 'bg-[var(--color-paper)] opacity-35'}`} />
                          {bar.area?.toUpperCase()}
                          {deal.description ? ` · ${deal.description.toUpperCase()}` : ''}
                        </div>
                      </div>
                      {cheapest && (
                        <div className="font-display text-lg text-[var(--color-sun)] shrink-0">
                          {formatPrice(cheapest.price, currency)}
                        </div>
                      )}
                      <ChevronRight size={14} strokeWidth={1.4} className="opacity-50 shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
