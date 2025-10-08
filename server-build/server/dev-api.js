import 'dotenv/config';
import express from 'express';
import cors from 'cors';
// Import API route handlers (Vercel-style) and adapt to Express
import { routeDefinitions } from './routes/router.js';
const app = express();
// Use API_PORT to avoid clashing with any generic PORT in .env
const PORT = Number(process.env.API_PORT || 3000);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Wrap Vercel-style handlers into Express handlers
const wrap = (handler) => async (req, res) => handler(req, res);
for (const { method, path, handler } of routeDefinitions) {
    const expressMethod = method.toLowerCase();
    const expressPath = `/api${path}`;
    if (typeof app[expressMethod] === 'function') {
        app[expressMethod](expressPath, wrap(handler));
    }
}
app.listen(PORT, () => {
    console.log(`Local API server running on http://localhost:${PORT}`);
});
