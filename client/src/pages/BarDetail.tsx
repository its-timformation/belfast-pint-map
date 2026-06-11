import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, MapPin, Share2, Flag, ChevronRight, Globe } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAppStore, convertPrice, formatPrice, isOpenNow, isVerifiedStale } from "../lib/store";
import { LoadingMessage } from "../components/LoadingMessage";
import { detectDrinkType, DRINK_TYPE_LABELS, DRINK_TYPE_ORDER, parseSizeValue } from "../lib/detectDrinkType";

const EMPTY_BAR_MESSAGES = [
  "No prices yet — be the first to report one",
  "Menu's a mystery. Be the scout",
  "Uncharted territory. Slide in and report back",
  "The editor has no intel on this one yet",
  "This bar hasn't been dispatched yet",
  "No field reports on this one. First round's yours",
  "Menu unknown. Someone has to go first",
  "Off the index for now. Help us fix that",
  "The pints are there. The prices aren't. Yet",
  "Dark horse. No prices on record",
];

export default function BarDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const barId = Number(id);
  const { currency } = useAppStore();
  const { data: bar, isLoading } = trpc.bars.getById.useQuery({ id: barId }, { enabled: !!id });
  const reportMutation = trpc.bars.report.useMutation();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<"closed"|"wrong_info"|"drink_not_served"|"other">("wrong_info");
  const [reportDetail, setReportDetail] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  if (isLoading || !bar) return <LoadingMessage surface="bar" />;

  const openState = isOpenNow(bar.openingHours);
  const activeHappyHour = bar.deals.find(d => d.type === "happy_hour" && d.isActive);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: bar.name, text: `${bar.name} on Belfast Pint Map`, url }); }
      catch {}
    } else {
      try { await navigator.clipboard.writeText(url); } catch {}
    }
  };

  const submitReport = async () => {
    try {
      await reportMutation.mutateAsync({ barId, reason: reportReason, detail: reportDetail || undefined });
      setReportSuccess(true);
      setTimeout(() => {
        setReportOpen(false);
        setReportSuccess(false);
      }, 2000);
    } catch (err: any) {
      alert(err?.message ?? "Something went wrong.");
    }
  };

  return (
    <div className="grain-ink max-w-md mx-auto pb-4">
      {/* Back row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-meta opacity-70" aria-label="Go back">
          <ChevronLeft size={16} strokeWidth={1.6} />
          BACK
        </button>
        <div className="flex items-center gap-1">
          <button onClick={share} className="p-2" aria-label="Share">
            <Share2 size={16} strokeWidth={1.6} className="opacity-70" />
          </button>
          <button onClick={() => setReportOpen(true)} className="p-2" aria-label="Report a problem">
            <Flag size={16} strokeWidth={1.6} className="opacity-70" />
          </button>
        </div>
      </div>

      {/* Vermillion masthead */}
      <section className="grain-blaze text-[var(--color-paper)] px-5 py-6">
        <div className="text-eyebrow opacity-90">DRINKING ESTABLISHMENT · {bar.type?.toUpperCase()}</div>
        <h1 className="text-headline mt-3">{bar.name}</h1>
        {bar.businessStatus === 'CLOSED_TEMPORARILY' && (
          <div className="inline-block bg-[var(--color-blaze)] text-[var(--color-paper)] px-2 py-1 text-meta mt-2 mb-1">
            ⚠ TEMPORARILY CLOSED
          </div>
        )}
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-meta opacity-90">{bar.area?.toUpperCase()}</div>
            {bar.address && <div className="text-meta opacity-80 mt-1">{bar.address.toUpperCase()}</div>}
          </div>
          <div className={`px-2.5 py-1.5 ${openState.open
            ? "bg-[var(--color-ink)] text-[var(--color-verified)]"
            : "bg-[var(--color-ink)] text-[var(--color-paper)] opacity-70"}`}>
            <div className="text-meta flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                openState.open ? "bg-[var(--color-verified)]" : "bg-[var(--color-paper)] opacity-50"
              }`} />
              {openState.open ? "OPEN NOW" : "CLOSED"}
            </div>
            {bar.openingHours && (
              <div className="text-meta opacity-70 mt-0.5">
                {bar.openingHours.replace('-', ' – ')}
              </div>
            )}
          </div>
        </div>
        {bar.rating && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(i => (
                <svg key={i} width="12" height="12" viewBox="0 0 24 24"
                  fill={i <= Math.round(bar.rating!) ? "currentColor" : "none"}
                  stroke="currentColor" strokeWidth="2"
                  className="opacity-90">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              ))}
            </div>
            <span className="text-meta opacity-90">{bar.rating.toFixed(1)} / 5</span>
          </div>
        )}
      </section>

      {/* Happy hour ribbon */}
      {activeHappyHour && (
        <div className="bg-[var(--color-sun)] text-[var(--color-ink)] px-5 py-3 flex items-center justify-between">
          <div>
            <div className="text-eyebrow opacity-70">HAPPY HOUR</div>
            <div className="font-display text-lg uppercase mt-0.5">{activeHappyHour.startTime} – {activeHappyHour.endTime} DAILY</div>
          </div>
          {activeHappyHour.description && <div className="font-display text-lg uppercase">{activeHappyHour.description}</div>}
        </div>
      )}

      {/* View on map link */}
      <Link to={`/map?focus=${bar.id}`} className="flex items-center justify-between px-5 py-3 hairline-b">
        <div className="flex items-center gap-2">
          <MapPin size={16} strokeWidth={1.6} className="text-[var(--color-blaze)]" />
          <span className="text-meta">VIEW ON MAP</span>
        </div>
        <ChevronRight size={14} strokeWidth={1.4} className="opacity-50" />
      </Link>
      {bar.googleMapsUrl && (
        <a href={bar.googleMapsUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between px-5 py-3 hairline-b">
          <div className="flex items-center gap-2">
            <MapPin size={16} strokeWidth={1.6} className="text-[var(--color-blaze)]" />
            <span className="text-meta">VIEW ON GOOGLE MAPS</span>
          </div>
          <ChevronRight size={14} strokeWidth={1.4} className="opacity-50" />
        </a>
      )}
      {bar.websiteUrl && (
        <a href={bar.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between px-5 py-3 hairline-b">
          <div className="flex items-center gap-2">
            <Globe size={16} strokeWidth={1.6} className="text-[var(--color-blaze)]" />
            <span className="text-meta">VISIT WEBSITE</span>
          </div>
          <ChevronRight size={14} strokeWidth={1.4} className="opacity-50" />
        </a>
      )}
      {bar.phoneNumber && (
        <a
          href={`tel:${bar.phoneNumber.replace(/\s/g, '')}`}
          className="flex items-center justify-between px-5 py-3 hairline-b"
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                 className="text-[var(--color-blaze)]">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span className="text-meta">CALL BAR</span>
          </div>
          <span className="text-meta opacity-60">{bar.phoneNumber}</span>
        </a>
      )}

      {/* Drinks list */}
      <section className="pt-4 pb-3">
        <div className="hairline-b flex items-baseline justify-between pb-1.5 mb-1 px-5">
          <div className="font-display text-lg uppercase">DRINKS LIST</div>
          <div className="text-meta opacity-55">{bar.drinks.length.toString().padStart(2,"0")} ENTRIES</div>
        </div>
        {bar.drinks.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="font-display text-xl uppercase text-[var(--color-paper)] mb-3">NO PRICES ON RECORD</div>
            <div className="text-meta opacity-55 mb-6">
              {EMPTY_BAR_MESSAGES[bar.id % EMPTY_BAR_MESSAGES.length]}
            </div>
            <Link to={`/submit/${bar.id}`} className="inline-block border border-[var(--color-blaze)] text-[var(--color-blaze)] px-5 py-2.5 text-meta uppercase">
              REPORT A PRICE →
            </Link>
          </div>
        ) : (() => {
          const sortedDrinks = [...bar.drinks].sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return parseSizeValue(a.size) - parseSizeValue(b.size);
          });
          const grouped = DRINK_TYPE_ORDER.reduce((acc, type) => {
            const typeDrinks = sortedDrinks.filter(d => ((d as any).drinkType || detectDrinkType(d.name)) === type);
            if (typeDrinks.length > 0) acc[type] = typeDrinks;
            return acc;
          }, {} as Record<string, typeof sortedDrinks>);
          let globalIdx = 0;
          return (
            <div>
              {Object.entries(grouped).map(([type, typeDrinks]) => (
                <div key={type}>
                  <div className="sticky top-0 z-10 bg-[var(--color-ink)] border-l-2 border-[var(--color-blaze)] px-5 py-2 flex items-center justify-between">
                    <span className="font-display text-sm uppercase text-[var(--color-blaze)]">
                      {DRINK_TYPE_LABELS[type as keyof typeof DRINK_TYPE_LABELS]}
                    </span>
                    <span className="text-meta opacity-50">{typeDrinks.length.toString().padStart(2,'0')}</span>
                  </div>
                  <ul>
                    {typeDrinks.map(drink => {
                      const i = globalIdx++;
                      const verified = drink.isVerified;
                      const stale = isVerifiedStale(drink.verifiedAt);
                      const displayPrice = formatPrice(convertPrice(drink.price, drink.currency as any, currency), currency);
                      return (
                        <li key={drink.id} className="hairline-b-soft last:border-b-0 py-4 px-5 flex items-center gap-3">
                          <span className="num-rail text-[var(--color-blaze)] w-6 shrink-0">{String(i+1).padStart(2,"0")}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-display text-base uppercase text-[var(--color-paper)] leading-snug mb-0.5">{drink.name}</div>
                            <div className="text-meta opacity-60 mt-0.5 flex items-center gap-2 flex-wrap">
                              {drink.size && <span>{drink.size.toUpperCase()}</span>}
                              {verified && !stale && <span className="verified-pill">VERIFIED</span>}
                              {verified && stale && <span className="stale-pill">VERIFIED · STALE</span>}
                              {!verified && <span className="opacity-55">UNVERIFIED</span>}
                            </div>
                          </div>
                          <div className="font-display text-lg text-[var(--color-sun)]">{displayPrice}</div>
                          <Link
                            to={`/submit/${bar.id}?drink=${encodeURIComponent(drink.name)}&size=${encodeURIComponent(drink.size ?? "")}&update=1`}
                            className="shrink-0 w-8 h-8 flex items-center justify-center border border-[var(--color-rule)] opacity-50 hover:opacity-100 hover:border-[var(--color-blaze)] hover:text-[var(--color-blaze)] transition-colors"
                            title="Update price"
                            aria-label={`Update price for ${drink.name}`}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9"/>
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* Add a new drink CTA */}
      <Link to={`/submit/${bar.id}`} className="block mx-5 mb-6 grain-blaze text-[var(--color-paper)] px-4 py-3.5 flex items-center justify-between">
        <div>
          <div className="text-eyebrow opacity-60">CONTRIBUTE</div>
          <div className="font-display text-lg uppercase mt-0.5">REPORT A NEW PRICE</div>
        </div>
        <ChevronRight size={16} strokeWidth={1.6} />
      </Link>

      {/* Report sheet */}
      {reportOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-[var(--color-ink)] bg-opacity-70" onClick={() => setReportOpen(false)}>
          <div className="mt-auto bg-[var(--color-paper)] text-[var(--color-ink)] sheet-enter" onClick={e => e.stopPropagation()}>
            <div className="self-center mt-3 mb-1 mx-auto w-10 h-1 bg-[var(--color-ink)] opacity-25 rounded" />
            {reportSuccess ? (
              <div className="px-5 py-8 text-center">
                <div className="font-display text-2xl uppercase text-[var(--color-ink)]">THANKS</div>
                <div className="text-meta opacity-60 mt-3">
                  YOUR REPORT HAS BEEN RECEIVED. WE'LL LOOK INTO IT.
                </div>
              </div>
            ) : (
              <div className="px-5 py-4">
                <div className="text-eyebrow opacity-60">REPORT A PROBLEM</div>
                <div className="font-display text-2xl uppercase mt-2">SOMETHING<br/>WRONG?</div>
                <div className="mt-4 space-y-1.5">
                  {[
                    ["closed","Bar permanently closed"],
                    ["wrong_info","Wrong info"],
                    ["drink_not_served","Drink not served"],
                    ["other","Something else"],
                  ].map(([val,label]) => (
                    <button
                      key={val}
                      onClick={() => setReportReason(val as any)}
                      className={`w-full text-left px-3 min-h-[44px] border ${reportReason === val ? "bg-[var(--color-ink)] text-[var(--color-paper)] border-[var(--color-ink)]" : "border-[var(--color-rule-paper)]"}`}
                    >
                      <span className="text-meta">{label}</span>
                    </button>
                  ))}
                  <textarea
                    value={reportDetail}
                    onChange={e => setReportDetail(e.target.value)}
                    placeholder="Any extra details? (optional)"
                    maxLength={500}
                    rows={3}
                    className="w-full bg-transparent border border-[var(--color-rule-paper)] px-3 py-2.5 text-[var(--color-ink)] text-sm resize-none mt-2 focus:outline-none focus:border-[var(--color-ink)]"
                  />
                </div>
                <button onClick={submitReport} className="w-full mt-4 bg-[var(--color-blaze)] text-[var(--color-paper)] py-4 font-display text-lg uppercase min-h-[44px]">
                  SEND REPORT
                </button>
                <button onClick={() => setReportOpen(false)} className="w-full mt-2 text-meta opacity-55 py-4 min-h-[44px]">
                  CANCEL
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
