import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Link, useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAppStore, convertPrice, formatPrice, isOpenNow } from "../lib/store";
import { LoadingMessage } from "../components/LoadingMessage";
import "leaflet/dist/leaflet.css";

/* ── Time-aware deal check ─────────────────────────────────── */
type DealRow = {
  id: number;
  barId: number;
  isActive: boolean;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: string | null;
};

function isDealCurrentlyActive(deal: DealRow): boolean {
  if (!deal.isActive) return false;
  const now = new Date();
  const day = now.getDay(); // 0 = Sun

  if (deal.daysOfWeek) {
    try {
      const days = JSON.parse(deal.daysOfWeek) as number[];
      if (days.length > 0 && !days.includes(day)) return false;
    } catch {}
  }

  if (deal.startTime && deal.endTime) {
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = deal.startTime.split(":").map(Number);
    const [eh, em] = deal.endTime.split(":").map(Number);
    if (cur < sh * 60 + sm || cur > eh * 60 + em) return false;
  }

  return true;
}

/* ── Pins ──────────────────────────────────────────────────── */
function makePin(fill: string, hasDeal = false, size = 24) {
  const half = size / 2;
  const ring = hasDeal
    ? `<rect x="2" y="2" width="20" height="20" transform="rotate(45 12 12)" fill="none" stroke="#F2C12E" stroke-width="1.5"/>`
    : "";
  return L.divIcon({
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.55))">${ring}<rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" fill="${fill}" stroke="#0A0908" stroke-width="1.2"/><circle cx="12" cy="12" r="2" fill="#0A0908"/></svg>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

const PIN_BAR        = makePin("#E63E0B");
const PIN_DEAL       = makePin("#E63E0B", true);
const PIN_FOCUS      = makePin("#F2C12E", false, 32);
const PIN_FOCUS_DEAL = makePin("#F2C12E", true, 32);

/* ── User location pin ─────────────────────────────────────── */
const PIN_USER = L.divIcon({
  html: `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7))">
    <circle cx="14" cy="14" r="12" fill="#87B0D9" stroke="#FBF5E0" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="#FBF5E0"/>
    <circle cx="14" cy="14" r="12" fill="none" stroke="#87B0D9" stroke-width="1" opacity="0.4"/>
  </svg>`,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/* ── Area cluster labels (visible zoom ≤ 11) ──────────────── */
const AREA_CENTROIDS = [
  { name: "CATHEDRAL QUARTER", lat: 54.6007, lng: -5.9292 },
  { name: "CITY CENTRE",       lat: 54.5975, lng: -5.9301 },
  { name: "QUEEN'S QUARTER",   lat: 54.5865, lng: -5.9355 },
  { name: "ORMEAU ROAD",       lat: 54.5860, lng: -5.9228 },
  { name: "LISBURN ROAD",      lat: 54.5825, lng: -5.9435 },
  { name: "EAST BELFAST",      lat: 54.5893, lng: -5.9082 },
  { name: "STRANMILLIS",       lat: 54.5808, lng: -5.9337 },
];

function makeAreaLabel(name: string) {
  return L.divIcon({
    html: `<div style="color:rgba(251,245,224,0.65);font-size:9px;font-weight:700;letter-spacing:0.12em;text-shadow:0 1px 4px rgba(0,0,0,0.9);white-space:nowrap;pointer-events:none;font-family:inherit">${name}</div>`,
    className: "",
    iconSize: [80, 14],
    iconAnchor: [40, 7],
  });
}

function AreaLabels() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoom: () => setZoom(map.getZoom()) });
  if (zoom > 11) return null;
  return (
    <>
      {AREA_CENTROIDS.map(a => (
        <Marker key={a.name} position={[a.lat, a.lng]} icon={makeAreaLabel(a.name)} />
      ))}
    </>
  );
}

function FocusController({ focusId, bars }: { focusId?: number; bars: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (!focusId || !bars.length) return;
    const t = bars.find(b => b.id === focusId);
    if (t) map.setView([t.lat, t.lng], 15, { animate: true });
  }, [focusId, bars, map]);
  return null;
}

function MapReady({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* ── MapPage ───────────────────────────────────────────────── */
export default function MapPage() {
  const { currency } = useAppStore();
  const { data: barsWithDetails, isLoading } = trpc.bars.getAllWithDetails.useQuery();
  const { data: dealsData } = trpc.bars.getDeals.useQuery();
  const [params] = useSearchParams();
  const focusId = params.get("focus") ? Number(params.get("focus")) : undefined;
  const mapRef = useRef<L.Map | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      p => setUserLocation([p.coords.latitude, p.coords.longitude]),
      () => {},
      { maximumAge: 5 * 60 * 1000, timeout: 6000 }
    );
  }, []);

  const center = useMemo<[number, number]>(() => {
    if (!barsWithDetails?.length) return [54.5973, -5.9301];
    const avgLat = barsWithDetails.reduce((s, b) => s + b.lat, 0) / barsWithDetails.length;
    const avgLng = barsWithDetails.reduce((s, b) => s + b.lng, 0) / barsWithDetails.length;
    return [avgLat, avgLng];
  }, [barsWithDetails]);

  // Bars with an ACTIVE deal right now (time + day aware)
  const activeDealBarIds = useMemo(
    () => new Set((dealsData ?? []).filter(isDealCurrentlyActive).map(d => d.barId)),
    [dealsData],
  );

  if (isLoading) return <LoadingMessage surface="map" />;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 hairline-b flex items-center justify-between shrink-0">
        <div>
          <div className="text-eyebrow text-[var(--color-blaze)]">DISPATCH 02 · ATLAS</div>
          <div className="font-display text-lg uppercase mt-0.5">EVERY PIN, EVERY PINT</div>
        </div>
        <div className="text-meta opacity-55">{(barsWithDetails?.length ?? 0).toString().padStart(2, "0")} BARS</div>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden" style={{ minHeight: 0 }}>
        <MapContainer
          center={center}
          zoom={12}
          zoomControl={false}
          className="absolute inset-0 w-full h-full"
        >
          <TileLayer
            url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
            attribution=""
            maxZoom={20}
          />
          <MapReady onReady={m => { mapRef.current = m; }} />
          <FocusController focusId={focusId} bars={barsWithDetails ?? []} />
          <AreaLabels />

          {/* User location */}
          {userLocation && (
            <Marker position={userLocation} icon={PIN_USER} zIndexOffset={1000}>
              <Popup className="custom-popup" closeButton={false}>
                <div className="px-3 py-2.5">
                  <div className="font-display text-sm uppercase text-[var(--color-paper)]">YOU ARE HERE</div>
                </div>
              </Popup>
            </Marker>
          )}

          {(barsWithDetails ?? []).map(bar => {
            const isFocus    = bar.id === focusId;
            const hasActiveDeal = activeDealBarIds.has(bar.id);
            const icon = isFocus
              ? (hasActiveDeal ? PIN_FOCUS_DEAL : PIN_FOCUS)
              : (hasActiveDeal ? PIN_DEAL : PIN_BAR);

            // Cheapest pint in user's currency
            const beerDrinks = (bar.drinks ?? []).filter(d =>
              /lager|beer|pint|stella|heineken|guinness|harp|ipa/i.test(d.name)
            );
            const cheapestPrice = beerDrinks.length
              ? beerDrinks.reduce((min, d) => {
                  const p = convertPrice(d.price, d.currency as any, currency);
                  return p < min ? p : min;
                }, Infinity)
              : null;

            const open = isOpenNow(bar.openingHours);

            // Active deals for this bar
            const barActiveDeals = (bar.deals ?? []).filter(isDealCurrentlyActive);

            return (
              <Marker key={bar.id} position={[bar.lat, bar.lng]} icon={icon}>
                <Popup className="custom-popup" closeButton={false} minWidth={160} maxWidth={220}>
                  <Link to={`/bar/${bar.id}`} className="block px-3 py-2.5 no-underline">

                    {/* Name — one line */}
                    <div className="font-display text-sm uppercase text-[var(--color-paper)] leading-tight mb-1.5">
                      {bar.name}
                    </div>

                    {/* Open + price on one line */}
                    <div className="flex items-center gap-2 text-eyebrow opacity-60">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${open.open ? "bg-[var(--color-verified)]" : "bg-current opacity-30"}`} />
                      <span>{open.open ? "OPEN" : "CLOSED"}</span>
                      {cheapestPrice && cheapestPrice < Infinity && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="text-[var(--color-sun)] opacity-100">
                            {formatPrice(cheapestPrice, currency)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Active deal tags */}
                    {(barActiveDeals.length > 0 || bar.servesGuinness) && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {barActiveDeals.slice(0, 2).map(d => (
                          <span key={d.id} className="text-eyebrow text-[var(--color-sun)] opacity-90">
                            {(d as any).title?.toUpperCase().slice(0, 18) ?? "DEAL ON"}
                          </span>
                        ))}
                        {bar.servesGuinness && barActiveDeals.length === 0 && (
                          <span className="text-eyebrow opacity-40">GUINNESS</span>
                        )}
                      </div>
                    )}

                  </Link>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Zoom + locate */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col border border-[var(--color-rule)]">
          <button
            onClick={() => mapRef.current?.zoomIn()}
            className="bg-[var(--color-ink)] text-[var(--color-paper)] font-display text-xl w-10 h-10 flex items-center justify-center hover:bg-[var(--color-ink-card)] border-b border-[var(--color-rule)] leading-none"
            aria-label="Zoom in"
          >+</button>
          <button
            onClick={() => mapRef.current?.zoomOut()}
            className="bg-[var(--color-ink)] text-[var(--color-paper)] font-display text-xl w-10 h-10 flex items-center justify-center hover:bg-[var(--color-ink-card)] border-b border-[var(--color-rule)] leading-none"
            aria-label="Zoom out"
          >−</button>
          <button
            onClick={() => {
              if (userLocation) {
                mapRef.current?.setView(userLocation, 15, { animate: true });
              } else {
                navigator.geolocation?.getCurrentPosition(
                  p => {
                    const ll: [number, number] = [p.coords.latitude, p.coords.longitude];
                    setUserLocation(ll);
                    mapRef.current?.setView(ll, 15, { animate: true });
                  },
                  () => {},
                );
              }
            }}
            className="bg-[var(--color-ink)] text-[var(--color-frost)] w-10 h-10 flex items-center justify-center hover:bg-[var(--color-ink-card)] leading-none"
            aria-label="My location"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-[var(--color-ink)] bg-opacity-90 border border-[var(--color-rule)] p-2 text-meta z-[400] space-y-1.5">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24">
              <rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" fill="#E63E0B" stroke="#0A0908" strokeWidth="1.2"/>
            </svg>
            <span className="opacity-60">BAR</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24">
              <rect x="2" y="2" width="20" height="20" transform="rotate(45 12 12)" fill="none" stroke="#F2C12E" strokeWidth="1.5"/>
              <rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" fill="#E63E0B" stroke="#0A0908" strokeWidth="1.2"/>
            </svg>
            <span className="text-[var(--color-sun)]">DEAL NOW</span>
          </div>
          {userLocation && (
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 14 14">
                <circle cx="7" cy="7" r="6" fill="#87B0D9" stroke="#FBF5E0" strokeWidth="1"/>
                <circle cx="7" cy="7" r="2.5" fill="#FBF5E0"/>
              </svg>
              <span className="text-[var(--color-frost)] opacity-80">YOU</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
