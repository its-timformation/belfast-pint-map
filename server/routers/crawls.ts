import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { bars, drinks, deals, pubCrawls } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/* ── Utilities ──────────────────────────────────────────────── */

function generateCode(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function geoDistKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const BEER_RE = /pint|beer|lager|guinness|harp|tennent|smithwick|stella|heineken|carlsberg|ipa|pale ale|stout|porter|sour|amber|red ale|craft/i;
const CRAFT_RE = /\bipa\b|\bdipa\b|\bneipa\b|pale ale|\bsour\b|\bporter\b|milk stout|oatmeal stout|imperial stout|wheat beer|saison|cream ale|whitewater|boundary|hilden|bullhouse|farmageddon|lacada|craft lager|craft beer/i;

function avgBeerPrice(barId: number, allDrinks: typeof drinks.$inferSelect[]): number {
  const barDrinks = allDrinks.filter(d => d.barId === barId && BEER_RE.test(d.name));
  if (!barDrinks.length) return Infinity;
  return barDrinks.reduce((s, d) => s + d.price, 0) / barDrinks.length;
}

function hasCraftBeer(barId: number, allDrinks: typeof drinks.$inferSelect[]): boolean {
  return allDrinks.some(d => d.barId === barId && CRAFT_RE.test(d.name));
}

/* ── Router ─────────────────────────────────────────────────── */

export const crawlsRouter = router({

  /** Create a crawl and get back a shareCode */
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(500).optional(),
      barIds: z.array(z.number()).min(2).max(15),
      authorName: z.string().max(40).optional(),
      tags: z.array(z.string()).optional(),
      generatedBy: z.enum(["manual", "auto"]).default("manual"),
      autoParams: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const shareCode = generateCode(6);
      const [crawl] = await db.insert(pubCrawls).values({
        name: input.name,
        description: input.description,
        barIds: JSON.stringify(input.barIds),
        shareCode,
        authorName: input.authorName,
        tags: JSON.stringify(input.tags ?? []),
        generatedBy: input.generatedBy,
        autoParams: input.autoParams,
        status: "private",
        createdAt: new Date().toISOString(),
      }).returning();
      return { crawl, shareCode };
    }),

  /** Fetch a crawl by its share code */
  getByShareCode: publicProcedure
    .input(z.object({ shareCode: z.string() }))
    .query(async ({ input }) => {
      const [crawl] = await db.select().from(pubCrawls)
        .where(eq(pubCrawls.shareCode, input.shareCode));
      if (!crawl) throw new TRPCError({ code: "NOT_FOUND", message: "Crawl not found" });
      return crawl;
    }),

  /** Submit a crawl for community review, optionally attaching an author name */
  submit: publicProcedure
    .input(z.object({
      shareCode: z.string(),
      authorName: z.string().max(40).optional(),
    }))
    .mutation(async ({ input }) => {
      await db.update(pubCrawls)
        .set({
          status: "submitted",
          ...(input.authorName ? { authorName: input.authorName } : {}),
        })
        .where(eq(pubCrawls.shareCode, input.shareCode));
      return { ok: true };
    }),

  /** All published community crawls */
  getPublished: publicProcedure.query(async () => {
    return db.select().from(pubCrawls)
      .where(eq(pubCrawls.status, "published"))
      .orderBy(desc(pubCrawls.createdAt));
  }),

  /** Auto-generate a crawl from a preset */
  generate: publicProcedure
    .input(z.object({
      preset: z.enum(["cheapest", "guinness", "craft", "trad", "area", "brewery", "epic", "nearby"]),
      area: z.string().optional(),   // optional area filter for any preset
      lat: z.number().optional(),    // for "nearby" preset
      lng: z.number().optional(),    // for "nearby" preset
      maxStops: z.number().min(3).max(10).default(5),
    }))
    .mutation(async ({ input }) => {
      const [allBars, allDrinks, allDeals] = await Promise.all([
        db.select().from(bars),
        db.select().from(drinks),
        db.select().from(deals),
      ]);

      let candidates = [...allBars];
      let name = "Belfast Crawl";
      let tags: string[] = [];

      switch (input.preset) {
        case "cheapest":
          candidates = candidates
            .filter(b => avgBeerPrice(b.id, allDrinks) < Infinity)
            .sort((a, b) => avgBeerPrice(a.id, allDrinks) - avgBeerPrice(b.id, allDrinks));
          name = "Cheapest Pints Crawl";
          tags = ["cheapest", "budget"];
          break;

        case "guinness":
          candidates = candidates
            .filter(b => b.servesGuinness)
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
          name = "The Guinness Trail";
          tags = ["guinness", "stout"];
          break;

        case "craft":
          candidates = candidates.filter(b => hasCraftBeer(b.id, allDrinks));
          candidates.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
          // Fallback: bars that at least have beer if no craft detected
          if (candidates.length < 2) {
            candidates = allBars.filter(b => avgBeerPrice(b.id, allDrinks) < Infinity);
          }
          name = "Craft Beer Crawl";
          tags = ["craft", "ipa", "pale-ale"];
          break;

        case "trad": {
          const tradBarIds = new Set(
            allDeals
              .filter(d => d.isActive && /trad|session|music/i.test(d.title + " " + (d.description ?? "")))
              .map(d => d.barId)
          );
          candidates = candidates.filter(b => tradBarIds.has(b.id));
          if (candidates.length < 2) {
            // Fallback: bars with any event deals
            const eventBarIds = new Set(allDeals.filter(d => d.type === "event").map(d => d.barId));
            candidates = allBars.filter(b => eventBarIds.has(b.id));
          }
          name = "Trad Music Trail";
          tags = ["trad", "music", "live"];
          break;
        }

        case "area":
          if (input.area) {
            candidates = candidates.filter(b => b.area === input.area);
            candidates.sort((a, b) => avgBeerPrice(a.id, allDrinks) - avgBeerPrice(b.id, allDrinks));
            name = `${input.area} Crawl`;
            tags = ["local", "area"];
          }
          break;

        case "brewery":
          candidates = candidates.filter(b => b.type === "brewery" || b.type === "taproom");
          candidates.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
          // Fallback: craft beer bars if no breweries seeded yet
          if (candidates.length < 2) {
            candidates = allBars.filter(b => hasCraftBeer(b.id, allDrinks));
          }
          name = "Brewery Run";
          tags = ["brewery", "taproom", "craft"];
          break;

        case "epic": {
          // Best bar from each area by rating, up to maxStops areas
          const areaMap = new Map<string, typeof allBars[0]>();
          for (const bar of allBars.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))) {
            const area = bar.area ?? "Unknown";
            if (!areaMap.has(area)) areaMap.set(area, bar);
          }
          candidates = Array.from(areaMap.values());
          name = "Epic Belfast Crawl";
          tags = ["epic", "multi-area", "city-wide"];
          break;
        }

        case "nearby": {
          if (input.lat != null && input.lng != null) {
            const origin = { lat: input.lat, lng: input.lng };
            candidates = candidates
              .filter(b => b.lat && b.lng)
              .sort((a, b) => geoDistKm(origin, a) - geoDistKm(origin, b));
            name = "Near Me Crawl";
            tags = ["nearby", "walking", "local"];
          } else {
            // No coords: fall back to highest-rated
            candidates = candidates.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
            name = "Belfast Crawl";
            tags = ["local"];
          }
          break;
        }
      }

      // Optional area filter applied on top of any preset (except "area" which handles it inline)
      if (input.area && input.preset !== "area") {
        const areaFiltered = candidates.filter(b => b.area === input.area);
        // Only apply if the filter still leaves enough bars
        if (areaFiltered.length >= 2) {
          candidates = areaFiltered;
          name = `${name} · ${input.area}`;
        }
      }

      const selected = candidates.slice(0, input.maxStops);
      if (selected.length < 2) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Not enough bars match this preset yet. Add more bars or try a different preset.",
        });
      }

      return {
        barIds: selected.map(b => b.id),
        name,
        tags,
        barCount: selected.length,
      };
    }),

  /* ── Group crawl ──────────────────────────────────────────── */

  /** Start group mode — host only */
  startGroup: publicProcedure
    .input(z.object({ shareCode: z.string() }))
    .mutation(async ({ input }) => {
      const [crawl] = await db.select().from(pubCrawls)
        .where(eq(pubCrawls.shareCode, input.shareCode));
      if (!crawl) throw new TRPCError({ code: "NOT_FOUND", message: "Crawl not found" });

      const groupCode = generateCode(6);
      await db.update(pubCrawls).set({
        groupCode,
        isGroupActive: true,
        activeStopIndex: 0,
        participantCount: 1,
        lastActiveAt: new Date().toISOString(),
      }).where(eq(pubCrawls.shareCode, input.shareCode));

      return { groupCode };
    }),

  /** Guest joins a group crawl by groupCode */
  joinGroup: publicProcedure
    .input(z.object({ groupCode: z.string().toUpperCase() }))
    .mutation(async ({ input }) => {
      const [crawl] = await db.select().from(pubCrawls)
        .where(eq(pubCrawls.groupCode, input.groupCode));
      if (!crawl) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found — check the code and try again." });
      if (!crawl.isGroupActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This group crawl has ended." });

      await db.update(pubCrawls)
        .set({ participantCount: (crawl.participantCount ?? 1) + 1 })
        .where(eq(pubCrawls.groupCode, input.groupCode));

      return {
        shareCode: crawl.shareCode,
        activeStopIndex: crawl.activeStopIndex ?? 0,
        name: crawl.name,
        barIds: crawl.barIds,
        participantCount: (crawl.participantCount ?? 1) + 1,
      };
    }),

  /** Poll current group state (guests call every 5s) */
  getGroupState: publicProcedure
    .input(z.object({ groupCode: z.string() }))
    .query(async ({ input }) => {
      const [crawl] = await db.select().from(pubCrawls)
        .where(eq(pubCrawls.groupCode, input.groupCode));
      if (!crawl) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        activeStopIndex: crawl.activeStopIndex ?? 0,
        participantCount: crawl.participantCount ?? 1,
        isGroupActive: crawl.isGroupActive ?? false,
      };
    }),

  /** Host advances to next stop */
  advanceStop: publicProcedure
    .input(z.object({ groupCode: z.string() }))
    .mutation(async ({ input }) => {
      const [crawl] = await db.select().from(pubCrawls)
        .where(eq(pubCrawls.groupCode, input.groupCode));
      if (!crawl) throw new TRPCError({ code: "NOT_FOUND" });

      const barIds = JSON.parse(crawl.barIds) as number[];
      const next = Math.min((crawl.activeStopIndex ?? 0) + 1, barIds.length - 1);
      await db.update(pubCrawls)
        .set({ activeStopIndex: next, lastActiveAt: new Date().toISOString() })
        .where(eq(pubCrawls.groupCode, input.groupCode));

      return { activeStopIndex: next, isLastStop: next === barIds.length - 1 };
    }),

  /** Host ends the group crawl */
  endGroup: publicProcedure
    .input(z.object({ groupCode: z.string() }))
    .mutation(async ({ input }) => {
      await db.update(pubCrawls)
        .set({ isGroupActive: false, lastActiveAt: new Date().toISOString() })
        .where(eq(pubCrawls.groupCode, input.groupCode));
      return { ok: true };
    }),

  /* ── Admin ────────────────────────────────────────────────── */

  getSubmitted: publicProcedure.query(async () => {
    return db.select().from(pubCrawls)
      .where(eq(pubCrawls.status, "submitted"))
      .orderBy(desc(pubCrawls.createdAt));
  }),

  moderate: publicProcedure
    .input(z.object({
      shareCode: z.string(),
      action: z.enum(["approve", "reject"]),
    }))
    .mutation(async ({ input }) => {
      await db.update(pubCrawls)
        .set({ status: input.action === "approve" ? "published" : "private" })
        .where(eq(pubCrawls.shareCode, input.shareCode));
      return { ok: true };
    }),
});
