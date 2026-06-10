import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { bars, drinks, deals, submissions, barReports, editorsPick, appSettings } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/* ── Module-level Places API helpers ──────────────────────────── */

function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
  const at = url.match(/@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
  const d3 = url.match(/!3d(-?\d{1,3}\.\d{4,})/);
  const d4 = url.match(/!4d(-?\d{1,3}\.\d{4,})/);
  if (d3 && d4) return { lat: parseFloat(d3[1]), lng: parseFloat(d4[1]) };
  const q = url.match(/[?&]q=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) };
  return null;
}

function extractPlaceNameFromUrl(url: string): string | null {
  const m = url.match(/\/maps\/place\/([^/@?!]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1].replace(/\+/g, ' ')).replace(/\s*[-,].+$/, '').trim();
}

async function followRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    return res.url;
  } catch {
    return url;
  }
}

async function callPlacesAPI(queries: string[], apiKey: string) {
  for (const query of queries) {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.location,places.websiteUri,places.nationalPhoneNumber,places.regularOpeningHours,places.rating,places.googleMapsUri,places.formattedAddress,places.businessStatus',
        },
        body: JSON.stringify({
          textQuery: query,
          locationBias: {
            circle: {
              // Belfast city centre
              center: { latitude: 54.5973, longitude: -5.9301 },
              radius: 15000.0, // 15km covers all of Greater Belfast
            },
          },
          maxResultCount: 1,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.error('Places API error:', res.status, await res.text());
        continue;
      }

      const data = await res.json();
      const place = data.places?.[0];
      if (!place) continue;

      const lat = place.location?.latitude;
      const lng = place.location?.longitude;
      // Reject results outside Northern Ireland / Ireland bounding box
      if (!lat || !lng || lat < 53.5 || lat > 55.5 || lng < -7.5 || lng > -4.5) continue;

      let openingHours: string | null = null;
      const periods = place.regularOpeningHours?.periods;
      if (periods?.length > 0) {
        const p = periods[0];
        if (p.open && p.close) {
          const oh = String(p.open.hour ?? 0).padStart(2, '0');
          const om = String(p.open.minute ?? 0).padStart(2, '0');
          const ch = String(p.close.hour ?? 0).padStart(2, '0');
          const cm = String(p.close.minute ?? 0).padStart(2, '0');
          openingHours = `${oh}:${om}-${ch}:${cm}`;
        }
      }

      return {
        lat, lng,
        websiteUrl: place.websiteUri ?? null,
        phoneNumber: place.nationalPhoneNumber ?? null,
        openingHours,
        rating: place.rating ?? null,
        googleMapsUrl: place.googleMapsUri ?? null,
        fullName: place.displayName?.text ?? null,
        address: place.formattedAddress ?? null,
        businessStatus: (place.businessStatus as string) ?? 'OPERATIONAL',
      };
    } catch (e) {
      console.error('Places API fetch failed for query:', query, e);
    }
  }
  return null;
}

/* ── Router ────────────────────────────────────────────────────── */

export const adminRouter = router({
  resolveMapLink: publicProcedure
    .input(z.object({ url: z.string() }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;

      try {
        const finalUrl = await followRedirect(input.url);
        const placeName = extractPlaceNameFromUrl(finalUrl);

        if (apiKey && placeName) {
          const nameVariants = [
            placeName,
            placeName.replace(/\s*[-,–].*$/, '').trim(),
          ].filter((v, i, arr) => v && arr.indexOf(v) === i);

          const queries = [
            ...nameVariants.map(n => `${n} Belfast pub`),
            ...nameVariants.map(n => `${n} Belfast bar`),
            ...nameVariants.map(n => `${n} Belfast`),
          ];

          const placeData = await callPlacesAPI(queries, apiKey);
          if (placeData) {
            return {
              lat: placeData.lat,
              lng: placeData.lng,
              placeName: placeData.fullName ?? placeName,
              address: placeData.address,
              websiteUrl: placeData.websiteUrl,
              phoneNumber: placeData.phoneNumber,
              openingHours: placeData.openingHours,
              rating: placeData.rating,
              googleMapsUrl: placeData.googleMapsUrl ?? finalUrl,
              finalUrl: placeData.googleMapsUrl ?? finalUrl,
              businessStatus: placeData.businessStatus ?? 'OPERATIONAL',
              source: 'places_api' as const,
            };
          }
        }

        const directCoords = extractCoordsFromUrl(finalUrl);
        if (directCoords) {
          return {
            lat: directCoords.lat,
            lng: directCoords.lng,
            placeName,
            address: null,
            websiteUrl: null,
            phoneNumber: null,
            openingHours: null,
            rating: null,
            googleMapsUrl: finalUrl,
            finalUrl,
            source: 'url' as const,
          };
        }

        throw new TRPCError({
          code: 'NOT_FOUND',
          message: placeName
            ? `Could not find "${placeName}" on Google Places. Try searching for the bar directly on maps.google.com, clicking on it, then sharing that link.`
            : 'Could not read this link. Try copying the URL from Google Maps on desktop instead.',
        });

      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to resolve link: ' + e.message,
        });
      }
    }),

  refreshBarData: publicProcedure
    .input(z.object({ barId: z.number() }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No API key' });

      const bar = (await db.select().from(bars).where(eq(bars.id, input.barId)))[0];
      if (!bar) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bar not found' });

      // Build search queries from name + area, with or without a saved Maps URL
      const placeName = bar.googleMapsUrl
        ? (extractPlaceNameFromUrl(await followRedirect(bar.googleMapsUrl)) || bar.name)
        : bar.name;

      const queries = [
        `${placeName} ${bar.area} Belfast`,
        `${placeName} Belfast pub`,
        `${placeName} Belfast bar`,
        `${placeName} Belfast`,
      ];

      const placeData = await callPlacesAPI(queries, apiKey);
      if (!placeData) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Could not refresh "${bar.name}"` });
      }

      const updates: any = {
        lat: placeData.lat,
        lng: placeData.lng,
        businessStatus: placeData.businessStatus ?? 'OPERATIONAL',
      };
      if (placeData.websiteUrl) updates.websiteUrl = placeData.websiteUrl;
      if (placeData.phoneNumber) updates.phoneNumber = placeData.phoneNumber;
      if (placeData.openingHours) updates.openingHours = placeData.openingHours;
      if (placeData.rating != null) updates.rating = placeData.rating;
      if (placeData.googleMapsUrl) updates.googleMapsUrl = placeData.googleMapsUrl;

      await db.update(bars).set(updates).where(eq(bars.id, input.barId));
      return { ...updates, name: bar.name, placeName: placeData.fullName };
    }),

  refreshAllBars: publicProcedure
    .mutation(async () => {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No API key' });

      const allBars = await db.select().from(bars);
      // Process every bar — search by name + area when no Maps URL is saved
      const results = { updated: 0, failed: 0, tempClosed: 0, details: [] as any[] };

      for (const bar of allBars) {
        try {
          const placeName = bar.googleMapsUrl
            ? (extractPlaceNameFromUrl(await followRedirect(bar.googleMapsUrl)) || bar.name)
            : bar.name;

          const queries = [
            `${placeName} ${bar.area} Belfast`,
            `${placeName} Belfast pub`,
            `${placeName} Belfast bar`,
            `${placeName} Belfast`,
          ];

          const placeData = await callPlacesAPI(queries, apiKey);

          if (placeData) {
            const updates: any = {
              lat: placeData.lat,
              lng: placeData.lng,
              businessStatus: placeData.businessStatus ?? 'OPERATIONAL',
            };
            if (placeData.websiteUrl) updates.websiteUrl = placeData.websiteUrl;
            if (placeData.phoneNumber) updates.phoneNumber = placeData.phoneNumber;
            if (placeData.openingHours) updates.openingHours = placeData.openingHours;
            if (placeData.rating != null) updates.rating = placeData.rating;
            if (placeData.googleMapsUrl) updates.googleMapsUrl = placeData.googleMapsUrl;

            await db.update(bars).set(updates).where(eq(bars.id, bar.id));
            results.updated++;
            if (updates.businessStatus === 'CLOSED_TEMPORARILY') {
              results.tempClosed++;
              results.details.push({ name: bar.name, status: 'TEMPORARILY CLOSED' });
            }
          } else {
            results.failed++;
            results.details.push({ name: bar.name, status: 'NOT FOUND' });
          }
        } catch {
          results.failed++;
          results.details.push({ name: bar.name, status: 'ERROR' });
        }
        await new Promise(r => setTimeout(r, 250));
      }

      return results;
    }),

  deleteAllDrinksForBar: publicProcedure
    .input(z.object({ barId: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(drinks).where(eq(drinks.barId, input.barId));
      return { ok: true };
    }),

  createDrinksBulk: publicProcedure
    .input(z.object({
      barId: z.number(),
      drinks: z.array(z.object({
        name: z.string(),
        size: z.string().nullable(),
        price: z.number(),
        currency: z.string(),
        drinkType: z.string().optional().nullable(),
      })),
    }))
    .mutation(async ({ input }) => {
      const now = new Date().toISOString();
      const rows = input.drinks.map(d => ({
        barId: input.barId,
        name: d.name,
        size: d.size ?? undefined,
        price: d.price,
        currency: d.currency,
        isVerified: true as const,
        verifiedAt: now,
      }));
      await db.insert(drinks).values(rows);
      return { created: rows.length };
    }),

  getCustomSizes: publicProcedure
    .query(async () => {
      const row = (await db.select().from(appSettings).where(eq(appSettings.key, 'custom_drink_sizes')))[0];
      if (!row?.value) return [] as string[];
      try { return JSON.parse(row.value) as string[]; } catch { return [] as string[]; }
    }),

  addCustomSize: publicProcedure
    .input(z.object({ size: z.string().min(1).max(20) }))
    .mutation(async ({ input }) => {
      const normalized = input.size.trim();
      if (!normalized) return [] as string[];
      const row = (await db.select().from(appSettings).where(eq(appSettings.key, 'custom_drink_sizes')))[0];
      const current: string[] = row?.value ? JSON.parse(row.value) : [];
      if (current.includes(normalized)) return current;
      const next = [...current, normalized];
      if (row) {
        await db.update(appSettings).set({ value: JSON.stringify(next) }).where(eq(appSettings.key, 'custom_drink_sizes'));
      } else {
        await db.insert(appSettings).values({ key: 'custom_drink_sizes', value: JSON.stringify(next) });
      }
      return next;
    }),

  getSubmissions: publicProcedure
    .query(async () => {
      return db.select().from(submissions).orderBy(desc(submissions.createdAt));
    }),

  resolveSubmission: publicProcedure
    .input(z.object({
      id: z.number(),
      action: z.enum(["approve", "approve_verified", "reject"]),
    }))
    .mutation(async ({ input }) => {
      const [sub] = await db.select().from(submissions).where(eq(submissions.id, input.id));
      if (!sub) throw new Error("Not found");

      if (input.action === "approve" || input.action === "approve_verified") {
        const isVerified = input.action === "approve_verified";
        const verifiedAt = isVerified ? new Date().toISOString() : null;

        if (sub.kind === "update") {
          const existing = await db.select().from(drinks).where(eq(drinks.barId, sub.barId));
          const match = existing.find(d => d.name.toLowerCase() === sub.drinkName.toLowerCase());
          if (match) {
            await db.update(drinks).set({
              price: sub.price,
              currency: sub.currency,
              size: sub.drinkSize ?? match.size,
              isVerified,
              verifiedAt,
              lastUpdated: new Date().toISOString(),
            }).where(eq(drinks.id, match.id));
          } else {
            await db.insert(drinks).values({
              barId: sub.barId,
              name: sub.drinkName,
              size: sub.drinkSize,
              price: sub.price,
              currency: sub.currency,
              isVerified,
              verifiedAt,
            });
          }
        } else {
          await db.insert(drinks).values({
            barId: sub.barId,
            name: sub.drinkName,
            size: sub.drinkSize,
            price: sub.price,
            currency: sub.currency,
            isVerified,
            verifiedAt,
          });
        }
      }

      await db.update(submissions)
        .set({ status: input.action === "reject" ? "rejected" : "approved" })
        .where(eq(submissions.id, input.id));
      return { success: true };
    }),

  createBar: publicProcedure
    .input(z.object({
      name: z.string(),
      type: z.string(),
      address: z.string().optional(),
      lat: z.number(),
      lng: z.number(),
      area: z.string().optional(),
      openingHours: z.string().optional(),
      imageUrl: z.string().optional(),
      servesGuinness: z.boolean().optional(),
      googleMapsUrl: z.string().optional().nullable(),
      websiteUrl: z.string().optional().nullable(),
      phoneNumber: z.string().max(30).optional().nullable(),
      rating: z.number().optional().nullable(),
      businessStatus: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      return db.insert(bars).values(input).returning();
    }),

  createDrink: publicProcedure
    .input(z.object({
      barId: z.number(),
      name: z.string(),
      size: z.string().optional(),
      price: z.number(),
      currency: z.string().default("EUR"),
      drinkType: z.string().optional().nullable(),
      isVerified: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      return db.insert(drinks).values({
        ...input,
        verifiedAt: input.isVerified ? new Date().toISOString() : null,
      }).returning();
    }),

  createDeal: publicProcedure
    .input(z.object({
      barId: z.number(),
      title: z.string(),
      description: z.string().nullable().optional(),
      type: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      daysOfWeek: z.string().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      return db.insert(deals).values(input).returning();
    }),

  deleteBar: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(drinks).where(eq(drinks.barId, input.id));
      await db.delete(deals).where(eq(deals.barId, input.id));
      await db.delete(submissions).where(eq(submissions.barId, input.id));
      await db.delete(barReports).where(eq(barReports.barId, input.id));
      return db.delete(bars).where(eq(bars.id, input.id)).returning();
    }),

  updateBar: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string(),
      type: z.string(),
      address: z.string().optional().nullable(),
      lat: z.number(),
      lng: z.number(),
      area: z.string().optional().nullable(),
      openingHours: z.string().optional().nullable(),
      imageUrl: z.string().optional().nullable(),
      servesGuinness: z.boolean().optional(),
      googleMapsUrl: z.string().optional().nullable(),
      websiteUrl: z.string().optional().nullable(),
      phoneNumber: z.string().max(30).optional().nullable(),
      rating: z.number().optional().nullable(),
      businessStatus: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.update(bars).set(data).where(eq(bars.id, id)).returning();
    }),

  deleteDrink: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db.delete(drinks).where(eq(drinks.id, input.id)).returning();
    }),

  updateDrink: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string(),
      price: z.number(),
      currency: z.string(),
      size: z.string().optional().nullable(),
      drinkType: z.string().optional().nullable(),
      isVerified: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.update(drinks).set({
        ...data,
        lastUpdated: new Date().toISOString(),
        ...(data.isVerified !== undefined ? { verifiedAt: data.isVerified ? new Date().toISOString() : null } : {}),
      }).where(eq(drinks.id, id)).returning();
    }),

  setDrinkVerification: publicProcedure
    .input(z.object({ id: z.number(), isVerified: z.boolean() }))
    .mutation(async ({ input }) => {
      return db.update(drinks).set({
        isVerified: input.isVerified,
        verifiedAt: input.isVerified ? new Date().toISOString() : null,
      }).where(eq(drinks.id, input.id)).returning();
    }),

  deleteDeal: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db.delete(deals).where(eq(deals.id, input.id)).returning();
    }),

  updateDeal: publicProcedure
    .input(z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().optional().nullable(),
      type: z.string(),
      startTime: z.string().optional().nullable(),
      endTime: z.string().optional().nullable(),
      daysOfWeek: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.update(deals).set(data).where(eq(deals.id, id)).returning();
    }),

  setDealActive: publicProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      return db.update(deals).set({ isActive: input.isActive }).where(eq(deals.id, input.id)).returning();
    }),

  getEditorsPick: publicProcedure.query(async () => {
    const [row] = await db.select().from(editorsPick).limit(1);
    return row ?? { id: null, mode: "cheapest", barId: null, lastRandomBarId: null, lastRandomDate: null };
  }),

  setEditorsPick: publicProcedure
    .input(z.object({
      mode: z.enum(["cheapest", "manual", "daily_random", "weekly_random"]),
      barId: z.number().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(editorsPick).limit(1);
      if (existing) {
        return db.update(editorsPick)
          .set({ mode: input.mode, barId: input.barId ?? null, updatedAt: new Date().toISOString() })
          .where(eq(editorsPick.id, existing.id))
          .returning();
      }
      return db.insert(editorsPick).values({ mode: input.mode, barId: input.barId ?? null }).returning();
    }),

  resolveReport: publicProcedure
    .input(z.object({ id: z.number(), status: z.enum(["resolved", "dismissed", "bar_contacted"]) }))
    .mutation(async ({ input }) => {
      return db.update(barReports).set({ status: input.status }).where(eq(barReports.id, input.id)).returning();
    }),
});
