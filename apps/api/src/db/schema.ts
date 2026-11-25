import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const NOTIFICATION_TYPES = ['friend_request', 'friend_accepted', 'offer', 'offer_caught', 'raid', 'announcement', 'account'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

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
    /** Push notification switches per kind; a missing key means on. */
    notifyPrefs: jsonb('notify_prefs').$type<Partial<Record<NotificationType, boolean>>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Last authenticated request, updated at most once an hour. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** When the player finished or skipped the welcome tour; null = show it. */
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    /** Set by an admin: the account cannot log in or use its sessions until lifted. */
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
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
    /** The owner's order, which friends see too (smallest first). */
    position: integer('position').notNull().default(0),
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
    /** '' (genderless) | m | f */
    gender: text('gender').notNull().default(''),
    done: boolean('done').notNull().default(false),
    note: text('note'),
    position: integer('position').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.variantKey, t.shiny, t.tag, t.gender] })],
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
    /** userId pinned this friend to the top of their friends. */
    favorite: boolean('favorite').notNull().default(false),
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
  /** Genders the variant exists in, when the game master does not say (new costumes): ["m"], ["f"], ["m","f"] or [] */
  genders: jsonb('genders').$type<('m' | 'f')[]>(),
  /** true = its shiny is in the game, false = not yet (the variant itself may be), null = automatic */
  shinyReleased: boolean('shiny_released'),
  /** true = this costume cannot evolve, false = it can, null = from the game master */
  noEvolve: boolean('no_evolve'),
  /** true = this costume cannot Mega Evolve, false = it can, null = from the game master */
  noMega: boolean('no_mega'),
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

/** "I have this one": a friend tells the list owner they own an entry they are hunting. */
/** What happened in a collection, newest first. Close actions by the same person merge into one line. */
export const listEvents = pgTable(
  'list_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').$type<import('@mydexpogo/shared').ListEventKind>().notNull(),
    count: integer('count').notNull().default(1),
    /** A few of the Pokémon concerned, to show their sprites. */
    items: jsonb('items').$type<import('@mydexpogo/shared').ListEventItem[]>().notNull().default([]),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('list_events_list_idx').on(t.listId, t.createdAt)],
);

export const listOffers = pgTable(
  'list_offers',
  {
    listId: text('list_id').notNull(),
    variantKey: text('variant_key').notNull(),
    shiny: boolean('shiny').notNull(),
    tag: text('tag').notNull(),
    gender: text('gender').notNull().default(''),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.variantKey, t.shiny, t.tag, t.gender, t.userId] }),
    foreignKey({ columns: [t.listId, t.variantKey, t.shiny, t.tag, t.gender], foreignColumns: [listEntries.listId, listEntries.variantKey, listEntries.shiny, listEntries.tag, listEntries.gender] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
);

/** In-app inbox; the same events may also go out as push notifications. */
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: NOTIFICATION_TYPES }).notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'cascade' }),
    listId: text('list_id').references(() => lists.id, { onDelete: 'cascade' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

/** One Web Push subscription per device. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

/** Friends' lists are followed by default; a row here means "stop showing me this one". */
export const listUnfollows = pgTable(
  'list_unfollows',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listId] })],
);

/** A friend's collection pinned to the top of "Friends' collections". */
export const listFavorites = pgTable(
  'list_favorites',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listId] })],
);

/** JavaScript errors reported by the app in players' browsers, one row per distinct error (counted), for admins. */
export const clientErrors = pgTable('client_errors', {
  /** Hash of message + first stack frame: the same bug from many devices is one row. */
  id: text('id').primaryKey(),
  message: text('message').notNull(),
  stack: text('stack'),
  url: text('url'),
  userAgent: text('user_agent'),
  appVersion: text('app_version'),
  count: integer('count').notNull().default(1),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});

/** Raid bosses a player was told about (raid alerts), so the same boss is not announced again while it lasts. */
export const raidAlerts = pgTable(
  'raid_alerts',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Variant key, "|shadow" for a Shadow raid. */
    bossId: text('boss_id').notNull(),
    alertedAt: timestamp('alerted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bossId] })],
);

/** A player's own Pokémon kept for PvP: which form, its IVs, its level if known. */
export const pvpPokemon = pgTable(
  'pvp_pokemon',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** PvP form key ("184", "105.fALOLA"). */
    formKey: text('form_key').notNull(),
    atk: integer('atk').notNull(),
    def: integer('def').notNull(),
    sta: integer('sta').notNull(),
    level: real('level'),
    shadow: boolean('shadow').notNull().default(false),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pvp_pokemon_user_idx').on(t.userId)],
);

/** Instance settings an admin changes from the app (sign-up mode...), one JSON value per key. */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Invitation codes for sign-ups by invitation (sha256 of the code; the code is shown once). */
export const inviteCodes = pgTable('invite_codes', {
  id: text('id').primaryKey(),
  codeHash: text('code_hash').notNull().unique(),
  note: text('note'),
  maxUses: integer('max_uses').notNull().default(1),
  uses: integer('uses').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** What admins and managers changed, and when; `data.before` lets some changes be undone. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

/** Players' reports of a data mistake on a Pokémon page, for managers to handle. */
export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    variantKey: text('variant_key').notNull(),
    kind: text('kind', { enum: ['name', 'released', 'gender', 'picture', 'other'] }).notNull(),
    message: text('message'),
    status: text('status', { enum: ['open', 'resolved', 'dismissed'] }).notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    handledBy: text('handled_by').references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt)],
);

/** A message shown to everyone in a banner (maintenance, news), optionally pushed once. */
export const announcements = pgTable('announcements', {
  id: text('id').primaryKey(),
  message: text('message').notNull(),
  level: text('level', { enum: ['info', 'warning'] }).notNull().default('info'),
  link: text('link'),
  active: boolean('active').notNull().default(true),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  pushedAt: timestamp('pushed_at', { withTimezone: true }),
  pushCount: integer('push_count'),
});

/**
 * Collections deleted by their owner or an admin, kept whole (entries, history, follows) for 30 days so an admin can
 * bring one back. Gone with the account.
 */
export const deletedLists = pgTable(
  'deleted_lists',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    entries: integer('entries').notNull().default(0),
    deletedBy: text('deleted_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index('deleted_lists_owner_idx').on(t.ownerId), index('deleted_lists_deleted_idx').on(t.deletedAt)],
);
