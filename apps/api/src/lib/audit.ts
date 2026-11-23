/** The admin journal: who changed what. Never blocks the change it records. */
import { db, schema } from '../db/index.js';
import { newId } from './ids.js';

export async function audit(actorId: string | null, action: string, targetType: string, targetId: string | null, data: Record<string, unknown> = {}) {
  await db.insert(schema.auditLog).values({ id: newId(), actorId, action, targetType, targetId, data }).catch((e) => console.error('audit', e));
}
