import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAppStore, convertPrice, formatPrice, isOpenNow, distanceKm } from "../lib/store";
import { LoadingMessage } from "../components/LoadingMessage";
import { GuinnessBanner, GuinnessSheet } from "../components/GuinnessSheet";

export default function Dashboard() {
  const { currency, stoutsMode } = useAppStore();
  const { data: barsWithDetails, isLoading } = trpc.bars.getAllWithDetails.useQuery();
  const { data: deals } = trpc.bars.getDeals.useQuery();
  const { data: resort } = trpc.resort.getCondition.useQuery();

  const [userLocation, setUserLocation] = useState<{lat:number;lng:number} | null>(null);
  const [guinnessOpen, setGuinnessOpen] = useState(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      p => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, // silently fall back to Belfast city centre
      { maximumAge: 5*60*1000, timeout: 5000 }
    );
  }, []);

  // Default centre: Belfast city centre
  const center = userLocation || { lat: 54.5973, lng: -5.9301 };

  const enriched = useMemo(() => {
    if (!barsWithDetails) return [];
    return barsWithDetails.map(b => {
      const beerDrinks = (b.drinks ?? []).filter(d =>
        /lager|beer|pint|guinness|ipa|stella|heineken|carlsberg|harp|tennent|smithwick|bass|caffreys|magners|strongbow|bulmers|murphy|kilkenny/i.test(d.name)
      );
      const cheapest = beerDrinks.length
        ? beerDrinks.reduce((min, d) => {
            const p = convertPrice(d.price, d.currency as any, currency);
            return p < min.price ? { price: p, drink: d } : min;
          }, { price: Infinity, drink: beerDrinks[0] })
        : null;
      return {
        ...b,
        distance: distanceKm(center, { lat: b.lat, lng: b.lng }),
        cheapest,
        openState: isOpenNow(b.openingHours),
      };
    });
  }, [barsWithDetails, currency, center.lat, center.lng]);

  const { data: pickData } = trpc.bars.getEditorsPick.useQuery();

  // Editor's pick from server, enriched client-side for distance + price
  const editorsPick = useMemo(() => {
    if (!pickData?.bar) return null;
    return enriched.find(b => b.id === pickData.bar.id) ?? null;
  }, [pickData, enriched]);

  // Nearest = open bars sorted by distance
  const nearest = useMemo(() => {
    return enriched
      .filter(b => b.id !== editorsPick?.id)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  }, [enriched, editorsPick]);

  // Active happy hour right now
  const activeDeals = useMemo(() => {
    if (!deals) return [];
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const dow = now.getDay();
    return deals.filter(d => {
      if (!d.isActive) return false;
      if (!d.startTime || !d.endTime) return false;
      try {
        const days = d.daysOfWeek ? JSON.parse(d.daysOfWeek) as number[] : [0,1,2,3,4,5,6];
        if (!days.includes(dow)) return false;
        const [sh,sm] = d.startTime.split(":").map(Number);
        const [eh,em] = d.endTime.split(":").map(Number);
        const start = sh*60+sm;
        const end = eh*60+em;
        return curMin >= start && curMin <= end;
      } catch { return false; }
    });
  }, [deals]);

  const localArea = userLocation
    ? (enriched[0]?.area || "Belfast")
    : "Belfast";

  if (isLoading) {
    return <LoadingMessage surface="dashboard" />;
  }

  return (
    <div className="grain-ink max-w-md mx-auto">
      {/* Hero */}
      <section className="px-4 pt-6 pb-5">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">DISPATCH 01 · {localArea.toUpperCase()}</div>
        <h1 className="text-hero text-[var(--color-paper)]" style={{ fontSize: 'clamp(2.4rem, 9vw, 4.5rem)' }}>
          FIND THE<br/>
          {stoutsMode ? <>BEST <span style={{color:"var(--color-paper)"}}>STOUT</span> IN</> : <>CHEAPEST<br/><span className="text-[var(--color-blaze)]">PINT</span> IN</>}<br/>
          BELFAST
        </h1>

        {/* Status bar — temp, bars, deals */}
        <div className="mt-5 flex gap-2">
          <div className="flex-1 border border-[var(--color-rule)] px-2.5 py-2">
            <div className="text-eyebrow opacity-60">TEMP</div>
            <div className="font-display text-xl mt-0.5 text-[var(--color-frost)]">
              {resort?.temp != null ? `${resort.temp}°` : "—"}
            </div>
          </div>
          <div className="flex-1 border border-[var(--color-rule)] px-2.5 py-2">
            <div className="text-eyebrow opacity-60">BARS</div>
            <div className="font-display text-xl mt-0.5 text-[var(--color-paper)]">
              {(barsWithDetails?.length ?? 0).toString().padStart(2, "0")}
            </div>
          </div>
          <div className="flex-1 border border-[var(--color-rule)] px-2.5 py-2">
            <div className="text-eyebrow opacity-60">DEALS</div>
            <div className={`font-display text-xl mt-0.5 ${activeDeals.length > 0 ? "text-[var(--color-sun)]" : "text-[var(--color-paper)]"}`}>
              {activeDeals.length.toString().padStart(2, "0")}
            </div>
          </div>
        </div>
      </section>

      {/* Editor's pick */}
      {editorsPick && (
        <Link to={`/bar/${editorsPick.id}`} className="block mx-4 mb-3 grain-blaze text-[var(--color-paper)] !min-h-0">
          <div className="px-4 py-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-eyebrow opacity-90">
                EDITOR'S PICK · {pickData?.mode === "cheapest" ? "CHEAPEST PINT" : pickData?.mode === "manual" ? "EDITOR'S CHOICE" : pickData?.mode === "daily_random" ? "TODAY'S PICK" : "WEEKLY PICK"}
              </div>
              <div className="font-display text-2xl uppercase leading-none mt-1.5">{editorsPick.name}</div>
              <div className="flex items-end justify-between mt-2">
                <div className="text-meta opacity-90">
                  {editorsPick.area?.toUpperCase()} · {editorsPick.distance.toFixed(1)} KM
                </div>
                <div className="font-display text-2xl text-[var(--color-ink)] leading-none">
                  {formatPrice(editorsPick.cheapest!.price, currency)}
                </div>
              </div>
            </div>
            <ChevronRight size={20} strokeWidth={1.6} />
          </div>
        </Link>
      )}

      {/* Live now — active happy hours */}
      {activeDeals.length > 0 && (
        <section className="px-4 pb-3">
          <div className="hairline-b flex items-baseline justify-between pb-1.5 mb-1">
            <div className="font-display text-lg uppercase">LIVE NOW</div>
            <Link to="/live" className="text-meta text-[var(--color-blaze)] flex items-center gap-1">
              SEE ALL {activeDeals.length.toString().padStart(2,"0")} →
            </Link>
          </div>
          <ul>
            {activeDeals.slice(0, 3).map((deal, i) => {
              const bar = enriched.find(b => b.id === deal.barId);
              if (!bar) return null;
              return (
                <li key={deal.id}>
                  <Link to={`/bar/${bar.id}`} className="hairline-b-soft flex items-center gap-3 py-2.5">
                    <span className="num-rail text-[var(--color-blaze)] w-6">{String(i+1).padStart(2,"0")}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base uppercase truncate text-[var(--color-paper)]">{deal.title} · {bar.name}</div>
                      <div className="text-meta opacity-60 mt-0.5">
                        {deal.startTime} – {deal.endTime} · {bar.area?.toUpperCase()}
                      </div>
                    </div>
                    <ChevronRight size={14} strokeWidth={1.4} className="opacity-50" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Nearest you */}
      <section className="px-4 pb-3">
        <div className="hairline-b flex items-baseline justify-between pb-1.5 mb-1">
          <div className="font-display text-lg uppercase">NEAREST YOU</div>
          <div className="text-meta opacity-55">{userLocation ? "GPS" : "BELFAST"}</div>
        </div>
        {nearest.length === 0 ? (
          <div className="py-8 text-center text-meta opacity-55">No bars found nearby yet.</div>
        ) : (
          <ul>
            {nearest.map((bar, i) => (
              <li key={bar.id}>
                <Link
                  to={`/bar/${bar.id}`}
                  className="hairline-b-soft last:border-b-0 flex items-center gap-3 py-3"
                >
                  <span className="num-rail text-[var(--color-blaze)] w-6">{String(i+1).padStart(2,"0")}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
                    <div className="text-meta opacity-60 mt-0.5 flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${bar.openState.open ? "bg-[var(--color-verified)]" : "bg-[var(--color-paper)] opacity-35"}`} />
                      {bar.openState.open
                        ? `OPEN UNTIL ${bar.openState.closesAt}`
                        : `CLOSED · OPENS ${bar.openState.opensAt ?? "—"}`} · {bar.distance.toFixed(1)} KM
                    </div>
                  </div>
                  {bar.cheapest && (
                    <div className={`font-display text-lg ${bar.openState.open ? "text-[var(--color-sun)]" : "text-[var(--color-sun)] opacity-55"}`}>
                      {formatPrice(bar.cheapest.price, currency)}
                    </div>
                  )}
                  <ChevronRight size={14} strokeWidth={1.4} className="opacity-50 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Type-only Guinness banner */}
      <GuinnessBanner onOpen={() => setGuinnessOpen(true)} />
      <GuinnessSheet open={guinnessOpen} onClose={() => setGuinnessOpen(false)} userLocation={userLocation} />
    </div>
  );
}
