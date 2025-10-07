# ⚠️ DEPRECATED - DO NOT USE OR MODIFY

## Status: DEPRECATED as of October 2025

These Supabase Edge Functions are **DEPRECATED** and scheduled for removal.

## Why Deprecated?

1. **Cost**: Supabase Edge Function invocation limits on our plan
2. **Architecture**: Moving to Vercel API Routes for single-server deployment
3. **Maintenance**: Avoiding duplicate code across multiple endpoints

## Current Status

- **Still Active in Production**: YES (for now)
- **Should Be Modified**: NO
- **Replacement**: `/api/ai/chat.js` (Vercel API Route)
- **Migration Status**: In Progress

## DO NOT:
- ❌ Add new features to these functions
- ❌ Update prompts here
- ❌ Fix bugs here (fix in Vercel route instead)
- ❌ Reference these in new code

## Removal Timeline

1. **Phase 1** (NOW): Migration to Vercel API Routes
2. **Phase 2** (1 week): Monitor Vercel route stability
3. **Phase 3** (2 weeks): Remove Edge Functions completely

## Functions Affected

- `/supabase/functions/chat` - Main chat endpoint (DEPRECATED)
- All other Edge Functions in this directory

## Questions?

Contact the team before making ANY changes to these functions.