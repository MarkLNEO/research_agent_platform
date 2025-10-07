# Branching Activity Log

## 2025-10-07 15:35:05 UTC
- Set remote origin to `https://github.com/MarkLNEO/research_agent_platform.git`.
- Pushed existing history on branch `main` to the new GitHub repository.
- Tagged production baseline as `v2025.10.07` and pushed the tag.
- Created feature branch `feature/current-work` to hold in-flight changes and pushed it upstream.

## 2025-10-07 16:13:43 UTC
- Enabled branch protection on `main` (PR review required, linear history, no force pushes).
- Added GitHub Actions workflow `.github/workflows/ci.yml` for lint/typecheck/build and rubric smoke gating.


## 2025-10-07 20:27:43 UTC
- Updated `HomeGate` to redirect new users to the Welcome Agent until onboarding is complete.
- Swapped profile banner navigation to use React Router (prevents `/profile-coach` 404).
- Added migration `20251107173000_auto_approve_new_users.sql` and pushed it via `supabase db push` (auto-approves signups with starter credits).

## 2025-10-07 20:39:56 UTC
- Linked Vercel project `research-agent-platform-wndsrf` to GitHub repo `MarkLNEO/research_agent_platform` via CLI (`vercel git connect`).

## 2025-10-07 20:42:29 UTC
- Added Vercel env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_USE_VERCEL_API`) across Development/Preview/Production.

## 2025-10-07 21:12:28 UTC
- Merged PR #1 into `main`, deployed to production (`research-agent-platform-wndsrf-gg4011ilv`).
- Ran production smoke script: verified onboarding redirect and auto-approved credits for new signup.
