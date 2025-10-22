export default function handler(_req: any, res: any) {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null;
  res.json({ ok: true, timestamp: new Date().toISOString(), commit: sha });
}
