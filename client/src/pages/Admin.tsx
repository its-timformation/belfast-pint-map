import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { APP_VERSION, VERSION_DATE } from '../lib/version';
import { trpc } from "../lib/trpc";
import { LoadingMessage } from "../components/LoadingMessage";
import SubmissionsQueue from "../admin/SubmissionsQueue";
import BarsManager from "../components/BarsManager";
import DrinksCatalogue from "../admin/DrinksCatalogue";
import DealsManager from "../admin/DealsManager";
import ReportsManager from "../admin/ReportsManager";
import EditorsPickAdmin from "../admin/EditorsPick";

type Section = "home" | "queue" | "bars" | "drinks" | "deals" | "reports" | "pick" | "suggestions";

interface Props { onExit: () => void; }

export default function Admin({ onExit }: Props) {
  const [section, setSection] = useState<Section>("home");
  const { data: submissions, isLoading } = trpc.admin.getSubmissions.useQuery();
  const { data: bars } = trpc.bars.getAll.useQuery();
  const { data: deals } = trpc.bars.getDeals.useQuery();
  const { data: reports } = trpc.bars.getReports.useQuery();
  const { data: suggestions } = trpc.bars.getBarSuggestions.useQuery();

  const pendingCount = (submissions ?? []).filter(s => s.status === "pending").length;
  const openReports = (reports ?? []).filter(r => r.status === "open").length;
  const activeDeals = (deals ?? []).filter(d => d.isActive).length;
  const pendingSuggestions = (suggestions ?? []).filter(s => s.status === "pending").length;

  if (section === "queue") return <SubmissionsQueue onBack={() => setSection("home")} />;
  if (section === "bars") return <BarsManager onBack={() => setSection("home")} />;
  if (section === "drinks") return <DrinksCatalogue onBack={() => setSection("home")} />;
  if (section === "deals") return <DealsManager onBack={() => setSection("home")} />;
  if (section === "reports") return <ReportsManager onBack={() => setSection("home")} />;
  if (section === "pick") return <EditorsPickAdmin onBack={() => setSection("home")} />;
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
    ["queue", "SUBMISSIONS QUEUE", "REVIEW NEW PRICES & UPDATES", pendingCount, "blaze"],
    ["bars", "BARS DIRECTORY", `${bars?.length ?? 0} ACTIVE · ADD, EDIT, REMOVE`, null, ""],
    ["drinks", "DRINKS CATALOGUE", "VERIFY & MANAGE", null, ""],
    ["deals", "DEALS & EVENTS", `${activeDeals} ACTIVE · HAPPY HOURS`, null, ""],
    ["reports", "USER REPORTS", "FLAGGED ISSUES & FEEDBACK", openReports, "sun"],
    ["suggestions", "BAR SUGGESTIONS", "SUBMITTED BY USERS", pendingSuggestions, "verified"],
    ["pick", "EDITOR'S PICK", "CONFIGURE FEATURED BAR", null, ""],
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

      {/* Stats */}
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
          <div className="text-meta opacity-55">07 AREAS</div>
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
                  <span className={`text-meta px-2 py-1 ${badgeColor === "blaze" ? "bg-[var(--color-blaze)] text-[var(--color-paper)]" : "bg-[var(--color-sun)] text-[var(--color-ink)]"}`}>
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
          <span className="flex items-center gap-2">
            <X size={14} strokeWidth={1.6} />
            EXIT ADMIN MODE
          </span>
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
