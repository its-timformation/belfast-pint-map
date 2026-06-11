import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAppStore, convertPrice, formatPrice, isOpenNow, distanceKm } from "../lib/store";
import { LoadingMessage } from "./LoadingMessage";

interface Props {
  open: boolean;
  onClose: () => void;
  userLocation?: { lat: number; lng: number } | null;
}

// Snap points as fraction of viewport height the sheet occupies
const SNAP_SM = 0.44;
const SNAP_LG = 0.88;
const DISMISS_THRESHOLD = 0.20;
const VELOCITY_DISMISS  = 700;   // px/s downward flick
const VELOCITY_EXPAND   = -500;  // px/s upward flick
const DRAG_THRESHOLD    = 6;     // px before we commit to drag

export function GuinnessSheet({ open, onClose, userLocation }: Props) {
  const { currency } = useAppStore();
  const { data: allBars, isLoading } = trpc.bars.getAllWithDetails.useQuery(
    undefined, { enabled: open }
  );

  const [snap, setSnap]         = useState(SNAP_SM);
  const [dragH, setDragH]       = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);

  // Drag refs — never trigger re-renders
  const dragging      = useRef(false);
  const committed     = useRef(false);   // true once we've crossed DRAG_THRESHOLD
  const justDragged   = useRef(false);   // suppress click events after a real drag
  const startY        = useRef(0);
  const startH        = useRef(0);
  const lastY         = useRef(0);
  const lastT         = useRef(0);
  const velocity      = useRef(0);

  useEffect(() => {
    if (open) { setSnap(SNAP_SM); setDragH(null); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const vh = window.innerHeight;

  /* ── Pointer handlers ──────────────────────────────────────── */

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current  = true;
    committed.current = false;
    startY.current    = e.clientY;
    startH.current    = dragH ?? snap * vh;
    lastY.current     = e.clientY;
    lastT.current     = performance.now();
    velocity.current  = 0;
    setAnimating(false);
    // Don't setPointerCapture yet — wait for DRAG_THRESHOLD
  }, [dragH, snap, vh]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;

    if (!committed.current) {
      if (Math.abs(e.clientY - startY.current) < DRAG_THRESHOLD) return;
      // Cross threshold → commit
      committed.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    const now = performance.now();
    const dt  = (now - lastT.current) / 1000;
    if (dt > 0) velocity.current = (lastY.current - e.clientY) / dt;
    lastY.current = e.clientY;
    lastT.current = now;

    const delta = startY.current - e.clientY;
    const newH  = Math.max(80, Math.min(vh * 0.96, startH.current + delta));
    setDragH(newH);
  }, [vh]);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;

    if (!committed.current) {
      committed.current = false;
      return;
    }
    committed.current = false;

    // Block the click event that fires after pointerup
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 250);

    const h     = dragH ?? snap * vh;
    const ratio = h / vh;
    const v     = velocity.current;

    setAnimating(true);
    setDragH(null);

    if (v < VELOCITY_DISMISS || ratio < DISMISS_THRESHOLD) {
      onClose();
    } else if (v > Math.abs(VELOCITY_EXPAND)) {
      setSnap(SNAP_LG);
    } else {
      const mid = (SNAP_SM + SNAP_LG) / 2;
      setSnap(ratio > mid ? SNAP_LG : SNAP_SM);
    }
  }, [dragH, snap, vh, onClose]);

  /* ── Data ──────────────────────────────────────────────────── */

  const nearbyGuinnessBars = useMemo(() => {
    if (!allBars) return [];
    const center = userLocation || { lat: 54.5973, lng: -5.9301 };
    return allBars
      .filter(b => b.servesGuinness)
      .map(b => {
        const g = (b.drinks ?? []).find(d =>
          d.name.toLowerCase().includes("guinness") ||
          d.name.toLowerCase().includes("stout")
        );
        return {
          ...b,
          distance:      distanceKm(center, { lat: b.lat, lng: b.lng }),
          guinnessPrice: g ? { price: g.price, currency: g.currency } : null,
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 14);
  }, [allBars, userLocation]);

  if (!open) return null;

  const sheetH = dragH ?? snap * vh;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Nearest Guinness">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-[var(--color-ink)] opacity-70 cursor-default"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--color-paper)] text-[var(--color-ink)] rounded-t-2xl flex flex-col select-none"
        style={{
          height: sheetH,
          transition: animating && !dragging.current
            ? "height 0.30s cubic-bezier(0.32,0.72,0,1)"
            : "none",
          touchAction: "none",
          willChange:  "height",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // Suppress navigation click if we just dragged
        onClick={e => { if (justDragged.current) e.preventDefault(); }}
      >
        {/* Drag handle pill */}
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--color-ink)] opacity-20" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="text-eyebrow opacity-60 leading-none mb-1">PERFECT TIME FOR A GUINNESS</div>
            <h2 className="text-headline mt-1 leading-none">WORTH THE<br/>WALK</h2>
          </div>
          {/* Close button stops drag so a tap always fires */}
          <button
            onClick={onClose}
            onPointerDown={e => e.stopPropagation()}
            className="p-2 -mr-2 !min-h-0 cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X size={20} strokeWidth={1.6} />
          </button>
        </div>

        {/* Bar list — overflow hidden, no inner scroll */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <LoadingMessage surface="guinness" />
          ) : nearbyGuinnessBars.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="text-section uppercase">NO STOUT IN SIGHT</div>
              <div className="text-meta opacity-60 mt-3">No Guinness pourers found nearby yet.</div>
            </div>
          ) : (
            <ul>
              {nearbyGuinnessBars.map((bar, i) => {
                const priceInfo = bar.guinnessPrice;
                const openState = isOpenNow(bar.openingHours);
                return (
                  <li key={bar.id}>
                    {/* stopPropagation on pointerDown so tapping a row doesn't start drag */}
                    <Link
                      to={`/bar/${bar.id}`}
                      onClick={e => { if (justDragged.current) { e.preventDefault(); return; } onClose(); }}
                      onPointerDown={e => e.stopPropagation()}
                      className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--color-rule-paper)] last:border-b-0"
                    >
                      <span className="num-rail text-[var(--color-blaze)] w-6 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base uppercase">{bar.name}</div>
                        <div className="text-meta opacity-60 mt-0.5 flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                            openState.open ? "bg-[var(--color-verified)]" : "bg-[var(--color-ink)] opacity-35"
                          }`} />
                          {openState.open
                            ? `OPEN UNTIL ${openState.closesAt}`
                            : `OPENS ${openState.opensAt ?? "—"}`}
                          {" · "}{bar.distance.toFixed(1)} KM
                          {bar.area ? ` · ${bar.area.toUpperCase()}` : ""}
                        </div>
                      </div>
                      {priceInfo && (
                        <div className="font-display text-lg shrink-0">
                          {formatPrice(
                            convertPrice(priceInfo.price, priceInfo.currency as any, currency),
                            currency
                          )}
                        </div>
                      )}
                      <ChevronRight size={14} strokeWidth={1.4} className="opacity-50 shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-[var(--color-rule-paper)]">
          <Link
            to="/list?filter=guinness"
            onClick={e => { if (justDragged.current) { e.preventDefault(); return; } onClose(); }}
            onPointerDown={e => e.stopPropagation()}
            className="flex items-center justify-center gap-2 border-2 border-[var(--color-ink)] text-[var(--color-ink)] py-3 text-meta font-display uppercase hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-colors"
          >
            VIEW ALL GUINNESS BARS →
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard trigger banner ────────────────────────────────── */
export function GuinnessBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full grain-paper text-[var(--color-ink)] px-5 py-4 border-t-2 border-[var(--color-ink)] flex items-center justify-between gap-4 hover:bg-[var(--color-paper-soft)] transition-colors"
      aria-label="See the nearest Guinness"
    >
      <div className="text-left">
        <div className="text-eyebrow opacity-60">PERFECT TIME FOR</div>
        <div className="font-display text-2xl uppercase leading-none mt-1.5">A GUINNESS</div>
      </div>
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none"
           stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
           strokeLinejoin="round" aria-hidden>
        <path d="M7 14 L7 2 M2 7 L7 2 L12 7" />
      </svg>
    </button>
  );
}
