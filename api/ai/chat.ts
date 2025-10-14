import handler, { config as builtConfig } from '../../server-build/server/routes/ai/chat.js';

// Re-export the function config so Vercel applies runtime/timeout settings
export const config = builtConfig;

export default handler;
