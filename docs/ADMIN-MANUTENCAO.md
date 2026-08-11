# Centro de manutenção do administrador

O painel fica em `/dashboard/admin/maintenance?role=admin` e reúne o diagnóstico operacional da AloClínica:

- saúde do banco, WhatsApp/Evolution, e-mail, vídeo, pagamentos, KYC e NFS-e;
- inventário de variáveis configuradas, sem exibir valores, tamanho, prefixo ou hash;
- atalhos para modo de manutenção, segurança, logs, compliance e secrets do Supabase;
- configuração de uma ou várias chaves diretamente na tela, com envio server-side e limpeza do formulário;
- comandos seguros de configuração com placeholders para copiar e executar localmente.

## Configuração de chaves

As chaves de servidor devem ser cadastradas em **Supabase → Project Settings → Edge Functions → Secrets** ou pela CLI:

```bash
supabase secrets set BREVO_API_KEY="valor-real"
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="valor-real" MERCADOPAGO_WEBHOOK_SECRET="valor-real"
```

Após publicar o frontend e configurar manualmente o token de gerenciamento, publique a função administrativa:

```bash
supabase functions deploy admin-secret-manager --project-ref <project-ref>
```

O painel chama uma função protegida: `admin-secret-manager` retorna `configured: true/false` e flags de runtime quando recebe `action: status`, ou recebe somente os valores digitados, valida uma lista permitida e grava os secrets nativos do projeto pela Management API do Supabase. Nenhum valor de secret retorna ao frontend. O manager registra em `activity_logs` o administrador, os nomes alterados e a quantidade — nunca os valores.

A autorização real é feita no código com JWT válido e `getCaller` + `isAdmin`; `verify_jwt` sozinho não substitui autorização. Antes do primeiro uso, crie um token fine-grained no Supabase com apenas `edge_functions_secrets_write` e configure manualmente o secret `PROJECT_SECRETS_MANAGEMENT_TOKEN`. Esse token é propositalmente bloqueado no formulário. Depois de salvar chaves, publique as funções que dependem delas e use **Atualizar diagnóstico**.

O formulário só permite chaves com `editable: true` no catálogo. Chaves gerenciadas pelo Supabase ou sincronizadas com outra superfície (`SUPABASE_*`, `INTERNAL_FUNCTION_SECRET`, `AUTO_PAYOUT_TICK_SECRET` e `SEND_EMAIL_HOOK_SECRET`) permanecem bloqueadas e devem ser rotacionadas manualmente nos dois lados correspondentes.

Não coloque tokens em `VITE_*`, tabelas públicas, commits, tickets ou mensagens. `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_MERCADOPAGO_PUBLIC_KEY` são configurações públicas; access tokens, webhook secrets e credenciais de provedores são exclusivamente server-side.

## Inventário: fonte única

As chaves e as flags exibidas vêm de `supabase/functions/_shared/secret-catalog.ts`, importado tanto pela Edge Function quanto pelo painel. Ao adicionar uma integração, edite **apenas esse arquivo**.

Antes havia duas listas paralelas, uma de cada lado: chave adicionada só no servidor não aparecia na tela, e chave adicionada só no cliente ficava presa em `N/D`, indistinguível de "função não publicada".

O módulo entra no bundle do navegador — mantenha-o como **dados puros** (nome da variável, rótulo, grupo, descrição), sem imports, sem APIs do Deno e obviamente sem nenhum valor.

## Flags de risco

Além das chaves, o painel mostra flags que mudam o comportamento de segurança quando ligadas:

| Flag | Efeito quando `true` |
|---|---|
| `ALLOW_INSECURE_EVOLUTION_HTTP` | WhatsApp volta a aceitar HTTP — mensagens com dado clínico em texto claro |
| `ALLOW_TEST_SEED` | Libera os endpoints de criação de dados de teste |
| `ALLOW_DEV_EMAIL_STUB` | `send-email` responde sucesso sem enviar nada |
| `ALLOW_DEV_WHATSAPP_STUB` | `send-whatsapp` responde sucesso sem enviar nada |

São booleanos de configuração, não segredos — por isso o painel pode exibi-los. **Nenhuma deve estar `true` em produção**: as duas primeiras desligam proteções; as duas últimas fazem a plataforma *fingir* que entregou uma notificação que nunca saiu, o que é pior que uma falha visível.

## Dependência condicional conhecida

`DOCUSEAL_WEBHOOK_SECRET` aparece como opcional porque a integração DocuSeal inteira é opcional. Mas se `DOCUSEAL_BASE` estiver configurada, ela passa a ser **obrigatória na prática**: `docuseal-webhook` roda com `verify_jwt = false` e é autenticado exclusivamente por esse header. O painel não modela essa condicional — confira manualmente ao ativar o DocuSeal.

## Pré-requisitos externos

Antes de usar a tela em produção:

1. publicar `admin-secret-manager` mantendo a verificação JWT habilitada (não adicionar `verify_jwt = false`);
2. confirmar que o usuário possui o papel administrativo no banco;
3. criar o token fine-grained e configurar manualmente `PROJECT_SECRETS_MANAGEMENT_TOKEN`;
4. configurar os secrets necessários ao fluxo contratado;
5. corrigir certificados TLS do Evolution e MiroTalk quando o diagnóstico apontar falha;
6. aplicar migrations somente após backup e revisão do estado real do banco.

Sem a Edge Function publicada, a tela permanece funcional para saúde básica, mas marca o inventário de secrets como `N/D` por segurança.

## Backup e modo de manutenção

O Centro de manutenção mostra o último `daily_backup_run` e permite executar um backup manual. A função exige JWT de administrador para uso pelo painel ou `INTERNAL_FUNCTION_SECRET` para chamadas internas agendadas. O backup só é marcado como concluído depois que todas as tabelas e arquivos forem gravados no bucket privado `backups`; falhas ficam registradas como `daily_backup_failed`.

O modo de manutenção é global. Com `block_users` desligado, aparece apenas um aviso dispensável. Com `block_users` ligado, usuários comuns recebem um bloqueio de tela e administradores continuam com acesso para desligar a manutenção. O scheduler do backup depende de `INTERNAL_FUNCTION_SECRET` configurado também no banco conforme a migration de chamadas internas.

## Feature Flags

O menu **Feature Flags** permite criar controles de recurso, ativar/desativar, fazer rollout percentual estável e criar regras por papel ou usuário. A avaliação é server-side por `get_feature_flags()`, e toda mudança pede motivo e entra no histórico de auditoria. A migration `20260810120000_feature_flags.sql` precisa ser aplicada no banco antes de usar a tela.
