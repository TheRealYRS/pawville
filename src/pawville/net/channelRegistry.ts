/**
 * One owner per Realtime topic.
 *
 * ROOT CAUSE this fixes: supabase-js (realtime-js ≥ 2.11) de-duplicates channels by topic —
 * `client.channel('x')` returns the EXISTING channel if one with that topic is still registered.
 * Pawville created a new presence channel on every TownPage mount (and the pair transport on
 * every `adopt`) while the previous owner's async `removeChannel` was still pending. The new
 * owner then received the OLD channel object (with the old presence key and old callbacks), and
 * a moment later the old owner's cleanup removed it — so presence silently died ("online — just
 * you", "partner away") right after screen changes, invitations or React Strict-Mode remounts.
 *
 * `acquireChannel` serialises open/close per topic: it waits for any pending removal, removes
 * any channel still registered under that topic, and only then creates a fresh one. `release`
 * removes exactly the channel it created — never a newer owner's channel.
 */
export interface RealtimeClientLike {
  channel(topic: string, opts?: unknown): unknown;
  removeChannel(channel: unknown): Promise<unknown>;
  getChannels?: () => unknown[];
}

export interface Lease {
  readonly channel: unknown;
  readonly topic: string;
  readonly generation: number;
  release(): Promise<void>;
}

const queues = new WeakMap<object, Map<string, Promise<unknown>>>();
const generations = new WeakMap<object, Map<string, number>>();

function topicOf(ch: unknown): string | null {
  const t = (ch as { topic?: unknown } | null)?.topic;
  return typeof t === 'string' ? t : null;
}

/** Realtime prefixes topics with "realtime:". */
const sameTopic = (registered: string | null, topic: string) => registered === topic || registered === `realtime:${topic}`;

function enqueue<T>(client: object, topic: string, job: () => Promise<T>): Promise<T> {
  let q = queues.get(client);
  if (!q) queues.set(client, (q = new Map()));
  const prev = q.get(topic) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(job);
  q.set(topic, next.catch(() => undefined));
  return next;
}

export function acquireChannel(client: RealtimeClientLike, topic: string, opts: unknown): Promise<Lease> {
  return enqueue(client, topic, async () => {
    for (const existing of client.getChannels?.() ?? []) {
      if (sameTopic(topicOf(existing), topic)) await client.removeChannel(existing).catch(() => undefined);
    }
    let g = generations.get(client);
    if (!g) generations.set(client, (g = new Map()));
    const generation = (g.get(topic) ?? 0) + 1;
    g.set(topic, generation);
    const channel = client.channel(topic, opts);
    let released = false;
    return {
      channel,
      topic,
      generation,
      release: () => {
        if (released) return Promise.resolve();
        released = true;
        return enqueue(client, topic, async () => {
          await client.removeChannel(channel).catch(() => undefined);
        });
      },
    };
  });
}

/** Current generation for a topic (tests / diagnostics). */
export function channelGeneration(client: object, topic: string): number {
  return generations.get(client)?.get(topic) ?? 0;
}
