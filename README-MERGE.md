# Soma Pamoja frontend v2

This ZIP is a frontend-only additive update. It does not replace the API, authentication, database, Docker, RAG, or deployment files.

## Visible changes

- Child activity runner route: `#/activities`
- Five facilitator tabs: Plan, Run, Mark, Progress, Guide
- Draft and human-review labels
- Protected Guide search with cited extractive results
- Mark queue with teacher result choices
- Modality progress counts
- Writing paper handoff state
- Listening fallback state when draft audio is not attached
- Existing read-aloud speech flow preserved

## Paste

From the repository root, extract this ZIP with overwrite enabled. It contains only frontend files and this merge note.

## Required frontend environment

For local development, `VITE_API_BASE` may be empty when the API is served through the same origin.

For a production build, set the final HTTPS Vultr API origin:

```bash
export VITE_API_BASE=https://api.example.org
pnpm build
pnpm test
```

The build intentionally fails if a production API URL is missing or not HTTPS.

## Backend contract expected by this frontend

- `GET /api/activities?learner=L-001`
- `POST /api/activity/respond`
- `GET /api/activity/queue` with facilitator bearer token
- `POST /api/activity/mark` with facilitator bearer token
- `GET /api/activity/progress?learner=L-001`
- `GET /api/guide/search?q=...` with facilitator bearer token

The child interface never receives an answer key. Child responses are submitted as machine evidence and remain markable by the facilitator.
