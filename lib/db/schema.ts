import { pgTable, text, timestamp, uuid, pgEnum, date, unique, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const appRoleEnum = pgEnum('app_role', ['keeper', 'watcher']);
export const bellStatusEnum = pgEnum('bell_status', ['ringing', 'handled', 'cancelled']);
export const bellResponseEnum = pgEnum('bell_response', ['on_my_way', 'in_thirty', 'cannot']);
export const villageGroupEnum = pgEnum('village_group', ['inner_circle', 'sitter', 'covey', 'field']);
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
  role: appRoleEnum('role').notNull().default('keeper'),
  villageGroup: villageGroupEnum('village_group').notNull().default('covey'),
  photoUrl: text('photo_url'),
  notifyShiftPosted: boolean('notify_shift_posted').notNull().default(true),
  notifyShiftClaimed: boolean('notify_shift_claimed').notNull().default(true),
  notifyShiftReleased: boolean('notify_shift_released').notNull().default(true),
  notifyBellRinging: boolean('notify_bell_ringing').notNull().default(true),
  notifyBellResponse: boolean('notify_bell_response').notNull().default(true),
  isAdmin: boolean('is_admin').notNull().default(false),
  calToken: text('cal_token'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userHouseholdUnique: unique('users_clerk_user_household_unique').on(t.clerkUserId, t.householdId),
  calTokenIdx: index('idx_users_cal_token').on(t.calToken).where(sql`cal_token IS NOT NULL`),
}));

export const chicks = pgTable('chicks', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  birthday: date('birthday'),
  notes: text('notes'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const whistles = pgTable('whistles', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  preferredCaregiverId: uuid('preferred_caregiver_id').references(() => users.id, { onDelete: 'set null' }),
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
}, (t) => ({
  householdEndsAtStartsAtIdx: index('idx_whistles_household_ends_at_starts_at').on(t.householdId, t.endsAt, t.startsAt),
  householdStatusEndsAtStartsAtIdx: index('idx_whistles_household_status_ends_at_starts_at').on(t.householdId, t.status, t.endsAt, t.startsAt),
  claimedByEndsAtIdx: index('idx_whistles_claimed_by_ends_at').on(t.claimedByUserId, t.endsAt),
  createdByEndsAtIdx: index('idx_whistles_created_by_ends_at').on(t.createdByUserId, t.endsAt),
  preferredCaregiverStatusEndsAtIdx: index('idx_whistles_preferred_caregiver_status_ends_at').on(t.preferredCaregiverId, t.status, t.endsAt),
}));

export const lanterns = pgTable('lanterns', {
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
  escalatedAt: timestamp('escalated_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  statusEscalatedCreatedIdx: index('idx_lanterns_status_escalated_created').on(t.status, t.escalatedAt, t.createdAt),
  householdStatusEndsAtIdx: index('idx_lanterns_household_status_ends_at').on(t.householdId, t.status, t.endsAt),
}));

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userEndpointUnique: unique('push_subscriptions_user_endpoint_unique').on(t.userId, t.endpoint),
}));

export const familyInvites = pgTable('family_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentEmail: text('parent_email').notNull(),
  parentName: text('parent_name'),
  villageGroup: villageGroupEnum('village_group').notNull().default('covey'),
  status: text('status').notNull().default('pending'),
  acceptedHouseholdId: uuid('accepted_household_id').references(() => households.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const unavailability = pgTable('unavailability', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const lanternResponses = pgTable('lantern_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  lanternId: uuid('lantern_id').notNull().references(() => lanterns.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  response: bellResponseEnum('response').notNull(),
  respondedAt: timestamp('responded_at').notNull().defaultNow(),
}, (t) => ({
  lanternIdIdx: index('idx_lantern_responses_lantern_id').on(t.lanternId),
}));

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  kind: text('kind').notNull(),
  userAgent: text('user_agent'),
  appVersion: text('app_version'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
