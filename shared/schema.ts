import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const bars = sqliteTable("bars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(), // bar, restaurant-bar, club, pub, brewery, taproom
  address: text("address"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  area: text("area"),
  imageUrl: text("image_url"),
  openingHours: text("opening_hours"),
  servesGuinness: integer("serves_guinness", { mode: "boolean" }).default(false).notNull(),
  googleMapsUrl: text("google_maps_url"),
  businessStatus: text("business_status"),
  websiteUrl: text("website_url"),
  phoneNumber: text("phone_number"),
  rating: real("rating"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const drinks = sqliteTable("drinks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  barId: integer("bar_id").references(() => bars.id).notNull(),
  name: text("name").notNull(),
  size: text("size"),
  price: real("price").notNull(),
  currency: text("currency").default("EUR").notNull(),
  drinkType: text("drink_type"),
  isVerified: integer("is_verified", { mode: "boolean" }).default(false).notNull(),
  verifiedAt: text("verified_at"),
  lastUpdated: text("last_updated").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const submissions = sqliteTable("submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  barId: integer("bar_id").references(() => bars.id).notNull(),
  drinkName: text("drink_name").notNull(),
  drinkSize: text("drink_size"),
  price: real("price").notNull(),
  currency: text("currency").default("EUR").notNull(),
  imageUrl: text("image_url"),
  submitterName: text("submitter_name"),
  kind: text("kind").default("new").notNull(),
  previousPrice: real("previous_price"),
  status: text("status").default("pending").notNull(),
  aiVerification: text("ai_verification"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const deals = sqliteTable("deals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  barId: integer("bar_id").references(() => bars.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  daysOfWeek: text("days_of_week"),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
});

export const barReports = sqliteTable("bar_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  barId: integer("bar_id").references(() => bars.id).notNull(),
  reason: text("reason").notNull(),
  detail: text("detail"),
  reporterName: text("reporter_name"),
  status: text("status").default("open").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const editorsPick = sqliteTable("editors_pick", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mode: text("mode").default("cheapest").notNull(),
  barId: integer("bar_id").references(() => bars.id),
  lastRandomBarId: integer("last_random_bar_id"),
  lastRandomDate: text("last_random_date"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  authKey: text("auth_key").notNull(),
  favouriteBarIds: text("favourite_bar_ids"),
  topics: text("topics"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const barSuggestions = sqliteTable("bar_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  area: text("area"),
  notes: text("notes"),
  submittedBy: text("submitted_by"),
  createdAt: text("created_at").notNull(),
  status: text("status").default("pending"),
});

export const pubCrawls = sqliteTable("pub_crawls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  barIds: text("bar_ids").notNull(),             // JSON array of bar IDs in order
  status: text("status").notNull().default("private"), // private | submitted | published
  shareCode: text("share_code").notNull(),        // 6-char public read code
  groupCode: text("group_code"),                  // 6-char group join code (set when group starts)
  activeStopIndex: integer("active_stop_index").default(0),
  participantCount: integer("participant_count").default(1),
  isGroupActive: integer("is_group_active", { mode: "boolean" }).default(false),
  authorName: text("author_name"),
  tags: text("tags"),                             // JSON array of strings
  generatedBy: text("generated_by").default("manual"), // manual | auto
  autoParams: text("auto_params"),                // JSON — preset + area used
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastActiveAt: text("last_active_at"),
});

// Types
export type Bar = typeof bars.$inferSelect;
export type InsertBar = typeof bars.$inferInsert;
export type Drink = typeof drinks.$inferSelect;
export type InsertDrink = typeof drinks.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = typeof submissions.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;
export type BarReport = typeof barReports.$inferSelect;
export type InsertBarReport = typeof barReports.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;
export type EditorsPick = typeof editorsPick.$inferSelect;
export type InsertEditorsPick = typeof editorsPick.$inferInsert;
export type BarSuggestion = typeof barSuggestions.$inferSelect;
export type InsertBarSuggestion = typeof barSuggestions.$inferInsert;
export type PubCrawl = typeof pubCrawls.$inferSelect;
export type InsertPubCrawl = typeof pubCrawls.$inferInsert;
