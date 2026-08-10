/**
 * Catálogo de secrets e flags de runtime da plataforma — FONTE ÚNICA.
 *
 * Consumido por dois lados:
 *   - `admin-secret-manager` (Deno): resolve presença/estado e grava secrets;
 *   - `AdminMaintenanceCenter` (browser): usa como fallback de exibição enquanto
 *     a Edge Function não estiver publicada.
 *
 * Antes existiam duas listas paralelas — uma em cada lado — que já divergiam na
 * descrição e iam divergir em conteúdo: uma chave adicionada só no servidor não
 * aparecia na tela, e uma adicionada só no cliente ficava presa em "N/D",
 * indistinguível de "função não publicada".
 *
 * IMPORTANTE: este arquivo entra no bundle do navegador. Mantenha-o como DADOS
 * PUROS — sem imports, sem APIs do Deno, e obviamente sem nenhum valor de
 * secret. Só metadados descritivos (nome da variável, rótulo, grupo, descrição).
 */

export type SecretDefinition = {
  key: string;
  label: string;
  group: string;
  /** true = a plataforma não opera sem ela; o painel destaca como falha. */
  required: boolean;
  description: string;
  /** false = deve ser configurada manualmente e nunca pelo painel. */
  editable?: boolean;
};

export type RuntimeFlagDefinition = {
  key: string;
  label: string;
  /** danger = jamais deve estar ligada em produção. */
  severity: "danger" | "warning";
  description: string;
};

export const SECRET_DEFINITIONS: SecretDefinition[] = [
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase Service Role", group: "Base", required: true, editable: false, description: "Acesso servidor às operações protegidas do banco. Gerenciada pelo Supabase; configure fora deste painel." },
  { key: "SUPABASE_ANON_KEY", label: "Supabase Anon", group: "Base", required: true, editable: false, description: "Chave pública usada pelas Edge Functions para validar sessões. Gerenciada pelo Supabase; configure fora deste painel." },
  { key: "INTERNAL_FUNCTION_SECRET", label: "Internal Function Secret", group: "Base", required: true, editable: false, description: "Autentica chamadas internas disparadas por triggers e jobs. A rotação precisa coincidir com o segredo configurado no banco." },
  { key: "PROJECT_SECRETS_MANAGEMENT_TOKEN", label: "Project Secrets Management Token", group: "Administração e jobs", required: false, editable: false, description: "Token fine-grained usado pelo painel para gravar secrets. Configure manualmente uma vez; nunca substitua pelo próprio painel." },
  { key: "ADMIN_BOOTSTRAP_SECRET", label: "Admin Bootstrap Secret", group: "Administração e jobs", required: false, editable: true, description: "Protege a criação inicial de conta administrativa." },
  { key: "ADMIN_BOOTSTRAP_EMAIL", label: "Admin Bootstrap Email", group: "Administração e jobs", required: false, editable: true, description: "E-mail da conta criada no bootstrap. create-admin-account exige os três itens do bootstrap." },
  { key: "ADMIN_BOOTSTRAP_PASSWORD", label: "Admin Bootstrap Password", group: "Administração e jobs", required: false, editable: true, description: "Senha temporária usada apenas no bootstrap do admin." },
  { key: "AUTO_PAYOUT_TICK_SECRET", label: "Auto Payout Cron", group: "Administração e jobs", required: false, editable: false, description: "Autoriza jobs de repasse e lembretes protegidos. Rotacione também o segredo do cron/Vault que envia x-tick-secret." },
  { key: "SEED_SECRET", label: "Seed Secret", group: "Administração e jobs", required: false, editable: true, description: "Protege seeds de teste; nunca habilitar em produção." },
  { key: "BREVO_API_KEY", label: "Brevo", group: "Comunicação", required: true, editable: true, description: "E-mail transacional da plataforma." },
  { key: "RESEND_API_KEY", label: "Resend (B2B)", group: "Comunicação", required: false, editable: true, description: "E-mail do formulário de leads B2B (b2b-lead-notification)." },
  { key: "VAPID_PRIVATE_KEY", label: "Web Push VAPID", group: "Comunicação", required: false, editable: true, description: "Chave privada para notificações push." },
  { key: "EMAIL_FROM_ADDRESS", label: "E-mail remetente", group: "Comunicação", required: false, editable: true, description: "Endereço usado nos e-mails transacionais." },
  { key: "EVOLUTION_API_URL", label: "Evolution API URL", group: "Comunicação", required: false, editable: true, description: "Endpoint HTTPS do gateway WhatsApp." },
  { key: "EVOLUTION_API_KEY", label: "Evolution API Key", group: "Comunicação", required: false, editable: true, description: "Chave do gateway WhatsApp; nunca é exibida." },
  { key: "MERCADOPAGO_ACCESS_TOKEN", label: "Mercado Pago Access Token", group: "Pagamentos", required: true, editable: true, description: "Cobranças e reconciliação do Mercado Pago." },
  { key: "MERCADOPAGO_WEBHOOK_SECRET", label: "Mercado Pago Webhook", group: "Pagamentos", required: true, editable: true, description: "Assinatura que valida callbacks de pagamento." },
  { key: "MERCADOPAGO_APP_ID", label: "Mercado Pago App ID", group: "Pagamentos", required: false, editable: true, description: "Aplicação usada no OAuth de contas conectadas." },
  { key: "MERCADOPAGO_CLIENT_SECRET", label: "Mercado Pago Client Secret", group: "Pagamentos", required: false, editable: true, description: "Segredo OAuth do Mercado Pago." },
  { key: "PAGBANK_TOKEN", label: "PagBank", group: "Pagamentos", required: false, editable: true, description: "Integração alternativa de pagamentos." },
  { key: "PAGBANK_ACCOUNT_ID", label: "PagBank Account ID", group: "Pagamentos", required: false, editable: true, description: "Conta de destino para a integração PagBank." },
  { key: "METERED_APP_NAME", label: "Metered App", group: "Vídeo e infraestrutura", required: false, editable: true, description: "Identificação do provedor TURN." },
  { key: "METERED_SECRET_KEY", label: "Metered Secret", group: "Vídeo e infraestrutura", required: false, editable: true, description: "Credencial para gerar TURN temporário." },
  { key: "MIROTALK_URL", label: "MiroTalk URL", group: "Vídeo e infraestrutura", required: false, editable: true, description: "Servidor de videoconferência." },
  { key: "MIROTALK_API_KEY", label: "MiroTalk API Key", group: "Vídeo e infraestrutura", required: false, editable: true, description: "Credencial para tokens das salas." },
  { key: "COTURN_PASS", label: "Coturn Password", group: "Vídeo e infraestrutura", required: false, editable: true, description: "Senha do servidor TURN próprio." },
  { key: "COMPREFACE_URL", label: "CompreFace URL", group: "KYC e documentos", required: false, editable: true, description: "Endpoint do serviço de reconhecimento facial." },
  { key: "COMPREFACE_VERIFY_KEY", label: "CompreFace Verify", group: "KYC e documentos", required: false, editable: true, description: "Chave para verificação facial." },
  { key: "COMPREFACE_DETECT_KEY", label: "CompreFace Detect", group: "KYC e documentos", required: false, editable: true, description: "Chave para detecção facial." },
  { key: "COMPREFACE_API_KEY", label: "CompreFace Legacy Key", group: "KYC e documentos", required: false, editable: true, description: "Chave legada usada como fallback do CompreFace." },
  { key: "ANTISPOOF_API_KEY", label: "Antispoof API Key", group: "KYC e documentos", required: false, editable: true, description: "Credencial opcional do provedor anti-spoofing." },
  { key: "INFOSIMPLES_TOKEN", label: "InfoSimples", group: "KYC e documentos", required: false, editable: true, description: "Consulta de situação cadastral profissional." },
  { key: "CONSULTA_CRM_API_KEY", label: "Consulta CRM", group: "KYC e documentos", required: false, editable: true, description: "API auxiliar para validação de CRM." },
  { key: "DOCUSEAL_BASE", label: "DocuSeal URL", group: "KYC e documentos", required: false, editable: true, description: "Endpoint de assinatura e documentos." },
  { key: "DOCUSEAL_API_KEY", label: "DocuSeal API Key", group: "KYC e documentos", required: false, editable: true, description: "Credencial do DocuSeal." },
  // Não é `required` porque a integração DocuSeal inteira é opcional — mas se
  // DOCUSEAL_BASE estiver preenchida, esta passa a ser obrigatória na prática:
  // docuseal-webhook roda com verify_jwt=false e é autenticado SÓ por ela.
  { key: "DOCUSEAL_WEBHOOK_SECRET", label: "DocuSeal Webhook", group: "KYC e documentos", required: false, editable: true, description: "Autentica os callbacks do DocuSeal. Obrigatória sempre que DOCUSEAL_BASE estiver configurada — sem ela o webhook fica sem autenticação." },
  { key: "FOCUS_NFE_TOKEN", label: "Focus NFe", group: "Fiscal", required: false, editable: true, description: "Emissão e consulta de notas fiscais." },
  { key: "VIDAAS_CLIENT_ID", label: "VIDAAS Client ID", group: "Assinatura digital", required: false, editable: true, description: "Cliente OAuth para assinatura digital." },
  { key: "VIDAAS_CLIENT_SECRET", label: "VIDAAS Client Secret", group: "Assinatura digital", required: false, editable: true, description: "Segredo OAuth para assinatura digital." },
  { key: "MEMED_API_KEY", label: "Memed API Key", group: "Assinatura digital", required: false, editable: true, description: "Integração de prescrição digital." },
  { key: "MEMED_SECRET_KEY", label: "Memed Secret", group: "Assinatura digital", required: false, editable: true, description: "Segredo da integração Memed." },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic", group: "IA", required: false, editable: true, description: "Recursos de IA clínica e assistiva." },
  { key: "LOVABLE_API_KEY", label: "Lovable AI", group: "IA", required: false, editable: true, description: "Recursos de IA auxiliares." },
  { key: "SEND_EMAIL_HOOK_SECRET", label: "Auth Email Hook", group: "Segurança", required: false, editable: false, description: "Valida o hook de e-mail do GoTrue. Configure e rotacione junto à configuração do Auth Hook, fora deste painel." },
];

/**
 * Flags que MUDAM O COMPORTAMENTO DE SEGURANÇA quando ligadas. São booleanos de
 * configuração, não segredos — exibi-las não cria exposição, e deixar uma delas
 * ligada em produção é o risco operacional mais provável nesta plataforma.
 */
export const RUNTIME_FLAGS: RuntimeFlagDefinition[] = [
  { key: "ALLOW_INSECURE_EVOLUTION_HTTP", label: "Evolution HTTP inseguro", severity: "danger", description: "Permite WhatsApp sem TLS; nunca habilitar em produção." },
  { key: "ALLOW_TEST_SEED", label: "Seeds de teste", severity: "danger", description: "Permite endpoints de criação de dados de teste." },
  { key: "ALLOW_DEV_EMAIL_STUB", label: "Stub de e-mail", severity: "warning", description: "Finge entrega de e-mail sem provedor configurado." },
  { key: "ALLOW_DEV_WHATSAPP_STUB", label: "Stub de WhatsApp", severity: "warning", description: "Finge entrega de WhatsApp sem Evolution configurada." },
];
