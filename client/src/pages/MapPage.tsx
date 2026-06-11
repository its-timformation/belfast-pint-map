import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Link, useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAppStore, convertPrice, formatPrice, isOpenNow } from "../lib/store";
import { LoadingMessage } from "../components/LoadingMessage";
import "leaflet/dist/leaflet.css";

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

/* ── Focus controller ──────────────────────────────────────── */
function FocusController({ focusId, bars }: { focusId?: number; bars: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (!focusId || !bars.length) return;
    const t = bars.find(b => b.id === focusId);
    if (t) map.setView([t.lat, t.lng], 15, { animate: true });
  }, [focusId, bars, map]);
  return null;
}

/* ── Exposes map instance to parent via ref ────────────────── */
function MapReady({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* ── MapPage ───────────────────────────────────────────────── */
export default function MapPage() {
  const { currency } = useAppStore();
  const { data: barsWithDetails, isLoading } = trpc.bars.getAllWithDetails.useQuery();
  const { data: deals } = trpc.bars.getDeals.useQuery();
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

  if (isLoading) return <LoadingMessage surface="map" />;

  const barsWithDealsSet = new Set((deals ?? []).filter(d => d.isActive).map(d => d.barId));

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-4 py-3 hairline-b flex items-center justify-between shrink-0">
        <div>
          <div className="text-eyebrow text-[var(--color-blaze)]">DISPATCH 02 · ATLAS</div>
          <div className="font-display text-lg uppercase mt-0.5">EVERY PIN, EVERY PINT</div>
        </div>
        <div className="text-meta opacity-55">{(barsWithDetails?.length ?? 0).toString().padStart(2, "0")} BARS</div>
      </div>

      {/* Map */}
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

          {/* User location pin */}
          {userLocation && (
            <Marker position={userLocation} icon={PIN_USER} zIndexOffset={1000}>
              <Popup className="custom-popup" closeButton={false}>
                <div className="p-3">
                  <div className="text-eyebrow text-[var(--color-frost)] opacity-80 mb-1">YOUR LOCATION</div>
                  <div className="font-display text-sm uppercase text-[var(--color-paper)]">YOU ARE HERE</div>
                </div>
              </Popup>
            </Marker>
          )}

          {(barsWithDetails ?? []).map(bar => {
            const isFocus = bar.id === focusId;
            const hasDeal = barsWithDealsSet.has(bar.id);
            const icon = isFocus
              ? (hasDeal ? PIN_FOCUS_DEAL : PIN_FOCUS)
              : (hasDeal ? PIN_DEAL : PIN_BAR);

            const beerDrinks = (bar.drinks ?? []).filter(d =>
              /lager|beer|pint|kronen|stella|heineken|guinness|ipa|1664/i.test(d.name)
            );
            const cheapest = beerDrinks.length
              ? beerDrinks.reduce((min, d) => {
                  const p = convertPrice(d.price, d.currency as any, currency);
                  return p < min.price ? { price: p } : min;
                }, { price: Infinity })
              : null;
            const open = isOpenNow(bar.openingHours);

            return (
              <Marker key={bar.id} position={[bar.lat, bar.lng]} icon={icon}>
                <Popup className="custom-popup" closeButton={false}>
                  <Link to={`/bar/${bar.id}`} className="block p-3">
                    {bar.area && (
                      <div className="text-eyebrow text-[var(--color-blaze)] opacity-80 mb-1">
                        {bar.area.toUpperCase()}
                      </div>
                    )}
                    <div className="font-display text-base uppercase text-[var(--color-paper)]">
                      {bar.name}
                    </div>
                    <div className="text-meta opacity-60 mt-1.5 flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${open.open ? "bg-[var(--color-verified)]" : "bg-[var(--color-paper)] opacity-35"}`} />
                      {open.open ? `OPEN UNTIL ${open.closesAt}` : `OPENS ${open.opensAt ?? "—"}`}
                    </div>
                    {cheapest && cheapest.price < Infinity && (
                      <div className="font-display text-lg text-[var(--color-sun)] mt-2">
                        {formatPrice(cheapest.price, currency)}
                      </div>
                    )}
                    {bar.servesGuinness && (
                      <div className="mt-2">
                        <span className="text-meta text-[10px] tracking-wide text-[var(--color-sun)] border border-[var(--color-sun)] border-opacity-40 px-1.5 py-0.5">
                          POURS GUINNESS
                        </span>
                      </div>
                    )}
                    <div className="text-meta opacity-45 mt-2.5">VIEW BAR →</div>
                  </Link>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Custom zoom + locate controls — top right */}
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
                  p => { const ll: [number,number] = [p.coords.latitude, p.coords.longitude]; setUserLocation(ll); mapRef.current?.setView(ll, 15, { animate: true }); },
                  () => {}
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

        {/* Legend — bottom left */}
        <div className="absolute bottom-3 left-3 bg-[var(--color-ink)] bg-opacity-90 border border-[var(--color-rule)] p-2 text-meta z-[400] space-y-1.5">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}>
              <rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" fill="#E63E0B" stroke="#0A0908" strokeWidth="1.2"/>
            </svg>
            <span>BAR</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}>
              <rect x="2" y="2" width="20" height="20" transform="rotate(45 12 12)" fill="none" stroke="#F2C12E" strokeWidth="1.5"/>
              <rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" fill="#E63E0B" stroke="#0A0908" strokeWidth="1.2"/>
            </svg>
            <span>HAS DEAL</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}>
              <rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" fill="#F2C12E" stroke="#0A0908" strokeWidth="1.2"/>
            </svg>
            <span>FOCUSED</span>
          </div>
          {userLocation && (
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}>
                <circle cx="7" cy="7" r="6" fill="#87B0D9" stroke="#FBF5E0" strokeWidth="1"/>
                <circle cx="7" cy="7" r="2.5" fill="#FBF5E0"/>
              </svg>
              <span>YOU</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
