import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    friendCode: text('friend_code').notNull(),
    /** user | manager (can mark variants released) | admin (can promote, refresh data) */
    role: text('role', { enum: ['user', 'manager', 'admin'] }).notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_lower_idx').on(sql`lower(${t.username})`),
    uniqueIndex('users_friend_code_idx').on(t.friendCode),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // sha256 of the cookie token
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const lists = pgTable(
  'lists',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    visibility: text('visibility', { enum: ['private', 'friends', 'link'] }).notNull().default('friends'),
    shareToken: text('share_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lists_owner_idx').on(t.ownerId), uniqueIndex('lists_share_token_idx').on(t.shareToken)],
);

export const listEntries = pgTable(
  'list_entries',
  {
    listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    variantKey: text('variant_key').notNull(),
    shiny: boolean('shiny').notNull().default(false),
    /** '' | lucky | background | shadow | purified | xxl | xxs */
    tag: text('tag').notNull().default(''),
    done: boolean('done').notNull().default(false),
    note: text('note'),
    position: integer('position').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.variantKey, t.shiny, t.tag] })],
);

export const friendRequests = pgTable(
  'friend_requests',
  {
    id: text('id').primaryKey(),
    fromId: text('from_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    toId: text('to_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'accepted', 'declined'] }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [index('friend_requests_to_idx').on(t.toId, t.status), index('friend_requests_from_idx').on(t.fromId, t.status)],
);

/** One row per direction, so "who are my friends" is a single index scan. */
export const friendships = pgTable(
  'friendships',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    friendId: text('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.friendId] })],
);

/** Manual corrections made by managers from the web app, applied on top of the generated dataset. */
export const variantOverrides = pgTable('variant_overrides', {
  variantKey: text('variant_key').primaryKey(),
  /** true = released, false = not yet, null = follow automatic detection */
  released: boolean('released'),
  labelEn: text('label_en'),
  labelFr: text('label_fr'),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
