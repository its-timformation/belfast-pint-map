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

// ─── Snap points (fraction of viewport height) ────────────────
const SNAP_PEEK   = 0.42;   // default — title + ~4 bars visible
const SNAP_FULL   = 0.88;   // expanded — content scrolls inside
const DISMISS_VH  = 0.18;   // ratio below which sheet auto-closes
const VEL_DISMISS = 600;    // px/s downward flick → close
const VEL_EXPAND  = -500;   // px/s upward flick → expand

export function GuinnessSheet({ open, onClose, userLocation }: Props) {
  const { currency } = useAppStore();
  const { data: allBars, isLoading } = trpc.bars.getAllWithDetails.useQuery(
    undefined, { enabled: open }
  );

  const [snap, setSnap]         = useState(SNAP_PEEK);
  const [dragH, setDragH]       = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);

  // Pointer tracking — all refs so no extra re-renders
  const dragging  = useRef(false);
  const startY    = useRef(0);
  const startH    = useRef(0);
  const lastY     = useRef(0);
  const lastT     = useRef(0);
  const velRef    = useRef(0);

  useEffect(() => {
    if (open) { setSnap(SNAP_PEEK); setDragH(null); setAnimating(false); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  /* ─── Drag handlers — only wired to the handle+header zone ─── */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    startY.current   = e.clientY;
    startH.current   = dragH ?? snap * vh;
    lastY.current    = e.clientY;
    lastT.current    = performance.now();
    velRef.current   = 0;
    setAnimating(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [dragH, snap, vh]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const now = performance.now();
    const dt  = (now - lastT.current) / 1000;
    if (dt > 0) velRef.current = (lastY.current - e.clientY) / dt; // +ve = upward
    lastY.current = e.clientY;
    lastT.current = now;

    const delta = startY.current - e.clientY; // +ve = dragged up
    const newH  = Math.max(80, Math.min(vh * 0.96, startH.current + delta));
    setDragH(newH);
  }, [vh]);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;

    const h     = dragH ?? snap * vh;
    const ratio = h / vh;
    const v     = velRef.current;

    setAnimating(true);
    setDragH(null);

    if (v < VEL_DISMISS || ratio < DISMISS_VH) {
      onClose();
    } else if (v > Math.abs(VEL_EXPAND)) {
      setSnap(SNAP_FULL);
    } else {
      const mid = (SNAP_PEEK + SNAP_FULL) / 2;
      setSnap(ratio > mid ? SNAP_FULL : SNAP_PEEK);
    }
  }, [dragH, snap, vh, onClose]);

  /* ─── Data ───────────────────────────────────────────────────── */
  const nearbyGuinnessBars = useMemo(() => {
    if (!allBars) return [];
    const center = userLocation ?? { lat: 54.5973, lng: -5.9301 };
    return allBars
      .filter(b => b.servesGuinness)
      .map(b => {
        const g = (b.drinks ?? []).find(d =>
          /guinness|stout/i.test(d.name)
        );
        return {
          ...b,
          distance:      distanceKm(center, { lat: b.lat, lng: b.lng }),
          guinnessPrice: g ? { price: g.price, currency: g.currency } : null,
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 20);
  }, [allBars, userLocation]);

  if (!open) return null;

  const sheetH = dragH ?? snap * vh;
  const isDragging = dragging.current;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Nearest Guinness">

      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-[var(--color-ink)] opacity-70 cursor-default"
        style={{ WebkitTapHighlightColor: "transparent" }}
        onClick={onClose}
        aria-label="Close"
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--color-paper)] text-[var(--color-ink)] rounded-t-2xl flex flex-col"
        style={{
          height: sheetH,
          transition: animating && !isDragging
            ? "height 0.28s cubic-bezier(0.32,0.72,0,1)"
            : "none",
          willChange: "height",
          // No touchAction here — the two child zones handle it separately
        }}
      >

        {/* ── DRAG ZONE: handle pill + header ──────────────────
            touchAction:none here so pointer events fire reliably.
            This zone is always draggable; no interactive children
            except the close button (which stopPropagates).        */}
        <div
          className="shrink-0 select-none"
          style={{
            touchAction: "none",
            cursor: isDragging ? "grabbing" : "grab",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Pill */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-[var(--color-ink)] opacity-20" />
          </div>

          {/* Header */}
          <div className="px-5 pb-3 flex items-start justify-between gap-4">
            <div>
              <div className="text-eyebrow opacity-60 leading-none mb-1">
                PERFECT TIME FOR A GUINNESS
              </div>
              <h2 className="text-headline leading-none">
                WORTH THE<br/>WALK
              </h2>
            </div>
            {/* Close — stopPropagation prevents drag starting here */}
            <button
              onClick={onClose}
              onPointerDown={e => e.stopPropagation()}
              className="mt-1 p-2 -mr-2 !min-h-0 shrink-0"
              aria-label="Close"
            >
              <X size={20} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* ── SCROLL ZONE: bar list ─────────────────────────────
            touchAction:pan-y lets the browser handle vertical
            scroll natively — smooth momentum on iOS & Android.
            overflow-y:auto so content never gets clipped.        */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{
            touchAction: "pan-y",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties}
        >
          {isLoading ? (
            <LoadingMessage surface="guinness" />
          ) : nearbyGuinnessBars.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="text-section uppercase">NO STOUT IN SIGHT</div>
              <div className="text-meta opacity-60 mt-3">No Guinness pourers found nearby yet.</div>
            </div>
          ) : (
            <ul className="pb-1">
              {nearbyGuinnessBars.map((bar, i) => {
                const priceInfo = bar.guinnessPrice;
                const openState = isOpenNow(bar.openingHours);
                return (
                  <li key={bar.id}>
                    <Link
                      to={`/bar/${bar.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--color-rule-paper)] last:border-b-0 active:bg-[var(--color-paper-soft)]"
                    >
                      <span className="num-rail text-[var(--color-blaze)] w-6 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base uppercase leading-tight">
                          {bar.name}
                        </div>
                        <div className="text-meta opacity-60 mt-0.5 flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                            openState.open
                              ? "bg-[var(--color-verified)]"
                              : "bg-[var(--color-ink)] opacity-35"
                          }`} />
                          {openState.open
                            ? `OPEN UNTIL ${openState.closesAt}`
                            : `OPENS ${openState.opensAt ?? "—"}`}
                          {" · "}{bar.distance.toFixed(1)} KM
                          {bar.area ? ` · ${bar.area.toUpperCase()}` : ""}
                        </div>
                      </div>
                      {priceInfo && (
                        <div className="font-display text-lg shrink-0 text-[var(--color-ink)]">
                          {formatPrice(
                            convertPrice(priceInfo.price, priceInfo.currency as any, currency),
                            currency
                          )}
                        </div>
                      )}
                      <ChevronRight size={14} strokeWidth={1.4} className="opacity-40 shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Footer CTA ────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-4 border-t border-[var(--color-rule-paper)]">
          <Link
            to="/list?filter=guinness"
            onClick={onClose}
            className="flex items-center justify-center gap-2 border-2 border-[var(--color-ink)] text-[var(--color-ink)] py-3 text-meta font-display uppercase hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-colors"
          >
            VIEW ALL GUINNESS BARS →
          </Link>
        </div>

      </div>
    </div>
  );
}

/* ── Dashboard trigger banner ─────────────────────────────── */
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
