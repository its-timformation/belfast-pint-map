import { useEffect, useRef, useState, useMemo } from "react";
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

// ─── Sheet geometry ───────────────────────────────────────────
// The sheet has a FIXED height (MAX_H).
// We move it with translateY only — no height changes during drag.
// translateY = 0           → fully expanded (FULL snap)
// translateY = PEEK_OFFSET → peeking (PEEK snap)
// translateY = MAX_H       → off-screen (dismissed)
//
// This keeps drag 100 % GPU-composited, eliminating layout jank.

const MAX_FRAC  = 0.90;   // sheet height as fraction of vh
const PEEK_FRAC = 0.44;   // visible height at peek snap

export function GuinnessSheet({ open, onClose, userLocation }: Props) {
  const { currency } = useAppStore();
  const { data: allBars, isLoading } = trpc.bars.getAllWithDetails.useQuery(
    undefined, { enabled: open }
  );

  const sheetRef = useRef<HTMLDivElement>(null);

  // ── All drag state in refs — zero React renders during drag ──
  const isDragging   = useRef(false);
  const startY       = useRef(0);
  const startOffset  = useRef(0);
  const curOffset    = useRef(0);   // current translateY px
  const lastY        = useRef(0);
  const lastT        = useRef(0);
  const velY         = useRef(0);   // px/s — positive = moving DOWN

  // Controls whether the sheet DOM node is mounted
  const [mounted, setMounted] = useState(false);

  // ── Helpers ──────────────────────────────────────────────────
  function getGeometry() {
    const vh      = window.innerHeight;
    const maxH    = Math.round(vh * MAX_FRAC);
    const peekH   = Math.round(vh * PEEK_FRAC);
    const peekOff = maxH - peekH;   // translateY for peek
    return { maxH, peekH, peekOff };
  }

  function applyTransform(offset: number, animated: boolean) {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = animated
      ? "transform 0.34s cubic-bezier(0.32,0.72,0,1)"
      : "none";
    el.style.transform = `translateY(${offset}px)`;
    curOffset.current = offset;
  }

  // ── Open / close animation ────────────────────────────────────
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two rAFs: first sets start position (off-screen), second animates in.
      // The sheet DOM node might not exist yet until after setMounted re-render,
      // so we wait a couple of frames.
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const { maxH, peekOff } = getGeometry();
          applyTransform(maxH, false);
          requestAnimationFrame(() => {
            applyTransform(peekOff, true);
          });
        });
      });
      return () => cancelAnimationFrame(id);
    } else {
      // Animate out then unmount
      const { maxH } = getGeometry();
      applyTransform(maxH, true);
      const t = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Escape key ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // ── Drag — handle zone only ───────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current  = true;
    startY.current      = e.clientY;
    startOffset.current = curOffset.current;
    lastY.current       = e.clientY;
    lastT.current       = performance.now();
    velY.current        = 0;
    applyTransform(curOffset.current, false); // kill transition immediately
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    const { maxH } = getGeometry();
    const delta  = e.clientY - startY.current;
    // Allow small overscroll above full (bouncy feel) but not below dismissed
    const newOff = Math.max(-24, Math.min(maxH * 1.05, startOffset.current + delta));
    applyTransform(newOff, false);

    const now = performance.now();
    const dt  = (now - lastT.current) / 1000;
    if (dt > 0.004) velY.current = (e.clientY - lastY.current) / dt;
    lastY.current = e.clientY;
    lastT.current = now;
  }

  function handlePointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;

    const { maxH, peekOff } = getGeometry();
    const off = curOffset.current;
    const v   = velY.current; // +ve = moving down (towards dismiss)

    if (v > 550 || off > maxH * 0.65) {
      // Fast flick down, or dragged past 65 % → dismiss
      applyTransform(maxH, true);
      setTimeout(onClose, 340);
    } else if (v < -450 || off < peekOff * 0.4) {
      // Fast flick up, or dragged well above peek → full
      applyTransform(0, true);
    } else {
      // Snap to nearest
      applyTransform(off > peekOff / 2 ? peekOff : 0, true);
    }
  }

  // ── Data ─────────────────────────────────────────────────────
  const nearbyGuinnessBars = useMemo(() => {
    if (!allBars) return [];
    const center = userLocation ?? { lat: 54.5973, lng: -5.9301 };
    return allBars
      .filter(b => b.servesGuinness)
      .map(b => {
        const g = (b.drinks ?? []).find(d => /guinness|stout/i.test(d.name));
        return {
          ...b,
          distance:      distanceKm(center, { lat: b.lat, lng: b.lng }),
          guinnessPrice: g ? { price: g.price, currency: g.currency } : null,
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 20);
  }, [allBars, userLocation]);

  if (!mounted && !open) return null;

  const { maxH } = getGeometry();

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Nearest Guinness bars">

      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-[var(--color-ink)] opacity-70 cursor-default"
        style={{ WebkitTapHighlightColor: "transparent" } as React.CSSProperties}
        onClick={onClose}
        aria-label="Close"
      />

      {/* ── Sheet — fixed height, moves via translateY only ── */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl flex flex-col
                   bg-[var(--color-paper)] text-[var(--color-ink)]"
        style={{
          height: maxH,
          willChange: "transform",
          // Start off-screen; JS sets transform immediately after mount
          transform: `translateY(${maxH}px)`,
        }}
      >

        {/* ── DRAG ZONE ────────────────────────────────────────
            touchAction:none so browser doesn't intercept.
            All pointer handlers live here.
            Close button stopPropagates to avoid triggering drag. */}
        <div
          className="shrink-0 select-none"
          style={{ touchAction: "none", cursor: "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Pill */}
          <div className="flex justify-center pt-3 pb-2.5">
            <div className="w-9 h-1 rounded-full bg-[var(--color-ink)] opacity-20" />
          </div>

          {/* Header */}
          <div className="px-5 pb-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-eyebrow opacity-55 leading-none mb-1.5">
                NEAREST GUINNESS
              </div>
              <h2 className="font-display text-2xl uppercase leading-none">
                WORTH THE WALK
              </h2>
            </div>
            <button
              onClick={onClose}
              onPointerDown={e => e.stopPropagation()}
              className="mt-0.5 p-2 -mr-1.5 !min-h-0 shrink-0 opacity-60 hover:opacity-100"
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* ── SCROLL ZONE ──────────────────────────────────────
            touchAction:pan-y → browser handles native scroll.
            No pointer handlers here — touch scroll and sheet
            drag are completely independent zones.              */}
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
            <div className="px-5 py-12 text-center">
              <div className="font-display text-xl uppercase">NO STOUT IN SIGHT</div>
              <div className="text-meta opacity-55 mt-2">No Guinness pourers found nearby yet.</div>
            </div>
          ) : (
            <ul>
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
                      <span className="font-mono text-sm text-[var(--color-blaze)] w-5 shrink-0 tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base uppercase leading-tight truncate">
                          {bar.name}
                        </div>
                        <div className="text-meta opacity-55 mt-0.5 flex items-center gap-1.5 min-w-0">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                            openState.open ? "bg-[var(--color-verified)]" : "bg-[var(--color-ink)] opacity-30"
                          }`} />
                          <span className="truncate">
                            {openState.open
                              ? `OPEN · UNTIL ${openState.closesAt}`
                              : `CLOSED · OPENS ${openState.opensAt ?? "—"}`}
                            {" · "}{bar.distance.toFixed(1)} MI
                          </span>
                        </div>
                      </div>
                      {priceInfo && (
                        <div className="font-display text-base shrink-0">
                          {formatPrice(
                            convertPrice(priceInfo.price, priceInfo.currency as any, currency),
                            currency
                          )}
                        </div>
                      )}
                      <ChevronRight size={13} strokeWidth={1.4} className="opacity-35 shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-4 border-t border-[var(--color-rule-paper)]">
          <Link
            to="/list?filter=guinness"
            onClick={onClose}
            className="flex items-center justify-center gap-2 border-2 border-[var(--color-ink)]
                       text-[var(--color-ink)] py-3 text-meta font-display uppercase
                       hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-colors"
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
      className="w-full grain-paper text-[var(--color-ink)] px-5 py-4 border-t-2 border-[var(--color-ink)]
                 flex items-center justify-between gap-4 hover:bg-[var(--color-paper-soft)] transition-colors"
      aria-label="See the nearest Guinness"
    >
      <div className="text-left">
        <div className="text-eyebrow opacity-55">PERFECT TIME FOR</div>
        <div className="font-display text-2xl uppercase leading-none mt-1.5">A GUINNESS</div>
      </div>
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none"
           stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 14L7 2M2 7L7 2L12 7"/>
      </svg>
    </button>
  );
}
