import "dotenv/config";
import { db } from "./server/db";
import { bars, deals, drinks } from "./shared/schema";

/**
 * Seed data for Belfast Pint Map v1.0.0
 *
 * Coordinates are approximate bar-centre placements sourced from public map data.
 * Use the REFRESH ALL BAR DATA admin button to pull live hours, phone, website,
 * and corrected coordinates from Google Places once the bars are live.
 * Admins can also drag-correct individual pins in the Bars Manager.
 */

// Beer and cider only — this is a pint map, not a cocktail menu.
const STAPLE_DRINKS = [
  // (name, size, basePriceGBP)
  ["Guinness",          "Pint",   5.50],
  ["Tennent's",         "Pint",   4.80],
  ["Harp",              "Pint",   4.80],
  ["Smithwick's",       "Pint",   5.00],
  ["Heineken",          "Pint",   5.20],
  ["Stella Artois",     "Pint",   5.30],
  ["Carlsberg",         "Pint",   4.90],
  ["Local IPA",         "Pint",   5.80],
  ["Magners",           "Pint",   5.20],
  ["Strongbow",         "Pint",   4.80],
] as const;

const NEW_BARS = [
  /* ----------- CATHEDRAL QUARTER ----------- */
  {
    name: "The Duke of York",
    type: "pub",
    area: "Cathedral Quarter",
    address: "7-11 Commercial Court, Belfast BT1 2NB",
    lat: 54.6004, lng: -5.9290,
    openingHours: "12:00-01:00",
    servesGuinness: true,
  },
  {
    name: "The Dirty Onion",
    type: "bar",
    area: "Cathedral Quarter",
    address: "3 Hill Street, Belfast BT1 2LB",
    lat: 54.6008, lng: -5.9294,
    openingHours: "12:00-01:00",
    servesGuinness: true,
  },
  {
    name: "The John Hewitt",
    type: "pub",
    area: "Cathedral Quarter",
    address: "51 Donegall Street, Belfast BT1 2FH",
    lat: 54.6013, lng: -5.9298,
    openingHours: "11:30-01:00",
    servesGuinness: false,
  },
  {
    name: "Kelly's Cellars",
    type: "pub",
    area: "Cathedral Quarter",
    address: "30 Bank Square, Belfast BT1 1HL",
    lat: 54.5991, lng: -5.9318,
    openingHours: "11:30-01:00",
    servesGuinness: true,
  },
  {
    name: "The Sunflower",
    type: "pub",
    area: "Cathedral Quarter",
    address: "65 Union Street, Belfast BT1 2JG",
    lat: 54.5994, lng: -5.9315,
    openingHours: "12:00-01:00",
    servesGuinness: false,
  },
  {
    name: "The Dark Horse",
    type: "pub",
    area: "Cathedral Quarter",
    address: "43 Hill Street, Belfast BT1 2LB",
    lat: 54.6003, lng: -5.9295,
    openingHours: "12:00-01:00",
    servesGuinness: true,
  },
  {
    name: "Madden's Bar",
    type: "pub",
    area: "Cathedral Quarter",
    address: "74 Berry Street, Belfast BT1 1FJ",
    lat: 54.5998, lng: -5.9325,
    openingHours: "11:30-01:00",
    servesGuinness: true,
  },
  {
    name: "The Rotterdam",
    type: "bar",
    area: "Cathedral Quarter",
    address: "54 Pilot Street, Belfast BT1 3BA",
    lat: 54.6011, lng: -5.9172,
    openingHours: "16:00-01:00",
    servesGuinness: true,
  },

  /* ----------- CITY CENTRE ----------- */
  {
    name: "The Crown Liquor Saloon",
    type: "pub",
    area: "City Centre",
    address: "46 Great Victoria Street, Belfast BT2 7BA",
    lat: 54.5956, lng: -5.9355,
    openingHours: "11:30-23:00",
    servesGuinness: true,
  },
  {
    name: "Robinson's Bar",
    type: "pub",
    area: "City Centre",
    address: "38-40 Great Victoria Street, Belfast BT2 7BA",
    lat: 54.5959, lng: -5.9358,
    openingHours: "11:30-01:00",
    servesGuinness: true,
  },
  {
    name: "McHugh's",
    type: "bar",
    area: "City Centre",
    address: "29-31 Queen's Square, Belfast BT1 3FG",
    lat: 54.5990, lng: -5.9257,
    openingHours: "12:00-01:00",
    servesGuinness: true,
  },
  {
    name: "Bert's Jazz Bar",
    type: "bar",
    area: "City Centre",
    address: "41 Skipper Street, Belfast BT1 2DH",
    lat: 54.5984, lng: -5.9256,
    openingHours: "17:00-01:00",
    servesGuinness: true,
  },
  {
    name: "The Spaniard",
    type: "bar",
    area: "City Centre",
    address: "3 Skipper Street, Belfast BT1 2DH",
    lat: 54.5982, lng: -5.9258,
    openingHours: "16:00-01:00",
    servesGuinness: true,
  },
  {
    name: "The National Grande Café",
    type: "restaurant-bar",
    area: "City Centre",
    address: "62 High Street, Belfast BT1 2BE",
    lat: 54.5975, lng: -5.9271,
    openingHours: "10:00-01:00",
    servesGuinness: true,
  },
  {
    name: "Muriel's Café Bar",
    type: "bar",
    area: "City Centre",
    address: "12 Church Lane, Belfast BT1 4QN",
    lat: 54.5978, lng: -5.9307,
    openingHours: "12:00-01:00",
    servesGuinness: true,
  },
  {
    name: "Bittles Bar",
    type: "pub",
    area: "City Centre",
    address: "70 Upper Church Lane, Belfast BT1 4QL",
    lat: 54.5982, lng: -5.9272,
    openingHours: "11:30-23:00",
    servesGuinness: true,
  },
  {
    name: "The Northern Whig",
    type: "bar",
    area: "City Centre",
    address: "2-10 Bridge Street, Belfast BT1 1LU",
    lat: 54.5993, lng: -5.9267,
    openingHours: "11:00-01:00",
    servesGuinness: true,
  },
  {
    name: "The Garrick Bar",
    type: "pub",
    area: "City Centre",
    address: "29 Chichester Street, Belfast BT1 4JB",
    lat: 54.5975, lng: -5.9288,
    openingHours: "11:30-23:00",
    servesGuinness: true,
  },
  {
    name: "The Deer's Head",
    type: "pub",
    area: "City Centre",
    address: "1 Lower Garfield Street, Belfast BT1 1FP",
    lat: 54.6001, lng: -5.9319,
    openingHours: "11:30-23:00",
    servesGuinness: true,
  },

  /* ----------- QUEEN'S QUARTER ----------- */
  {
    name: "Lavery's",
    type: "pub",
    area: "Queen's Quarter",
    address: "12 Bradbury Place, Belfast BT7 1RS",
    lat: 54.5914, lng: -5.9337,
    openingHours: "11:30-02:00",
    servesGuinness: true,
  },
  {
    name: "The Bot (Botanic Inn)",
    type: "pub",
    area: "Queen's Quarter",
    address: "23-27 Malone Road, Belfast BT9 6RU",
    lat: 54.5833, lng: -5.9373,
    openingHours: "11:30-01:00",
    servesGuinness: true,
  },
  {
    name: "Cutters Wharf",
    type: "bar",
    area: "Queen's Quarter",
    address: "4 Lockview Road, Belfast BT9 5FJ",
    lat: 54.5808, lng: -5.9337,
    openingHours: "12:00-01:00",
    servesGuinness: true,
  },
  {
    name: "The Empire Music Hall",
    type: "bar",
    area: "Queen's Quarter",
    address: "42 Botanic Avenue, Belfast BT7 1JQ",
    lat: 54.5898, lng: -5.9330,
    openingHours: "16:00-01:00",
    servesGuinness: true,
  },
  {
    name: "The Eglantine Inn",
    type: "pub",
    area: "Queen's Quarter",
    address: "32 Malone Road, Belfast BT9 5BQ",
    lat: 54.5848, lng: -5.9401,
    openingHours: "11:30-01:00",
    servesGuinness: true,
  },

  /* ----------- ORMEAU ROAD ----------- */
  {
    name: "The Hatfield House",
    type: "pub",
    area: "Ormeau Road",
    address: "130 Ormeau Road, Belfast BT7 2EB",
    lat: 54.5872, lng: -5.9238,
    openingHours: "12:00-01:00",
    servesGuinness: true,
  },
  {
    name: "The Errigle Inn",
    type: "pub",
    area: "Ormeau Road",
    address: "312 Ormeau Road, Belfast BT7 3GQ",
    lat: 54.5855, lng: -5.9218,
    openingHours: "11:30-01:00",
    servesGuinness: true,
  },

  /* ----------- LISBURN ROAD ----------- */
  {
    name: "The Woodworker",
    type: "bar",
    area: "Lisburn Road",
    address: "329 Lisburn Road, Belfast BT9 7EN",
    lat: 54.5804, lng: -5.9483,
    openingHours: "12:00-01:00",
    servesGuinness: false,
  },
  {
    name: "The Parlour Bar",
    type: "pub",
    area: "Lisburn Road",
    address: "1 Elmwood Avenue, Belfast BT9 6AZ",
    lat: 54.5849, lng: -5.9383,
    openingHours: "12:00-01:00",
    servesGuinness: true,
  },

  /* ----------- EAST BELFAST ----------- */
  {
    name: "The Strand Bar",
    type: "pub",
    area: "East Belfast",
    address: "12 Strandview Street, Belfast BT4 1NT",
    lat: 54.5893, lng: -5.9082,
    openingHours: "11:30-01:00",
    servesGuinness: true,
  },
] as const;

/* small price spread per area */
function priceFor(basePriceGBP: number, area: string) {
  const tier: Record<string, number> = {
    "Cathedral Quarter":  1.05,
    "City Centre":        1.05,
    "Queen's Quarter":    1.00,
    "Ormeau Road":        0.95,
    "Lisburn Road":       1.05,
    "East Belfast":       0.92,
    "Titanic Quarter":    1.08,
    "North Belfast":      0.90,
    "South Belfast":      1.00,
  };
  const k = tier[area] ?? 1.0;
  const jitter = 0.88 + Math.random() * 0.24;
  return Math.round(basePriceGBP * k * jitter * 20) / 20; // round to nearest 5p
}

async function run() {
  const existing = await db.select().from(bars);
  const forceReseed = process.argv.includes('--force');

  if (existing.length > 0 && !forceReseed) {
    console.log(`⚠️  Database already has ${existing.length} bars. Skipping seed.`);
    console.log('   To force a full reseed (DESTROYS ALL DATA): yarn db:seed --force');
    console.log('   To update coordinates only: yarn update:coords');
    process.exit(0);
  }

  if (forceReseed) {
    console.log('⚠️  FORCE flag detected — wiping and reseeding...');
  }

  console.log("Wiping existing data...");
  await db.delete(deals);
  await db.delete(drinks);
  await db.delete(bars);

  console.log(`Seeding ${NEW_BARS.length} Belfast bars...`);
  const inserted = await db.insert(bars).values(NEW_BARS as any).returning();

  console.log("Seeding beer menu for every bar...");
  for (const bar of inserted) {
    const rows = STAPLE_DRINKS
      .filter(([name]) => name !== "Guinness" || bar.servesGuinness)
      .filter(() => Math.random() > 0.30)
      .map(([name, size, base]) => ({
        barId: bar.id,
        name: name as string,
        size: size as string,
        price: priceFor(base as number, bar.area || ""),
        currency: "GBP",
        isVerified: Math.random() > 0.7,
        verifiedAt: Math.random() > 0.7 ? new Date().toISOString() : null,
      }));
    if (rows.length) await db.insert(drinks).values(rows);
  }

  console.log("Seeding sample happy hours...");
  const happyHourBars = inserted.filter((_, i) => i % 3 === 0);
  for (const bar of happyHourBars) {
    await db.insert(deals).values({
      barId: bar.id,
      title: "Happy Hour",
      description: "All draft beers discounted",
      type: "happy_hour",
      startTime: "17:00",
      endTime: "19:00",
      daysOfWeek: JSON.stringify([1,2,3,4,5]),
      isActive: true,
    });
  }

  const tradBars = [
    inserted.find(b => b.name === "Kelly's Cellars"),
    inserted.find(b => b.name === "Madden's Bar"),
  ].filter(Boolean);

  for (const bar of tradBars) {
    await db.insert(deals).values({
      barId: bar!.id,
      title: "Trad Session",
      description: "Live traditional music session",
      type: "event",
      startTime: "21:00",
      endTime: "23:30",
      daysOfWeek: JSON.stringify([4, 6]),
      isActive: true,
    });
  }

  console.log(`Done. Inserted ${inserted.length} bars.`);
  console.log(`Tip: use REFRESH ALL BAR DATA in the admin panel to pull live data from Google Places.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
