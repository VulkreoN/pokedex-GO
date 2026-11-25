export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** The rest of the error reply (a suspension's end date...). */
    public data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    credentials: 'include',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let code = 'generic';
    let body: Record<string, unknown> = {};
    try {
      const data = (await res.json()) as { error?: string | { name?: string } } & Record<string, unknown>;
      body = data;
      code = typeof data.error === 'string' ? data.error : data.error?.name === 'ZodError' ? 'validation' : 'generic';
    } catch {}
    if (res.status === 400 && code === 'generic') code = 'validation';
    throw new ApiError(res.status, code, body);
  }
  return (await res.json()) as T;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
