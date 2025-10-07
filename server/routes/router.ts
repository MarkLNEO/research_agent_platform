import chat from './ai/chat.ts';
import dashboardGreeting from './dashboard/greeting.ts';
import manageAccounts from './accounts/manage.ts';
import refreshAccounts from './accounts/refresh.ts';
import triggerSignals from './signals/trigger-detection.ts';
import extractSignals from './signals/extract.ts';
import bulk from './research/bulk.ts';
import bulkRunner from './research/bulk-runner.ts';
import evaluateResearch from './research/evaluate.ts';
import approvalsNotify from './approvals/notify.ts';
import approvalsConfirm from './approvals/confirm.ts';
import buildPrompt from './debug/build-prompt.ts';
import draftOutreach from './outreach/draft.ts';
import updateProfile from './profiles/update.ts';
import health from './health.ts';
import test from './test.ts';

type Handler = (req: any, res: any) => unknown;

type RouteDefinition = {
  method: string;
  path: string;
  handler: Handler;
};

export const routeDefinitions: RouteDefinition[] = [
  { method: 'post', path: '/ai/chat', handler: chat },
  { method: 'options', path: '/ai/chat', handler: chat },

  { method: 'get', path: '/dashboard/greeting', handler: dashboardGreeting },
  { method: 'options', path: '/dashboard/greeting', handler: dashboardGreeting },

  { method: 'post', path: '/accounts/manage', handler: manageAccounts },
  { method: 'options', path: '/accounts/manage', handler: manageAccounts },

  { method: 'post', path: '/accounts/refresh', handler: refreshAccounts },
  { method: 'options', path: '/accounts/refresh', handler: refreshAccounts },

  { method: 'post', path: '/signals/trigger-detection', handler: triggerSignals },
  { method: 'options', path: '/signals/trigger-detection', handler: triggerSignals },
  { method: 'post', path: '/signals/extract', handler: extractSignals },
  { method: 'options', path: '/signals/extract', handler: extractSignals },

  { method: 'post', path: '/research/bulk', handler: bulk },
  { method: 'options', path: '/research/bulk', handler: bulk },
  { method: 'post', path: '/research/bulk-runner', handler: bulkRunner },
  { method: 'options', path: '/research/bulk-runner', handler: bulkRunner },
  { method: 'post', path: '/research/evaluate', handler: evaluateResearch },
  { method: 'options', path: '/research/evaluate', handler: evaluateResearch },

  { method: 'post', path: '/approvals/notify', handler: approvalsNotify },
  { method: 'options', path: '/approvals/notify', handler: approvalsNotify },
  { method: 'post', path: '/approvals/confirm', handler: approvalsConfirm },
  { method: 'options', path: '/approvals/confirm', handler: approvalsConfirm },

  { method: 'post', path: '/debug/build-prompt', handler: buildPrompt },
  { method: 'options', path: '/debug/build-prompt', handler: buildPrompt },

  { method: 'post', path: '/outreach/draft', handler: draftOutreach },
  { method: 'options', path: '/outreach/draft', handler: draftOutreach },

  { method: 'post', path: '/profiles/update', handler: updateProfile },
  { method: 'options', path: '/profiles/update', handler: updateProfile },
  { method: 'post', path: '/update-profile', handler: updateProfile },
  { method: 'options', path: '/update-profile', handler: updateProfile },

  { method: 'get', path: '/health', handler: health },
  { method: 'options', path: '/health', handler: health },

  { method: 'post', path: '/test', handler: test },
  { method: 'options', path: '/test', handler: test },
];

const routeMap = new Map<string, Handler>();
for (const { method, path, handler } of routeDefinitions) {
  const normalizedPath = normalizePath(path);
  routeMap.set(`${method.toLowerCase()} ${normalizedPath}`, handler);
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) return `/${path}`;
  if (path !== '/' && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

export async function handleApiRequest(req: any, res: any) {
  const method = (req.method || 'GET').toLowerCase();
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let pathname = url.pathname || '/';
    if (pathname.startsWith('/api')) {
      pathname = pathname.slice(4) || '/';
    }
    if (!pathname.startsWith('/')) pathname = `/${pathname}`;
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    const key = `${method} ${pathname.toLowerCase()}`;
    const handler = routeMap.get(key);
    if (!handler) {
      res.status(404).json({ error: `No route for ${req.method} ${pathname}` });
      return;
    }
    await handler(req, res);
  } catch (err: any) {
    console.error('Router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Internal error' });
    }
  }
}
