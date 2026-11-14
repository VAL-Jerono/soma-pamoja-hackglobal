# Soma Pamoja frontend

This is the public Vite client for Soma Pamoja. It runs on Vercel and calls the existing FastAPI backend on Vultr.

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Set `VITE_API_BASE` to the HTTPS Vultr API hostname. The frontend does not contain provider keys, database credentials, or a facilitator PIN.

## Build

```bash
pnpm build
pnpm test
```

Production builds require an HTTPS `VITE_API_BASE`. The backend must allow the deployed Vercel origin through exact CORS configuration.

## Routes

The app uses hash routes: `#/` welcome, `#/session` child mode, and `#/facilitator` facilitator mode.

All content comes from the API. Draft status remains visible, typed demo is separated from speech evidence, and comprehension is stored separately from reading.
