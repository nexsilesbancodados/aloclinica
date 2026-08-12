#!/usr/bin/env bash
# =============================================================================
# AloClínica — Script de configuração de produção
# Execute: bash setup-production.sh
# =============================================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

PROJECT_REF="pwxvvimdtmvziynbspgx"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   AloClínica — Setup de Produção              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# ─── Pre-flight checks ────────────────────────────────────────────────────────
info "Verificando pré-requisitos..."

command -v supabase >/dev/null 2>&1 || { error "supabase CLI não encontrado. Instale: https://supabase.com/docs/guides/cli"; exit 1; }
command -v gh >/dev/null 2>&1      || warn "gh (GitHub CLI) não encontrado — secrets do GitHub não serão configurados"

# ─── Check supabase login ─────────────────────────────────────────────────────
info "Verificando login no Supabase..."
supabase projects list >/dev/null 2>&1 || { error "Faça login primeiro: supabase login"; exit 1; }
success "Supabase CLI autenticado"

# ─── Collect required values ─────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}━━━ Configuração dos Serviços Externos ━━━━━━━━━━━━━━━${NC}"
echo ""

prompt() {
  local var_name="$1"; local prompt_text="$2"; local default="$3"
  if [ -n "$default" ]; then
    read -rp "$(echo -e "${GREEN}${prompt_text}${NC} [${default}]: ")" val
    printf -v "$var_name" '%s' "${val:-$default}"
  else
    read -rp "$(echo -e "${GREEN}${prompt_text}${NC}: ")" val
    while [ -z "$val" ]; do
      warn "Valor obrigatório."
      read -rp "$(echo -e "${GREEN}${prompt_text}${NC}: ")" val
    done
    printf -v "$var_name" '%s' "$val"
  fi
}

# Secrets are never echoed while this interactive setup collects them.
prompt_secret() {
  local var_name="$1"; local prompt_text="$2"
  read -rsp "$(echo -e "${GREEN}${prompt_text}${NC}: ")" val
  echo ""
  while [ -z "$val" ]; do
    warn "Valor obrigatÃ³rio."
    read -rsp "$(echo -e "${GREEN}${prompt_text}${NC}: ")" val
    echo ""
  done
  printf -v "$var_name" '%s' "$val"
}

prompt_secret_optional() {
  local var_name="$1"; local prompt_text="$2"
  read -rsp "$(echo -e "${GREEN}${prompt_text}${NC}: ")" val
  echo ""
  printf -v "$var_name" '%s' "$val"
}

prompt_optional() {
  local var_name="$1"; local prompt_text="$2"
  read -rp "$(echo -e "${GREEN}${prompt_text}${NC}: ")" val
  printf -v "$var_name" '%s' "$val"
}

# Email (Resend)
echo -e "\n${BLUE}📧 Email — Resend.com (https://resend.com)${NC}"
prompt_secret BREVO_API_KEY   "BREVO_API_KEY"
prompt_secret_optional RESEND_API_KEY "RESEND_API_KEY (opcional, leads B2B)"
prompt EMAIL_FROM_ADDRESS     "EMAIL_FROM_ADDRESS (ex: noreply@aloclinica.com.br)" "noreply@aloclinica.com.br"
prompt EMAIL_FROM_NAME        "EMAIL_FROM_NAME" "AloClínica"
prompt SITE_DOMAIN            "SITE_DOMAIN (sem https://)" "aloclinica.com.br"
SITE_URL="https://${SITE_DOMAIN}"

# Payments (Mercado Pago)
echo -e "\n${BLUE}💳 Pagamentos — Mercado Pago (https://www.mercadopago.com.br/developers)${NC}"
prompt_secret MERCADOPAGO_ACCESS_TOKEN "MERCADOPAGO_ACCESS_TOKEN"
prompt_secret MERCADOPAGO_WEBHOOK_SECRET "MERCADOPAGO_WEBHOOK_SECRET"
prompt_secret_optional MERCADOPAGO_APP_ID "MERCADOPAGO_APP_ID (opcional, marketplace OAuth)"
prompt_secret_optional MERCADOPAGO_CLIENT_SECRET "MERCADOPAGO_CLIENT_SECRET (opcional, marketplace OAuth)"
info "Mercado Pago usa MERCADOPAGO_WEBHOOK_SECRET configurado acima."
info "Configure a assinatura no painel do Mercado Pago, apontando para mercadopago-webhook."

# AI (optional)
echo -e "\n${BLUE}🤖 IA — Anthropic (opcional)${NC}"
prompt_secret_optional ANTHROPIC_API_KEY "ANTHROPIC_API_KEY (opcional)"

# WhatsApp (Evolution API)
echo -e "\n${BLUE}📱 WhatsApp — Evolution API${NC}"
prompt EVOLUTION_API_URL      "EVOLUTION_API_URL" "https://whatsapp.telemedicinaaloclinica.sbs"
prompt_secret EVOLUTION_API_KEY "EVOLUTION_API_KEY"

# Video (Metered.ca)
echo -e "\n${BLUE}🎥 Vídeo — Metered.ca (https://www.metered.ca)${NC}"
prompt_optional METERED_APP_NAME "METERED_APP_NAME (opcional)"
prompt_secret_optional METERED_SECRET_KEY "METERED_SECRET_KEY (opcional)"

# Push Notifications (VAPID)
echo -e "\n${BLUE}🔔 Push Notifications — VAPID${NC}"
info "Gerando par de chaves VAPID..."
if command -v node >/dev/null 2>&1; then
  VAPID_KEYS=$(node -e "
    const crypto = require('crypto');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pub = publicKey.export({ type: 'spki', format: 'der' });
    const priv = privateKey.export({ type: 'pkcs8', format: 'der' });
    console.log(pub.slice(27).toString('base64url') + '|' + priv.slice(36).toString('base64url'));
  " 2>/dev/null || echo "")
  if [ -n "$VAPID_KEYS" ]; then
    VAPID_PUBLIC_KEY="${VAPID_KEYS%%|*}"
    VAPID_PRIVATE_KEY="${VAPID_KEYS##*|}"
    info "VAPID_PUBLIC_KEY (para frontend): ${VAPID_PUBLIC_KEY}"
    info "VAPID_PRIVATE_KEY (para Supabase secret): gerado"
  else
    warn "Não foi possível gerar VAPID keys automaticamente"
    prompt VAPID_PRIVATE_KEY "VAPID_PRIVATE_KEY (gere em: https://web-push-codelab.glitch.me)"
  fi
else
  warn "Node.js não encontrado — VAPID keys não geradas"
  prompt VAPID_PRIVATE_KEY "VAPID_PRIVATE_KEY"
fi

# DocuSeal
echo -e "\n${BLUE}📄 Assinaturas Digitais — DocuSeal${NC}"
prompt_secret_optional DOCUSEAL_API_KEY "DOCUSEAL_API_KEY (opcional)"

# Optional
echo -e "\n${BLUE}🔧 Serviços opcionais (pressione Enter para pular)${NC}"
prompt_secret_optional MEMED_API_KEY "MEMED_API_KEY (opcional)"
prompt_secret_optional MEMED_SECRET_KEY "MEMED_SECRET_KEY (opcional)"

read -rp "$(echo -e "${GREEN}VITE_SENTRY_DSN (monitoramento)${NC} [pular]: ")" VITE_SENTRY_DSN

# ─── Apply Supabase Secrets ───────────────────────────────────────────────────
echo ""
info "Configurando secrets no Supabase..."

SECRETS_ARGS=(
  "BREVO_API_KEY=${BREVO_API_KEY}"
  "EMAIL_FROM_ADDRESS=${EMAIL_FROM_ADDRESS}"
  "EMAIL_FROM_NAME=${EMAIL_FROM_NAME}"
  "SITE_DOMAIN=${SITE_DOMAIN}"
  "SITE_URL=${SITE_URL}"
  "VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}"
)

[ -n "$RESEND_API_KEY" ]              && SECRETS_ARGS+=("RESEND_API_KEY=${RESEND_API_KEY}")
[ -n "$MERCADOPAGO_ACCESS_TOKEN" ]   && SECRETS_ARGS+=("MERCADOPAGO_ACCESS_TOKEN=${MERCADOPAGO_ACCESS_TOKEN}")
[ -n "$MERCADOPAGO_WEBHOOK_SECRET" ] && SECRETS_ARGS+=("MERCADOPAGO_WEBHOOK_SECRET=${MERCADOPAGO_WEBHOOK_SECRET}")
[ -n "$MERCADOPAGO_APP_ID" ]         && SECRETS_ARGS+=("MERCADOPAGO_APP_ID=${MERCADOPAGO_APP_ID}")
[ -n "$MERCADOPAGO_CLIENT_SECRET" ]  && SECRETS_ARGS+=("MERCADOPAGO_CLIENT_SECRET=${MERCADOPAGO_CLIENT_SECRET}")
[ -n "$ANTHROPIC_API_KEY" ]          && SECRETS_ARGS+=("ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}")
[ -n "$EVOLUTION_API_URL" ]          && SECRETS_ARGS+=("EVOLUTION_API_URL=${EVOLUTION_API_URL}")
[ -n "$EVOLUTION_API_KEY" ]          && SECRETS_ARGS+=("EVOLUTION_API_KEY=${EVOLUTION_API_KEY}")
[ -n "$METERED_APP_NAME" ]           && SECRETS_ARGS+=("METERED_APP_NAME=${METERED_APP_NAME}")
[ -n "$METERED_SECRET_KEY" ]         && SECRETS_ARGS+=("METERED_SECRET_KEY=${METERED_SECRET_KEY}")

[ -n "$DOCUSEAL_API_KEY"    ] && SECRETS_ARGS+=("DOCUSEAL_API_KEY=${DOCUSEAL_API_KEY}")
[ -n "$MEMED_API_KEY"       ] && SECRETS_ARGS+=("MEMED_API_KEY=${MEMED_API_KEY}")
[ -n "$MEMED_SECRET_KEY"    ] && SECRETS_ARGS+=("MEMED_SECRET_KEY=${MEMED_SECRET_KEY}")


supabase secrets set --project-ref "${PROJECT_REF}" "${SECRETS_ARGS[@]}" && success "Secrets configurados no Supabase" || error "Falha ao configurar secrets"

# ─── Apply DB Migrations ──────────────────────────────────────────────────────
echo ""
info "Aplicando migrations pendentes..."
supabase db push --project-ref "${PROJECT_REF}" && success "Migrations aplicadas" || warn "Verifique as migrations manualmente"

# ─── Deploy Edge Functions ────────────────────────────────────────────────────
echo ""
info "Fazendo deploy de todas as edge functions conforme supabase/config.toml..."
supabase functions deploy --project-ref "${PROJECT_REF}" 2>&1 | tail -5
success "Edge functions deployadas"

# ─── GitHub Secrets ───────────────────────────────────────────────────────────
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo ""
  info "Configurando secrets no GitHub Actions..."

  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
  if [ -n "$REPO" ]; then
    SUPABASE_URL=$(supabase projects show --project-ref "${PROJECT_REF}" --json 2>/dev/null | grep '"api_url"' | sed 's/.*"api_url": *"\([^"]*\)".*/\1/' || echo "https://${PROJECT_REF}.supabase.co")
    SUPABASE_ANON_KEY=$(supabase projects api-keys --project-ref "${PROJECT_REF}" --json 2>/dev/null | python3 -c "import sys,json; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k['name']=='anon'))" 2>/dev/null || echo "")

    gh secret set VITE_SUPABASE_URL            --repo "${REPO}" --body "${SUPABASE_URL}"         2>/dev/null && info "✓ VITE_SUPABASE_URL"
    gh secret set VITE_SUPABASE_PUBLISHABLE_KEY --repo "${REPO}" --body "${SUPABASE_ANON_KEY}"   2>/dev/null && info "✓ VITE_SUPABASE_PUBLISHABLE_KEY"
    [ -n "$VITE_SENTRY_DSN" ] && gh secret set VITE_SENTRY_DSN --repo "${REPO}" --body "${VITE_SENTRY_DSN}" 2>/dev/null && info "✓ VITE_SENTRY_DSN"

    echo ""
    warn "IMPORTANTE: Adicione manualmente o secret VPS_SSH_PRIVATE_KEY no GitHub:"
    warn "  gh secret set VPS_SSH_PRIVATE_KEY --repo ${REPO} < ~/.ssh/id_rsa"
    warn "  (ou cole a chave privada do servidor VPS)"
  else
    warn "Não foi possível detectar o repositório GitHub. Configure os secrets manualmente."
  fi
fi

# ─── Asaas Webhook URL ────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}━━━ Configure este webhook no Mercado Pago ━━━━━━━━━━${NC}"
echo ""
echo -e "URL:   ${GREEN}https://${PROJECT_REF}.supabase.co/functions/v1/mercadopago-webhook${NC}"
echo -e "Use MERCADOPAGO_WEBHOOK_SECRET para validar a assinatura HMAC no painel Mercado Pago."
echo -e "Eventos: payment, subscription_preapproval, subscription_authorized_payment"
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────────
echo -e "${GREEN}━━━ Setup Concluído! ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Próximos passos:"
echo "  1. Configure o webhook no Mercado Pago (URL acima e assinatura HMAC)"
echo "  2. Adicione VPS_SSH_PRIVATE_KEY no GitHub"
echo "  3. Faça push para main para acionar o deploy automático"
echo "  4. Verifique os logs: supabase functions logs appointment-reminders"
echo ""
echo "  supabase db pull --project-ref ${PROJECT_REF}  (sincronizar schema local)"
echo ""
