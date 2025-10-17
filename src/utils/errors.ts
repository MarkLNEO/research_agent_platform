export type NormalizedApiError = {
  code?: string | null;
  message: string;
  details?: any;
  retryable?: boolean;
  status?: number;
};

export async function normalizeApiError(resp: Response): Promise<NormalizedApiError> {
  let payload: any = null;
  try {
    payload = await resp.clone().json();
  } catch {
    try { payload = { message: await resp.clone().text() }; } catch { payload = {}; }
  }
  const code = typeof payload?.code === 'string' ? payload.code : null;
  const message = String(payload?.message || payload?.error || resp.statusText || 'Request failed');
  const details = payload?.details ?? payload;
  const retryable = Boolean(payload?.retryable);
  return { code, message, details, retryable, status: resp.status };
}

export function toUserToast(err: unknown): { title: string; description: string } {
  try {
    if (err && typeof err === 'object' && 'message' in err) {
      const m = String((err as any).message || 'Something went wrong');
      return { title: 'Request failed', description: m.slice(0, 240) };
    }
  } catch {}
  return { title: 'Request failed', description: 'Please try again.' };
}

