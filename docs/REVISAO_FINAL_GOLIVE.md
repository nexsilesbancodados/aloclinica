# ✅ Revisão Final — Prontidão para Go-Live (Telemedicina AloClínica)

**Data:** 2026-07-18 · Consolida todas as auditorias + o que os PRs de correção fecharam + o que falta.

> Análise técnica de engenharia. Os pontos de CFM/assinatura/retenção exigem validação jurídica e do Diretor Técnico Médico.

## Veredito

🟡 **Quase lá no código; bloqueado por ações de infra suas.** As correções de código fecham a maioria dos vetores críticos exploráveis por anônimo. Restam: **1 item CRÍTICO de código deliberadamente adiado** (adulteração de valor de pagamento) e **os bloqueadores de infraestrutura**, que só você executa. **Não liberar antes de concluir o checklist abaixo.**

---

## O que os 3 PRs de segurança fecharam

### PR #1 — `security-hardening-audit`
- 🔴 Auto-promoção a admin no signup → `handle_new_user` não confia mais no role do cliente
- 🔴 IDOR financeiro (`fn_get_cartao_summary`) → exige dono/admin
- 🔴 Assinatura falsa "ICP-Brasil" → rótulo honesto + `is_signed:false`
- 🔴 Chaves KYC hardcoded → env
- 🔴 Cadastro público de `support` → removido
- 🟠 `search_path` em todas as funções SECURITY DEFINER; CI com gate de qualidade

### PR #2 — `security-endpoints-hardening`
- 🔴 7 endpoints de cron/backup públicos (dump de PII, mailers em massa) → fail-closed

### PR #3 — `security-hardening-round2`
- 🟠 Rate-limit fail-closed + cap de input nas 7 funções de IA
- 🟠 IDOR nos geradores de PDF (receita/atestado/oftalmo) → médico dono/serviço
- 🟠 Funções "efetivamente públicas" (`whatsapp-notify/qr`, `compreface/docuseal-proxy`, `metered-room`, `sweepstake`) → fechadas
- 🟠 `register-signature` sem spoofing de identidade médica
- 🟠 `mp-oauth-callback` hardening do state
- 🟠 Imutabilidade clínica: DELETE bloqueado em 12 tabelas (RESTRICTIVE)
- **Verificação adversarial** rodou e pegou 2 regressões antes do merge (lembretes WhatsApp e checkout de dependente) — ambas corrigidas/revertidas no próprio PR.

---

## 🔴 Ainda ABERTO no código (1 crítico)

| Item | Status | Nota |
|---|---|---|
| **Adulteração de VALOR do pagamento** (`amount` vem do cliente em `mercadopago-create-payment`/`charge-saved-card`) | **Adiado** | Corrigir exige gravar/validar o preço autoritativo no servidor **e** tratar o fluxo "titular paga por dependente" — precisa de teste real. É um **PR dedicado**, não um ajuste cego. Enquanto não fechar, um usuário pode subcobrar a própria consulta. |

## 🚧 Bloqueadores de INFRA (só você) — antes do go-live

1. **Aplicar as migrações** dos PRs (`20260718120000_security_hardening_audit`, `20260718130000_clinical_immutability`).
2. **Auditar `user_roles`** e revogar admins/support criados por signup (query no fim da migração de hardening).
3. **Rotacionar as chaves vazadas** (CompreFace/KYC e revisar histórico) e configurar como secrets.
4. **Definir `INTERNAL_FUNCTION_SECRET`** e garantir que os crons enviam `x-internal-secret` (senão backup/lembretes/tarefas dão 403 — comportamento seguro).
5. **Buckets de documentos privados** + `createSignedUrl`; TLS nos serviços `http://72.62.138.208:*`.
6. **Backup real** (PITR/offsite), **pooling (PgBouncer)** e **CDN** — ver [escalabilidade](ESCALABILIDADE_100K_USUARIOS.md).
7. **Corrigir/remover `setup-production.sh`** (projeto e stack errados).

## 📱 App mobile

Fundação de conexão ao Supabase entregue (patch em `docs/mobile/`). Hoje era protótipo mock; agora tem cliente/auth reais. Falta: instalar deps, validar login, conectar as ~35 telas (iterativo). Ver `INTEGRACAO_MOBILE_SUPABASE.md` no repo mobile / patch.

---

## Ordem recomendada de go-live

```
1. Merge PR #1, #2, #3  →  2. Aplicar migrações  →  3. Auditar user_roles / rotacionar chaves
   →  4. Setar INTERNAL_FUNCTION_SECRET  →  5. Buckets privados + TLS
   →  6. PR do valor de pagamento (código + teste)  →  7. Pooling/CDN/backup
   →  8. Load test  →  9. Smoke test (SMOKE_TEST.md)  →  GO-LIVE
```

## Riscos residuais aceitos (documentados)
- Imutabilidade clínica cobre DELETE, não UPDATE de conteúdo pós-lançamento (trigger BEFORE UPDATE fica como follow-up) nem DELETE por CASCADE (só admin/service).
- Verificação pública de documentos por código expõe nome/CRM (padrão intencional; recomenda-se rate-limit).
- Retenção CFM de 20 anos exige processo de arquivamento a definir.
