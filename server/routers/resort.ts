import { router, publicProcedure } from "../trpc";

/**
 * City router — live Belfast weather and FX rates.
 * Temperature from open-meteo (Belfast city centre coords).
 * FX rates from frankfurter (EUR base, no key needed).
 */

const BELFAST_LAT = 54.5973;
const BELFAST_LNG = -5.9301;

interface Conditions {
  weather: string;
  temp: number | null;
  condition: string;
  lifts: { open: number; total: number }; // kept for client shape compatibility
  source: "live" | "fallback";
}

async function fetchWeather(): Promise<{ temp: number; condition: string; weather: string } | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${BELFAST_LAT}&longitude=${BELFAST_LNG}&current=temperature_2m,weather_code`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current;
    if (!c) return null;
    const temp = Math.round(c.temperature_2m);
    const isRaining = c.weather_code >= 51 && c.weather_code <= 82;
    const condition = isRaining ? "Raining" : c.weather_code <= 3 ? "Clear" : "Cloudy";
    return { temp, condition, weather: `${temp}°C ${condition}` };
  } catch {
    return null;
  }
}

export const resortRouter = router({
  getCondition: publicProcedure.query(async (): Promise<Conditions> => {
    const weather = await fetchWeather();

    if (!weather) {
      return {
        weather: "—",
        temp: null,
        condition: "—",
        lifts: { open: 0, total: 0 },
        source: "fallback",
      };
    }

    return {
      weather: weather.weather,
      temp: weather.temp,
      condition: weather.condition,
      lifts: { open: 0, total: 0 },
      source: "live",
    };
  }),

  // Live FX rates — frankfurter is free, returns EUR base, no API key needed.
  fxRates: publicProcedure.query(async () => {
    try {
      const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP,CHF,USD", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error("Frankfurter unavailable");
      const data = await res.json();
      return {
        EUR: 1,
        GBP: data.rates?.GBP ?? 0.85,
        CHF: data.rates?.CHF ?? 0.95,
        USD: data.rates?.USD ?? 1.08,
        source: "live" as const,
        date: data.date as string | undefined,
      };
    } catch {
      return { EUR: 1, GBP: 0.85, CHF: 0.95, USD: 1.08, source: "fallback" as const };
    }
  }),
});
