import { p } from "@repo/drizzle-utils";
import { integer, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const siteTable = p.pgTable("site", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 64 }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

export const customerTable = p.pgTable("customer", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 64 }).notNull(),
  remark: text(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

export const heroCardTable = p.pgTable("hero_card", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: varchar({ length: 128 }).notNull(),
  imageUrl: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

export const siteProductTable = p.pgTable("site_product", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 64 }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});
