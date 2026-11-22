/** Minimal HTTP client with a cookie jar and its own client IP (the API rate-limits per x-forwarded-for). */
export const API = (process.env.API_URL ?? 'http://localhost:3100').replace(/\/$/, '');

let seq = 1;
export interface Res<T = any> { status: number; body: T; headers: Headers }

export class Client {
  cookie = '';
  readonly ip: string;
  constructor(ip?: string) {
    this.ip = ip ?? `10.${(seq >> 16) & 255}.${(seq >> 8) & 255}.${seq++ & 255}`;
  }
  async req<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const res = await fetch(`${API}/api${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), 'x-forwarded-for': this.ip, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie()) {
      const m = /^sid=([^;]*)/.exec(c);
      if (m) this.cookie = m[1] ? `sid=${m[1]}` : '';
    }
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, body: parsed, headers: res.headers };
  }
  get = <T = any>(p: string, h?: Record<string, string>) => this.req<T>('GET', p, undefined, h);
  post = <T = any>(p: string, b?: unknown) => this.req<T>('POST', p, b ?? {});
  put = <T = any>(p: string, b?: unknown) => this.req<T>('PUT', p, b ?? {});
  patch = <T = any>(p: string, b?: unknown) => this.req<T>('PATCH', p, b ?? {});
  del = <T = any>(p: string, b?: unknown) => this.req<T>('DELETE', p, b);
}

export const runId = Date.now().toString(36).slice(-5);
export const name = (n: string) => `${n}_${runId}`;
export const PASSWORD = 'correct-horse-42';

export async function register(username: string, password = PASSWORD): Promise<Client & { user: any }> {
  const c = new Client() as Client & { user: any };
  const r = await c.post('/auth/register', { username, password });
  if (r.status !== 201) throw new Error(`register ${username}: ${r.status} ${JSON.stringify(r.body)}`);
  c.user = r.body.user;
  return c;
}
