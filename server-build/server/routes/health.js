export default function handler(_req, res) {
    res.json({ ok: true, timestamp: new Date().toISOString() });
}
