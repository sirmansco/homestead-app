import { pgTable, text, timestamp, uuid, pgEnum, date } from 'drizzle-orm/pg-core';

export const appRoleEnum = pgEnum('app_role', ['parent', 'caregiver']);
export const villageGroupEnum = pgEnum('village_group', ['inner', 'family', 'sitter']);

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: appRoleEnum('role').notNull().default('parent'),
  villageGroup: villageGroupEnum('village_group').notNull().default('inner'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const kids = pgTable('kids', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  birthday: date('birthday'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
