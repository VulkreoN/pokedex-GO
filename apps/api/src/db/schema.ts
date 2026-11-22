import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    friendCode: text('friend_code').notNull(),
    /** user | manager (can mark variants released) | admin (can promote, refresh data) */
    role: text('role', { enum: ['user', 'manager', 'admin'] }).notNull().default('user'),
    /** One-time password reset code issued by an admin (sha256), valid until resetExpiresAt. */
    resetHash: text('reset_hash'),
    resetExpiresAt: timestamp('reset_expires_at', { withTimezone: true }),
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

export interface FeedAttachment {
  name: string;
  /** Local path under DATA_DIR/feed, served by the API (Discord CDN links expire). */
  file: string | null;
  contentType: string | null;
  size: number;
  /** Text content for small text attachments (game master diffs). */
  text?: string;
}
export interface FeedMatch {
  variantKey: string;
  reason: string;
}

/** Release signals pulled from PokeMiners' Discord announcement channels and the official news, reviewed by managers. */
export const feedItems = pgTable(
  'feed_items',
  {
    id: text('id').primaryKey(), // "discord:<message id>" | "news:<slug>"
    source: text('source').notNull(), // "discord:gm" | "discord:assets" | "discord:events" | "news"
    title: text('title'),
    content: text('content').notNull().default(''),
    url: text('url'),
    attachments: jsonb('attachments').$type<FeedAttachment[]>().notNull().default([]),
    matches: jsonb('matches').$type<FeedMatch[]>().notNull().default([]),
    status: text('status', { enum: ['new', 'done', 'ignored'] }).notNull().default('new'),
    /** Set when the job applied the matches itself (game master confirmation). */
    auto: boolean('auto').notNull().default(false),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    handledBy: text('handled_by').references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => [index('feed_items_status_idx').on(t.status, t.postedAt), index('feed_items_source_idx').on(t.source, t.postedAt)],
);

/** Cursor per polled source (last Discord message id, last news slug set...). */
export const feedCursors = pgTable('feed_cursors', {
  source: text('source').primaryKey(),
  cursor: text('cursor').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Curated posts (X/Twitter infographics) added by managers through the official oEmbed endpoint. */
export const posts = pgTable(
  'posts',
  {
    id: text('id').primaryKey(), // tweet id
    url: text('url').notNull(),
    author: text('author').notNull(),
    authorUrl: text('author_url'),
    /** Plain text of the post, links expanded. */
    text: text('text').notNull(),
    /** oEmbed HTML (blockquote), rendered with X's widget script to show the pictures. */
    html: text('html').notNull(),
    links: jsonb('links').$type<string[]>().notNull().default([]),
    /** Redeem codes found in links (store.pokemongo.com/offer-redemption?passcode=...). */
    codes: jsonb('codes').$type<string[]>().notNull().default([]),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('posts_posted_idx').on(t.postedAt)],
);
