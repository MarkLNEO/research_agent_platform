export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  console.log('[TEST] Handler called with method:', req.method);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    console.log('[TEST] Body:', req.body);
    console.log('[TEST] Headers:', req.headers);
    res.status(200).json({
      message: 'Test API works',
      body: req.body,
      timestamp: new Date().toISOString()
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
