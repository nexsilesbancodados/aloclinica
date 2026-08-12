# AloClínica — Arquitetura

Este documento dá uma visão geral da arquitetura técnica da plataforma. Atualizar
sempre que adicionar uma nova integração externa, edge function ou tabela.

---

## Visão alto-nível

```
┌────────────────────┐      ┌────────────────────────┐      ┌──────────────────────┐
│  Browser/Mobile    │      │  GitHub Actions CI/CD  │      │  VPS Hostinger       │
│  React 18 + Vite   │◄────►│  Build → SCP → Docker  │◄────►│  72.62.138.208       │
│  PWA + Capacitor   │      │  Deploy automático     │      │  Easypanel + Traefik │
└─────────┬──────────┘      └────────────────────────┘      └──────────┬───────────┘
          │                                                            │
          │  HTTPS                                                     │ Docker network
          ▼                                                            ▼
┌──────────────────────────────────────────┐         ┌────────────────────────────┐
│  Supabase (pwxvvimdtmvziynbspgx)         │         │  Containers internos        │
│  - Auth                                  │         │  - aloclinica-web (nginx)   │
│  - PostgreSQL + RLS                      │         │  - mirotalk (vídeo)         │
│  - Edge Functions (Deno) — 30+          │         │  - compreface (KYC face)    │
│  - Storage                               │         │  - evolution-api (WhatsApp) │
│  - Realtime                              │         │    + Postgres + Redis       │
│  - pg_cron                               │         │                             │
└──────────────────────────────────────────┘         └────────────────────────────┘
                    ▲                                              ▲
                    │                                              │
   ┌────────────────┴────────────────┐         ┌──────────────────┴────────────┐
   │  Integrações externas           │         │  Subdomínios públicos          │
   │  - Mercado Pago (pagamentos)    │         │  - aloclinica.com.br (front)   │
   │  - Brevo SMTP (email)           │         │  - face.aloclinica.com.br      │
   │  - DeepSeek/Anthropic (IA)      │         │  - meet.telemedicinaaloclinica │
   │  - DocuSeal (assinatura)        │         │    .sbs (vídeo)                │
   │  - Sentry (errors)              │         │  - whatsapp.telemedicina       │
   └─────────────────────────────────┘         │    aloclinica.sbs (WhatsApp)   │
                                               └────────────────────────────────┘
```

---

## Frontend (`src/`)

| Pasta | Função |
|---|---|
| `pages/` | 55 páginas roteadas (auth por papel, dashboards, landing, legal) |
| `components/admin/` | 30 sub-páginas do painel admin |
| `components/billing/` | Vault de cartões, AddCardForm, BillingPortal (paciente) |
| `components/consultation/` | VideoRoom, JitsiRoom, ChatPanel, SOAP notes |
| `components/kyc/` | BiometricKYC, KycCrossDevice (QR) |
| `components/landing/` | Header, HeroSection, FAQSection, Footer |
| `components/auth/` | KycRequiredGate, ProtectedRoute, ReVerificationGate |
| `contexts/` | AuthContext (user + roles + loading) |
| `hooks/` | use-webrtc, useSOAPNotes, usePrescriptionData, use-presence |
| `lib/` | sentry, logger, jitsi, supabase-config, csv |
| `integrations/supabase/` | client.ts (URL + anon key hardcoded), untyped.ts (alias) |
| `i18n/` | pt-BR, en, es |

**Build:** Vite com PWA plugin (96 entries de cache, ~70MB). Service Worker:
`generateSW` com `maximumFileSizeToCacheInBytes: 100MB`.

---

## Backend (Supabase)

### Auth
- Provider único: email + senha
- Trigger `handle_new_user()` cria `profiles` + `user_roles` automaticamente
- `metadata.role` (passado no signUp) define o role inicial; default `patient`
- `rate_limit_email_sent: 100/h`, SMTP via Brevo
- KYC obrigatório (CFM 2.314/2022) bloqueia `/dashboard/schedule/:id` e `/dashboard/consultation/:id`

### Database — domínios principais
| Domínio | Tabelas-chave |
|---|---|
| Identidade | `profiles`, `user_roles`, `user_consents`, `kyc_verificacoes`, `kyc_sessions` |
| Médicos | `doctor_profiles`, `doctor_specialties`, `doctor_availability`, `doctor_invite_codes` |
| Agenda | `appointments`, `appointment_waitlist`, `on_demand_queue` |
| **Pagamentos** | `payment_transactions`, `subscriptions`, `saved_cards`, `withdrawal_requests`, `coupons`, `plans` |
| Conteúdo médico | `prescriptions`, `prescription_renewals`, `prescription_signatures`, `aloc_laudos`, `aloc_exames` |
| Comunicação | `messages`, `notifications`, `consultation_chats`, `consultation_recordings` |
| Site/CMS | `site_sections` (com `draft_config` + `has_draft`), `site_config`, `site_media` |
| Auditoria | `activity_logs` (com `_archive` para >90 dias), `lgpd_access_log` |

### Edge Functions (30+)
Veja `supabase/functions/`. Categorias:
- **Pagamentos:** `mercadopago-create-payment`, `-webhook`, `-save-card`, `-charge-saved-card`, `-create-subscription`, `-cancel-subscription`, `-refund`, `-withdraw` (saque PIX médico via Money Out)
- **KYC:** `didit-kyc` (CompreFace + Claude Vision), `compreface-proxy`
- **Vídeo:** `turn-credentials` (Google STUN + Metered opcional; coturn próprio ainda não implantado)
- **Notificações:** `send-email` (Brevo, 40+ templates), `send-whatsapp`, `send-push-notification`
- **IA:** `pingo-chat`, `sugerir-laudo`, `symptom-triage`, `structure-report`
- **Assinatura:** `register-signature`, `vidaas-sign`, `vidaas-callback` (DocuSeal)

### pg_cron jobs ativos
| Nome | Cron | Função |
|---|---|---|
| `archive_old_activity_logs` | `0 4 * * *` | Move logs >90 dias para `activity_logs_archive` |
| `automation_triggers_*` | vários | SLA de laudos, lembretes de consulta |
| ~~`process_recurring_subscriptions`~~ | — | Removido. Mercado Pago Pre-Approval cobra assinaturas recorrentes automaticamente |

---

## Hospedagem (VPS Hostinger 72.62.138.208)

**Stack:** Easypanel + Traefik + Docker Compose

**Containers críticos:**
| Container | Porta interna | Subdomínio público | Função |
|---|---|---|---|
| `aloclinica-web` | 80 | aloclinica.com.br | Front (nginx servindo dist/) |
| `mirotalk` | 3000 | meet.telemedicinaaloclinica.sbs | Vídeo WebRTC |
| `evolution-api` | 8080 | whatsapp.telemedicinaaloclinica.sbs | Gateway WhatsApp (v2.3.7, com Postgres + Redis próprios) |
| `compreface-fe` | 80 | face.aloclinica.com.br | KYC face matching |

| `coturn` | 3478 UDP+TCP (host net) | direto (`72.62.138.208:3478`) | TURN/STUN próprio |

### coturn — provisionado em 2026-08-12

Container `coturn` (`/opt/coturn/turnserver.conf`), rede host, relay na faixa **49160-49200/UDP**.
Credencial de longo prazo, usuário `mirotalk`, realm `aloclinica.com.br`. Senha em
`/opt/coturn/credential` (0640, legível pelo uid do container).

Verificado de fora da rede: STUN Binding responde com o IP público correto, e um `Allocate`
autenticado retorna relay — ou seja, o relay funciona de ponta a ponta e **exige autenticação**
(não é relay aberto).

Cuidados registrados:

- `listening-ip`/`relay-ip` fixados em `72.62.138.208`. Sem isso o coturn liga também nas
  bridges Docker e anuncia candidatos de relay `172.16.x.x`, inúteis para o cliente.
- O arquivo de config **precisa ser legível pelo uid do container** (`nobody`, 65534). Em
  `0600` de root o coturn sobe silenciosamente com a configuração default — sem credencial e
  sem os bloqueios de rede privada.
- `denied-peer-ip` cobre todas as faixas privadas: sem isso o relay público viraria porta de
  entrada para a rede interna da VPS.

> `turn-credentials` só anuncia o relay quando **`COTURN_PASS`** está configurado nos secrets
> da Supabase. Enquanto esse secret não for definido, o coturn está no ar mas não é usado.


**Traefik routing:** `/etc/easypanel/traefik/config/aloclinica-stack.yaml` — todas as rotas HTTPS via Let's Encrypt automático.

---

## CI/CD

3 workflows em `.github/workflows/`:
- `deploy.yml` — push em `main` → build → SCP `dist/` → docker compose up no VPS
- `test.yml` — lint + tsc + vitest + build + Playwright E2E
- `preserve-design-system.yml` — backup automático Lovable

**Secrets necessários:** `SUPABASE_ACCESS_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`, `VPS_SSH_PRIVATE_KEY`.

---

## Observabilidade

- **Sentry** — erros JS no browser (ativo em prod via `VITE_SENTRY_DSN`)
- **activity_logs** — auditoria de ações (admin lê via SQL ou painel)
- **Edge function logs** — Supabase dashboard
- **AdminSystemHealth** — checa CompreFace, MiroTalk, etc.

---

## Pontos de evolução conhecidos

Veja `RUNBOOK.md` para gaps operacionais e procedimentos.

Últimas mudanças relevantes (ver git log):
- Mercado Pago cobertura total (vault, recurring, refund) — PR #21
- KYC obrigatório (CFM 2.314/2022) — PR #19
- TURN próprio (coturn público) — PR #20
- Trigger `handle_new_user` cria role — PR #20
- Archive de `activity_logs` >90 dias — esta PR
