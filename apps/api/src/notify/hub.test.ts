import { describe, expect, it } from 'vitest';
import type { LiveEvent } from '@mydexpogo/shared';
import { hub } from './hub.js';

const ev: LiveEvent = { type: 'notification' } as LiveEvent;

describe('live hub', () => {
  it('keeps a new tab subscribed when the old one says goodbye twice', () => {
    const got: LiveEvent[] = [];
    const offOld = hub.subscribe('u-hub', () => {});
    offOld(); // the old page's stream is aborted...
    const offNew = hub.subscribe('u-hub', (e) => got.push(e)); // ...the new page connects...
    offOld(); // ...and the old stream's loop ends, unsubscribing once more.
    hub.emit(['u-hub'], ev);
    expect(got).toHaveLength(1);
    offNew();
    expect(hub.connections()).toBe(0);
  });
});
