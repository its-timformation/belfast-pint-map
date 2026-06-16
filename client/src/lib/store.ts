import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Currency = 'EUR' | 'GBP' | 'CHF';

interface AppState {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  favouriteBarIds: number[];
  toggleFavourite: (id: number) => void;
  // STOUTS·DU·SOLEIL easter-egg state
  stoutsMode: boolean;
  stoutsExpires: number | null;
  enterStoutsMode: () => void;
  exitStoutsMode: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currency: 'GBP', // default for primary audience
      setCurrency: (currency) => set({ currency }),
      favouriteBarIds: [],
      toggleFavourite: (id) => {
        const cur = get().favouriteBarIds;
        set({
          favouriteBarIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
        });
      },
      stoutsMode: false,
      stoutsExpires: null,
      enterStoutsMode: () => set({ stoutsMode: true, stoutsExpires: Date.now() + 60 * 60 * 1000 }),
      exitStoutsMode: () => set({ stoutsMode: false, stoutsExpires: null }),
    }),
    { name: 'pds-app-storage' }
  )
);

/* ------------------------------ pricing ------------------------------ */

/**
 * Static FX fallback. In production this is overridden by /api/trpc/resort.fxRates
 * which can fetch live rates daily; the store falls back to these on failure.
 */
export const EXCHANGE_RATES: Record<Currency, number> = {
  EUR: 1,
  GBP: 0.85,
  CHF: 0.95,
};

let liveRates: Record<Currency, number> | null = null;
export function setLiveRates(r: Record<Currency, number>) { liveRates = r; }

export function convertPrice(amount: number, from: Currency, to: Currency) {
  if (from === to) return amount;
  const rates = liveRates ?? EXCHANGE_RATES;
  const inEur = amount / rates[from];
  return inEur * rates[to];
}

export function formatPrice(amount: number, currency: Currency) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

/* ----------------------------- opening hours ----------------------------- */

/** Parse a simple "HH:MM-HH:MM" string. Handles wrap-around past midnight. */
export function isOpenNow(openingHours: string | null | undefined, now = new Date()):
  { open: boolean; closesAt?: string; opensAt?: string } {
  if (!openingHours) return { open: false };
  const m = openingHours.match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (!m) return { open: false };
  const [, oH, oM, cH, cM] = m;
  const openMin = parseInt(oH) * 60 + parseInt(oM);
  let closeMin = parseInt(cH) * 60 + parseInt(cM);
  if (closeMin <= openMin) closeMin += 24 * 60; // wraps past midnight
  const cur = now.getHours() * 60 + now.getMinutes();
  const curWrapped = cur + 24 * 60;
  const isOpen = (cur >= openMin && cur < closeMin) || (curWrapped >= openMin && curWrapped < closeMin && closeMin > 24*60);
  return isOpen
    ? { open: true,  closesAt: `${cH}:${cM}` }
    : { open: false, opensAt: `${oH}:${oM}` };
}

/* --------------------------- verification age --------------------------- */

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
export function isVerifiedStale(verifiedAt: string | null | undefined) {
  if (!verifiedAt) return false;
  return Date.now() - new Date(verifiedAt).getTime() > SIXTY_DAYS_MS;
}

/* ------------------------------ distance ------------------------------ */
/** Haversine, returns miles. */
export function distanceKm(a:{lat:number;lng:number}, b:{lat:number;lng:number}) {
  const R = 3958.8;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
