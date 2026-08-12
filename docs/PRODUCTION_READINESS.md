# AloClinica production readiness

This document defines the sequence to move AloClinica from advanced MVP to real production operation.

## Current architecture confirmed

- Public site: `https://aloclinica.com.br`
- Production VPS: `72.62.138.208`
- Frontend container: `aloclinica-web`
- Video fallback server: `mirotalk` at `https://meet.telemedicinaaloclinica.sbs`
- TURN/STUN server: `coturn` (required for reliable WebRTC fallback; not currently installed on the inspected VPS)
- KYC face stack: `compreface-*`
- WhatsApp gateway: Evolution API (`aloclinica_evolution-api`)
- Supabase project: `pwxvvimdtmvziynbspgx`
- Deploy path: GitHub Actions builds `dist/`, copies to VPS, rebuilds the Nginx container, then deploys Supabase Edge Functions.

## VPS verification (2026-08-12)

- `aloclinica-web`, MiroTalk, Evolution API, CompreFace and Traefik were running.
- `https://whatsapp.telemedicinaaloclinica.sbs/` now has an active Traefik route and returned HTTP 200 after the route was installed.
- No `coturn` service, `turnserver` binary or UDP 3478/5349 listener was found. The `turn-credentials` function therefore cannot provide the private TURN fallback until a TURN secret is synchronized with Supabase.
- The public `aloclinica.com.br` domain still resolves through Cloudflare to the VPS origin; the EasyPanel `web` service must not be deleted as a duplicate without identifying a separate Cloudflare Pages/Workers deployment.

## Production gates

Do not open broad real operation until each gate is green.

1. Security gate
   - RLS enabled on identity, appointment, prescription, payment, KYC and LGPD tables.
   - No sensitive Edge Function has `verify_jwt = false`.
   - Webhook functions validate provider signature or internal secret.
   - Authenticated routes send `Cache-Control: no-store`.
   - Secrets are rotated and stored only in Supabase/GitHub/VPS secret stores.

2. Operational gate
   - `npm run audit:production` passes.
   - `npm run health:production` passes from CI and from an operator machine.
   - VPS containers are healthy.
   - Supabase crons have recent successful executions.
   - Daily backup exists and restore has been tested.

3. Scale gate
   - HTTP load test passes at the expected public traffic level.
   - Consultation load test is run with 25, 50, 100 and 150 parallel appointments.
   - WebRTC P2P success rate and TURN/MiroTalk fallback rate are measured.
   - MiroTalk and coturn bandwidth/CPU are measured under load.

4. Release gate
   - Staging deploy is available.
   - Production deploy has rollback workflow.
   - Go-live checklist is attached to each production release.
   - On-call contact and incident flow are defined.

## Commands

Static production security audit:

```bash
npm run audit:production
```

Public production health check:

```bash
npm run health:production
```

Optional health check with VPS Docker verification:

```bash
VPS_HOST=72.62.138.208 VPS_USER=root VPS_SSH_KEY="$HOME/.ssh/aloclinica_vps" npm run health:production
```

HTTP baseline load test:

```bash
npm run load:baseline -- --target https://aloclinica.com.br/health --duration 60 --concurrency 50
```

Database readiness checks:

```bash
# Run scripts/prod_readiness.sql in Supabase SQL editor or via Management API.
```

## Capacity position

The current video model starts with WebRTC P2P and uses Supabase Realtime only for signaling. This is efficient because most media traffic stays between doctor and patient.

The conservative production position before a real load test:

- P2P consultations: plan around dozens to low hundreds, depending on Supabase Realtime and client network quality.
- TURN/MiroTalk fallback consultations: plan around 20 to 40 simultaneous calls on the current 2 vCPU VPS until measured.
- Public website and dashboards: capacity is mostly Supabase-bound, not Nginx-bound.

Do not sell a hard simultaneous-consultation number until the scale gate is completed.

## Staging requirements

Staging must not share production patient data by default.

Required GitHub secrets for staging workflow:

- `STAGING_VPS_HOST`
- `STAGING_VPS_USER`
- `STAGING_VPS_SSH_PRIVATE_KEY`
- `STAGING_SITE_URL`
- `STAGING_SUPABASE_PROJECT_REF`
- `STAGING_VITE_SUPABASE_URL`
- `STAGING_VITE_SUPABASE_PUBLISHABLE_KEY`
- `STAGING_VITE_SENTRY_DSN` optional

Recommended DNS:

- `staging.aloclinica.com.br`
- `meet-staging.telemedicinaaloclinica.sbs`

## Incident response

1. Confirm impact with `npm run health:production`.
2. Check VPS containers with SSH and `docker ps`.
3. Check Supabase status, Edge Function logs and cron status.
4. If the issue came from the latest deploy, run rollback workflow with the last known good SHA.
5. Communicate incident status through `/status` and customer support channels.
6. Write a post-incident note: impact, root cause, fix, prevention.
