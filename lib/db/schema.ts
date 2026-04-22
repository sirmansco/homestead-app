import { pgTable, text, timestamp, uuid, pgEnum, date, unique, integer, boolean, jsonb } from 'drizzle-orm/pg-core';

export const appRoleEnum = pgEnum('app_role', ['parent', 'caregiver']);
export const bellStatusEnum = pgEnum('bell_status', ['ringing', 'handled', 'cancelled']);
export const bellResponseEnum = pgEnum('bell_response', ['on_my_way', 'in_thirty', 'cannot']);
export const villageGroupEnum = pgEnum('village_group', ['inner', 'family', 'sitter']);
export const shiftStatusEnum = pgEnum('shift_status', ['open', 'claimed', 'cancelled', 'done']);

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  glyph: text('glyph').notNull().default('🏡'),
  accentColor: text('accent_color'),
  setupCompleteAt: timestamp('setup_complete_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: appRoleEnum('role').notNull().default('parent'),
  villageGroup: villageGroupEnum('village_group').notNull().default('inner'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userHouseholdUnique: unique('users_clerk_user_household_unique').on(t.clerkUserId, t.householdId),
}));

export const kids = pgTable('kids', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  birthday: date('birthday'),
  notes: text('notes'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  forWhom: text('for_whom'),
  notes: text('notes'),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  rateCents: integer('rate_cents'),
  status: shiftStatusEnum('status').notNull().default('open'),
  claimedAt: timestamp('claimed_at'),
  isRecurring: boolean('is_recurring').notNull().default(false),
  recurDayOfWeek: integer('recur_day_of_week'),
  recurEndsAt: date('recur_ends_at'),
  recurOccurrences: integer('recur_occurrences'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const bells = pgTable('bells', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reason: text('reason').notNull(),
  note: text('note'),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  status: bellStatusEnum('status').notNull().default('ringing'),
  handledByUserId: uuid('handled_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  handledAt: timestamp('handled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const familyInvites = pgTable('family_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentEmail: text('parent_email').notNull(),
  parentName: text('parent_name'),
  villageGroup: villageGroupEnum('village_group').notNull().default('family'),
  status: text('status').notNull().default('pending'),
  acceptedHouseholdId: uuid('accepted_household_id').references(() => households.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const bellResponses = pgTable('bell_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  bellId: uuid('bell_id').notNull().references(() => bells.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  response: bellResponseEnum('response').notNull(),
  respondedAt: timestamp('responded_at').notNull().defaultNow(),
});
