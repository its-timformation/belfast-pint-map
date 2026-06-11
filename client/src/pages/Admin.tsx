import { useState } from "react";
import { ChevronRight, X, Check } from "lucide-react";
import { APP_VERSION, VERSION_DATE } from '../lib/version';
import { trpc } from "../lib/trpc";
import { LoadingMessage } from "../components/LoadingMessage";
import SubmissionsQueue from "../admin/SubmissionsQueue";
import BarsManager from "../components/BarsManager";
import DrinksCatalogue from "../admin/DrinksCatalogue";
import DealsManager from "../admin/DealsManager";
import ReportsManager from "../admin/ReportsManager";
import EditorsPickAdmin from "../admin/EditorsPick";

type Section = "home" | "queue" | "bars" | "drinks" | "deals" | "reports" | "pick" | "suggestions" | "crawls";

interface Props { onExit: () => void; }

export default function Admin({ onExit }: Props) {
  const [section, setSection] = useState<Section>("home");
  const { data: submissions, isLoading } = trpc.admin.getSubmissions.useQuery();
  const { data: bars }        = trpc.bars.getAll.useQuery();
  const { data: deals }       = trpc.bars.getDeals.useQuery();
  const { data: reports }     = trpc.bars.getReports.useQuery();
  const { data: suggestions } = trpc.bars.getBarSuggestions.useQuery();
  const { data: allBars }     = trpc.bars.getAll.useQuery();

  const pendingCount      = (submissions ?? []).filter(s => s.status === "pending").length;
  const openReports       = (reports ?? []).filter(r => r.status === "open").length;
  const activeDeals       = (deals ?? []).filter(d => d.isActive).length;
  const pendingSuggestions = (suggestions ?? []).filter(s => s.status === "pending").length;

  if (section === "queue")       return <SubmissionsQueue onBack={() => setSection("home")} />;
  if (section === "bars")        return <BarsManager onBack={() => setSection("home")} />;
  if (section === "drinks")      return <DrinksCatalogue onBack={() => setSection("home")} />;
  if (section === "deals")       return <DealsManager onBack={() => setSection("home")} />;
  if (section === "reports")     return <ReportsManager onBack={() => setSection("home")} />;
  if (section === "pick")        return <EditorsPickAdmin onBack={() => setSection("home")} />;
  if (section === "crawls")      return <CrawlsAdmin onBack={() => setSection("home")} allBars={allBars ?? []} />;

  if (section === "suggestions") return (
    <div className="grain-ink pb-8 max-w-md mx-auto">
      <div className="px-4 py-3 flex items-center justify-between hairline-b">
        <button onClick={() => setSection("home")} className="text-meta opacity-70">← ADMIN</button>
      </div>
      <section className="px-4 pt-5 pb-3">
        <h1 className="text-headline">BAR<br/>SUGGESTIONS</h1>
      </section>
      <div className="px-4">
        {(suggestions ?? []).length === 0 && <div className="text-meta opacity-55 py-8">No suggestions yet.</div>}
        {(suggestions ?? []).map((s: any) => (
          <div key={s.id} className="border border-[var(--color-rule)] p-3 mb-3">
            <div className="font-display text-base uppercase">{s.name}</div>
            {s.area && <div className="text-meta opacity-60">{s.area.toUpperCase()}</div>}
            {s.notes && <div className="text-meta opacity-80 mt-1">{s.notes}</div>}
            <div className="text-meta opacity-40 mt-1">{s.submittedBy ? `by ${s.submittedBy} · ` : ''}{s.createdAt?.slice(0,10)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  if (isLoading) return <LoadingMessage surface="admin" />;

  const sections: Array<[Section, string, string, number | null, string]> = [
    ["queue",       "SUBMISSIONS QUEUE",   "REVIEW NEW PRICES & UPDATES",      pendingCount,       "blaze"],
    ["bars",        "BARS DIRECTORY",       `${bars?.length ?? 0} ACTIVE · ADD, EDIT, REMOVE`, null, ""],
    ["drinks",      "DRINKS CATALOGUE",    "VERIFY & MANAGE",                  null,               ""],
    ["deals",       "DEALS & EVENTS",      `${activeDeals} ACTIVE · HAPPY HOURS`, null,            ""],
    ["reports",     "USER REPORTS",        "FLAGGED ISSUES & FEEDBACK",        openReports,        "sun"],
    ["suggestions", "BAR SUGGESTIONS",     "SUBMITTED BY USERS",               pendingSuggestions, "verified"],
    ["pick",        "EDITOR'S PICK",       "CONFIGURE FEATURED BAR",           null,               ""],
    ["crawls",      "COMMUNITY CRAWLS",    "REVIEW & APPROVE SUBMITTED CRAWLS",null,               ""],
  ];

  return (
    <div className="grain-ink pb-6 max-w-md mx-auto">
      <section className="px-4 pt-5 pb-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-eyebrow text-[var(--color-blaze)]">CONTROL ROOM · ADMIN</div>
          <div className="text-eyebrow opacity-40">v{APP_VERSION} · {VERSION_DATE}</div>
        </div>
        <h1 className="text-headline">WELCOME<br/>BACK</h1>
      </section>

      <div className="px-4 mb-5 flex gap-2">
        <div className="flex-1 border border-[var(--color-rule)] px-2.5 py-2">
          <div className="text-eyebrow opacity-60">PENDING</div>
          <div className="font-display text-2xl text-[var(--color-blaze)] mt-0.5">{pendingCount.toString().padStart(2,"0")}</div>
        </div>
        <div className="flex-1 border border-[var(--color-rule)] px-2.5 py-2">
          <div className="text-eyebrow opacity-60">BARS</div>
          <div className="font-display text-2xl mt-0.5">{(bars?.length ?? 0).toString().padStart(2,"0")}</div>
        </div>
        <div className="flex-1 border border-[var(--color-rule)] px-2.5 py-2">
          <div className="text-eyebrow opacity-60">FLAGS</div>
          <div className="font-display text-2xl text-[var(--color-sun)] mt-0.5">{openReports.toString().padStart(2,"0")}</div>
        </div>
      </div>

      <section className="px-4">
        <div className="hairline-b flex items-baseline justify-between pb-1.5 mb-1">
          <div className="font-display text-lg uppercase">SECTIONS</div>
          <div className="text-meta opacity-55">08 AREAS</div>
        </div>
        <ul>
          {sections.map(([key, label, sub, badge, badgeColor], i) => (
            <li key={key}>
              <button onClick={() => setSection(key)} className="w-full hairline-b-soft last:border-b-0 flex items-center gap-3 py-3.5 text-left">
                <span className="num-rail text-[var(--color-blaze)] w-7 shrink-0">{String(i+1).padStart(2,"0")}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-base uppercase text-[var(--color-paper)]">{label}</div>
                  <div className="text-meta opacity-60 mt-0.5">{sub}</div>
                </div>
                {badge !== null && badge > 0 && (
                  <span className={`text-meta px-2 py-1 ${badgeColor === "blaze" ? "bg-[var(--color-blaze)] text-[var(--color-paper)]" : badgeColor === "sun" ? "bg-[var(--color-sun)] text-[var(--color-ink)]" : "bg-[var(--color-verified)] text-[var(--color-ink)]"}`}>
                    {String(badge).padStart(2,"0")} NEW
                  </span>
                )}
                <ChevronRight size={14} strokeWidth={1.4} className="opacity-50" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 mx-4">
        <button onClick={onExit} className="w-full hairline-t flex items-center justify-between py-4 text-meta opacity-70">
          <span className="flex items-center gap-2"><X size={14} strokeWidth={1.6} />EXIT ADMIN MODE</span>
          <span className="opacity-60">SESSION 30 MIN</span>
        </button>
        <div className="flex items-center justify-between py-2 text-meta opacity-30">
          <span>VERSION</span>
          <span>{APP_VERSION} · {VERSION_DATE}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Crawl moderation panel ──────────────────────────────── */

function CrawlsAdmin({ onBack, allBars }: { onBack: () => void; allBars: Array<{ id: number; name: string; area?: string | null }> }) {
  const { data: submitted, refetch } = trpc.crawls.getSubmitted.useQuery();
  const moderateMut = trpc.crawls.moderate.useMutation({ onSuccess: () => refetch() });
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="grain-ink pb-8 max-w-md mx-auto">
      <div className="px-4 py-3 flex items-center justify-between hairline-b">
        <button onClick={onBack} className="text-meta opacity-70">← ADMIN</button>
      </div>
      <section className="px-4 pt-5 pb-3">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-2">COMMUNITY CRAWLS</div>
        <h1 className="text-headline">CRAWL<br/>MODERATION</h1>
      </section>
      <div className="px-4">
        {!submitted || submitted.length === 0 ? (
          <div className="text-meta opacity-55 py-8">No crawls awaiting review.</div>
        ) : submitted.map(crawl => {
          const barIds  = JSON.parse(crawl.barIds) as number[];
          const tags    = JSON.parse(crawl.tags ?? "[]") as string[];
          const isOpen  = expanded === crawl.shareCode;
          const stopBars = barIds.map(id => allBars.find(b => b.id === id)).filter(Boolean) as typeof allBars;

          return (
            <div key={crawl.id} className="border border-[var(--color-rule)] mb-4">
              <button
                onClick={() => setExpanded(isOpen ? null : crawl.shareCode)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-display text-base uppercase text-[var(--color-paper)] truncate">{crawl.name}</div>
                  <div className="text-meta opacity-50 mt-0.5">
                    {barIds.length} STOPS{crawl.authorName ? ` · BY ${crawl.authorName.toUpperCase()}` : ""} · {crawl.createdAt?.slice(0,10)}
                  </div>
                </div>
                <ChevronRight size={14} className={`opacity-50 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-[var(--color-rule)]">
                  {crawl.description && (
                    <p className="text-meta opacity-70 mt-3 mb-2">{crawl.description}</p>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {tags.map(t => (
                        <span key={t} className="text-eyebrow border border-[var(--color-rule)] px-2 py-0.5 opacity-50">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="mb-3">
                    <div className="text-eyebrow opacity-50 mb-1.5">ROUTE</div>
                    {stopBars.map((bar, i) => (
                      <div key={bar.id} className="flex items-center gap-2 hairline-b-soft py-1.5">
                        <span className="text-eyebrow text-[var(--color-blaze)] w-5">{String(i+1).padStart(2,"0")}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-sm uppercase truncate text-[var(--color-paper)]">{bar.name}</div>
                          {bar.area && <div className="text-meta opacity-40">{bar.area}</div>}
                        </div>
                      </div>
                    ))}
                    {barIds.some(id => !allBars.find(b => b.id === id)) && (
                      <div className="text-meta opacity-40 mt-1">⚠ Some bars not found in current directory</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => moderateMut.mutate({ shareCode: crawl.shareCode, action: "approve" })}
                      disabled={moderateMut.isPending}
                      className="flex-1 bg-[var(--color-verified)] text-[var(--color-ink)] font-display text-sm py-2.5 tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      <Check size={14} /> APPROVE
                    </button>
                    <button
                      onClick={() => moderateMut.mutate({ shareCode: crawl.shareCode, action: "reject" })}
                      disabled={moderateMut.isPending}
                      className="flex-1 border border-[var(--color-rule)] text-[var(--color-paper)] font-display text-sm py-2.5 tracking-wider hover:border-[var(--color-blaze)] disabled:opacity-40"
                    >
                      REJECT
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
