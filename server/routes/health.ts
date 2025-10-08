export default function handler(_req: any, res: any) {
  res.json({ ok: true, timestamp: new Date().toISOString() });
}
