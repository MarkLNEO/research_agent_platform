import type { VercelRequest, VercelResponse } from '@vercel/node';
import extract from '../../server-build/server/routes/signals/extract.js';
import trigger from '../../server-build/server/routes/signals/trigger-detection.js';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<void> | void> = {
  extract,
  'trigger-detection': trigger,
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = normalize(req.query.action) || fromPath(req.url, '/api/signals');
  const fn = handlers[slug];
  if (!fn) {
    res.status(404).json({ error: `No signals handler for ${slug || '(root)'}` });
    return;
  }
  await fn(req as any, res as any);
}

function normalize(param: string | string[] | undefined): string {
  if (!param) return '';
  if (Array.isArray(param)) return param.filter(Boolean).join('/');
  return param;
}

function fromPath(url: string | undefined, base: string): string {
  if (!url) return '';
  const path = url.split('?')[0] || '';
  if (path === base || path === `${base}/`) return '';
  if (path.startsWith(`${base}/`)) {
    return path.slice(base.length + 1).replace(/\/+/g, '/').replace(/\/+$/, '');
  }
  return '';
}
