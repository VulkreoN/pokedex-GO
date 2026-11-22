/** Web Push delivery. VAPID keys come from the environment or are generated once and kept in DATA_DIR. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { WebPushError, generateVAPIDKeys, sendNotification } from 'web-push';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';

export interface PushMessage {
  title: string;
  body: string;
  /** Path opened when the notification is tapped. */
  url: string;
  /** Same tag = the new notification replaces the previous one on the device instead of stacking. */
  tag: string;
}

let keys: { publicKey: string; privateKey: string } | null = null;
/** PUSH_DRY_RUN=1: record instead of sending (tests). */
export const sentLog: { userId: string; endpoint: string; message: PushMessage }[] = [];

export async function vapidKeys() {
  if (keys) return keys;
  if (env.vapidPublicKey && env.vapidPrivateKey) return (keys = { publicKey: env.vapidPublicKey, privateKey: env.vapidPrivateKey });
  const file = path.join(env.dataDir, 'vapid.json');
  try {
    keys = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    keys = generateVAPIDKeys();
    await mkdir(env.dataDir, { recursive: true });
    await writeFile(file, JSON.stringify(keys), { mode: 0o600 });
    console.log('push: generated VAPID keys in', file);
  }
  return keys!;
}

export async function pushToUser(userId: string, message: PushMessage): Promise<number> {
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  if (!subs.length) return 0;
  const k = await vapidKeys();
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      if (env.pushDryRun) {
        sentLog.push({ userId, endpoint: s.endpoint, message });
        delivered++;
        return;
      }
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), {
          vapidDetails: { subject: env.vapidSubject, publicKey: k.publicKey, privateKey: k.privateKey },
          TTL: 24 * 3600,
          urgency: 'normal',
          topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
        });
        delivered++;
      } catch (e) {
        // 404 / 410: the browser dropped the subscription, forget it.
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
          await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
        } else console.error('push failed', (e as Error).message);
      }
    }),
  );
  return delivered;
}
