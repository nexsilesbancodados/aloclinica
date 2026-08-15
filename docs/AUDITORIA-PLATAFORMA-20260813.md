# Auditoria completa da plataforma — AloClínica

**Data:** 2026-08-13 · **Método:** 5 auditores por domínio (identidade, agenda, atendimento, operação/estados/segurança, financeiro) em contexto isolado, **mais verificação direta contra o banco de produção** dos achados mais graves. **Nenhum arquivo de produção foi alterado nesta auditoria.**

> **Regra de leitura.** Cada achado abaixo tem um selo de confiança:
> - ✅ **VERIFICADO** — testado contra o banco de produção ou reproduzido no código; é fato.
> - 🔍 **CÓDIGO** — lido diretamente no fonte, não executado; alta confiança.
> - ⚠️ **REBAIXADO** — um auditor reportou como P0, a verificação mostrou que é menos grave ou falso; a nota explica.
> - 🚫 **NÃO EXECUTADO** — exploit plausível pelo código, mas não disparado por ser escrita destrutiva em produção.

---

## A causa raiz que explica metade dos P0

Em 2026-04-15, a migration `20260415020135` **reconstruiu o schema inteiro do zero** (`CREATE TABLE` sem `IF NOT EXISTS`, sem `DROP` anterior). O banco de produção segue essa versão. Mas **~40 migrations anteriores e boa parte do frontend foram escritos contra o schema antigo**, com nomes de coluna, tabelas e rótulos de enum diferentes.

O resultado é uma classe de bug que se repete por toda parte: o código consulta/grava um nome que não existe mais, o PostgREST rejeita a operação inteira, e como quase nenhum `error` é verificado, **falha em silêncio** — tela vazia, salvamento que não salva, sem erro visível.

Já corrigi uma instância disto nesta sessão (`price`/`consultation_price`, 20 pontos). Os auditores encontraram a mesma classe em **dezenas** de outros lugares. Por isso a recomendação de processo nº 1: **rodar as migrations contra um Postgres limpo no CI** pegaria a maioria automaticamente.

---

## Achados verificados contra o banco (fatos, não hipóteses)

### ✅ P0 — A primeira consulta de qualquer paciente falha no agendamento
`BookAppointment.tsx:485` grava `doctor_type` como `appointment_type` quando é primeira consulta. `doctor_type` tem default `'telemedicina'` (quase todo médico). Mas o enum `appointment_type` só aceita `first_visit | return | urgency`.

**Teste real contra produção:**
```
PATCH .../appointments?appointment_type=eq.telemedicina
→ 400  22P02  invalid input value for enum appointment_type: "telemedicina"
```
Confirmado por três vias: código, enum do `types.ts`, e resposta do banco. Também afeta `DoctorOnDutyPanel.tsx:77` (`urgent_care`, também fora do enum → plantão quebrado).
**Correção:** `BookAppointment.tsx:485` usar `appointmentType` sempre; `DoctorOnDutyPanel.tsx:77` → `"urgency"`. Uma linha cada. **É o funil principal de receita.**

### ✅ P0 — Cancelar consulta pela tela de detalhe falha 100% das vezes
`AppointmentDetail.tsx:125` grava `cancelled_at`. Verificado: a tabela `appointments` tem `cancel_reason` e `cancellation_reason`, **não tem `cancelled_at`**. O `as any` na linha desliga o TypeScript; o banco rejeita com `PGRST204`. O paciente que tenta cancelar não consegue, e vira `no_show` com multa de 50%.
**Correção:** remover `cancelled_at` da linha 125.

### ✅ P0 — Escalada de privilégio: qualquer visitante vira "suporte"
A rota pública `/suporte/cadastro` (`App.tsx:182`) faz `signUp({ role: "support" })`; o trigger de signup aceita `support` na whitelist (`20260811120000:39`); e `assign-role:52` só bloqueia atribuir papel a **outro** usuário. O papel `support` dá acesso a `profiles`, `support_tickets` e `document_verifications` de todos.
**Correção:** remover a rota/tela de auto-cadastro de suporte; reduzir `validRoles` de `assign-role` a `["patient"]` para não-admin.

### ✅ P0 — Edge functions clínicas sem autenticação nenhuma
`generate-certificate-pdf` e `generate-prescription-pdf` são `Deno.serve → req.json() → service_role`, sem `getCaller`, sem checagem de papel ou posse. O conteúdo do atestado (`days_off`, `cid_code`, `reason`) vem do corpo. Qualquer um emite atestado/receita assinados sob CRM de um médico real, e a receita vai para URL pública com `is_signed:true`.
**Correção:** exigir JWT + verificação de posse (o médico do atendimento), como `send-prescription` já faz corretamente.

### ⚠️ REBAIXADO — "Vazamento de PHI em massa para a internet"
**Dois auditores** reportaram a policy `profiles USING (true)` como dump público de CPF. **Testei com a anon key** (a do bundle público):
```
cpf, phone, date_of_birth      → 401 permission denied
allergies, chronic_conditions  → 401 permission denied
tokens Mercado Pago dos médicos→ 401 permission denied
first_name, last_name          → 200 (só nome)
```
O `REVOKE ... FROM anon` **funciona**. Anônimo **não** vaza dado sensível. O risco real e não-testado é a `authenticated`: a policy permissiva + grant default poderiam deixar um **usuário logado** ler `profiles` de outros. Isso rebaixa de "catástrofe pública P0" para **P1 a confirmar com conta de teste**. Ainda deve ser corrigido (policy com `TO authenticated` e escopo por dono), mas não é a emergência que os relatórios pintaram.

### ⚠️ REBAIXADO — "Buckets públicos com receitas e exames"
Reportado como P0: `receitas-assinadas`, `laudos-assinados`, `exames` públicos. **Testei:** `receitas-assinadas` e `exames` retornam **"Bucket not found" (404)** — não existem em produção com esses nomes. A conclusão veio da migration, que diverge do banco. Não descarta que a assinatura de documento tenha outros problemas (ver domínio Atendimento), mas o vazamento por bucket público **não se confirma** para esses nomes. Precisa cruzar com os nomes de bucket reais antes de agir.

### ⚠️ REBAIXADO — "payment_transactions foi dropada"
Reportado como causa de reembolso morto e faturamento estimado. **Testei:** a tabela **existe** (HTTP 200, vazia). O que ocorreu foi o **código abandoná-la** — há comentários `// payment_transactions table was removed` em `BillingPortal.tsx:109` e `CancelRescheduleDialog.tsx:236` que são **falsos** quanto ao banco. Efeito prático semelhante (não há ledger em uso), mas a correção é **religar o webhook** para gravar na tabela existente, não recriá-la.

### ✅ P0 — Auto-crédito na carteira com saque via PIX real
A policy de INSERT em `wallet_transactions` (`20260321014030:22`) é:
```sql
CREATE POLICY "System can insert transactions" ON public.wallet_transactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
```
O nome diz "System", mas o `WITH CHECK` permite **qualquer usuário autenticado inserir uma linha de crédito para si mesmo**, sem validar `type` nem a origem do valor. Verificado: a tabela existe em produção (vazia). A validação de saldo do saque lê a mesma tabela forjável. A tabela irmã `pingo_card_transactions` recebeu o padrão correto (`20260515191606:29-35`); a carteira ficou de fora.
**Impacto:** um usuário se credita R$ 50.000 e saca via PIX real. É o achado de maior perda financeira potencial.
**Correção:** trocar o INSERT para `service_role` apenas; nenhum crédito de carteira deve vir do cliente.

### ✅ P0 — Valor do pagamento vem do navegador
`mercadopago-create-payment:91` usa `transaction_amount: Number(amount)` com `amount` vindo do corpo da requisição. O paciente paga R$ 0,01 e o repasse ao médico é calculado sobre `price_at_booking` cheio. O valor cobrado precisa ser resolvido **no servidor** a partir do agendamento, nunca aceito do cliente.

### 🔍 P0 — `guest-checkout` emite consulta confirmada sem cobrar
`guest-checkout:71-90`, com `verify_jwt=false`, cria consulta confirmada + token de acesso sem nenhuma cobrança. Precisa de gate de pagamento antes de confirmar.

### 🚫 NÃO EXECUTADO — Bypass de KYC
A policy de `kyc_verificacoes` permite o próprio usuário escrever `status='aprovado'`, e o gate (`KycRequiredGate.tsx:76`) lê exatamente esse valor. O exploit (um INSERT) é plausível pelo código, mas **não o disparei** — seria escrever registro de verificação de identidade no banco de produção. A leitura da policy é sólida; tratar como P0 a confirmar em staging.

---

## Síntese por domínio (dos 4 relatórios recebidos)

O 5º relatório (financeiro detalhado) ainda não retornou; o domínio de dinheiro abaixo vem do auditor de operação, que o cobriu parcialmente.

### Identidade e acesso
- 🔍 **P0** — Busca de médicos retorna vazio (6 colunas inexistentes no `select`, e o fallback repete o erro). A plataforma não lista nenhum médico.
- 🔍 **P0** — Fila de aprovação de médicos do admin sempre vazia (`AdminApprovals.tsx:78` seleciona `experience_years, education`). O admin não consegue aprovar ninguém.
- 🔍 **P0** — Dashboard do médico não carrega (`useDoctorDashboard.ts:15`, 3 colunas inexistentes). *(nota: já corrigi `price` nesse arquivo antes; o auditor achou 3 outras colunas que restaram)*
- 🔍 **P0** — Máquina de estados do cadastro do médico não existe: dois booleanos, sem "motivo de reprovação", sem "suspenso". Reprovar = `is_approved:false`, indistinguível de "não analisado".
- 🔍 **P0** — Dependentes: duas implementações (`dependents` quebrada e morta; `family_members` funcional mas isolada). Agendar para filho com conta é **bloqueado pelo RLS**; sem conta, a consulta e a receita saem no **CPF do responsável** — erro de identificação de paciente.
- 🔍 **P0** — "Excluir conta" não exclui nada e diz ao usuário que anonimizou (LGPD). O usuário loga normalmente depois.
- 🔍 **P0** — Bloqueio por tentativas de login é 100% `localStorage`; a tabela `failed_login_attempts` existe e ninguém escreve nela. Sem detecção de ataque de credenciais.
- 🔍 **P1** — Não existe "alterar senha" para usuário logado; duas telas de cadastro de paciente divergentes (senha 6 vs 8, idade 16 vs 18); sexo, endereço e contato de emergência nunca coletados.

### Atendimento clínico
- 🔍 **P0** — **O prontuário da teleconsulta não salva.** `useSOAPNotes` grava em `appointment_notes`, tabela inexistente. `PatientEMR` grava em `clinical_anamnesis`, inexistente — e exibe "Prontuário salvo com sucesso ✅" mesmo quando o insert falha. Não há registro clínico do atendimento em nenhuma tabela de produção.
- 🔍 **P0** — **A consulta é finalizada por queda de conexão.** `use-webrtc.ts:621-635` dispara `hang-up` no evento `pagehide`, que no celular ocorre ao **minimizar o app ou trocar de aba**. Isso propaga `status:"ended"` e grava `completed` no banco, dos dois lados. *(nota: isto contradiz o que eu havia verificado no turno anterior — eu confirmei que o `restartIce` existe e funciona; existe, mas o `pagehide→hang-up` é um caminho separado que realmente encerra. O auditor está certo e eu estava incompleto.)*
- 🔍 **P0** — A assinatura digital é **encenada**: `useDigitalSignature.ts:81` compara o CPF consigo mesmo e nunca falha; a UI afirma "ICP-Brasil / PAdES / e-CPF". Emitir documentos que **afirmam** ser ICP-Brasil sem ser é risco jurídico direto ao médico. VIDaaS existe implementado e **desligado**.
- 🔍 **P0** — Pré-consulta não salva (`severity` string vs coluna integer) e o formulário nem é apresentado (`deviceChecked` nasce `true`, o `PreCallCheck` é código morto). O médico entra sem nenhuma informação prévia.
- 🔍 **P0** — Pedido de exames: o insert usa 4 colunas inexistentes; não gera PDF, não assina, não entrega, não vincula ao atendimento.

### Operação, estados e segurança
- ✅ **P0** — **Não existe máquina de estados.** As policies de UPDATE de `appointments` não têm `WITH CHECK` nem restrição de coluna/status. `CANCELLED → IN_PROGRESS` é aceito pelo banco via REST — e reabrir uma consulta cancelada/reembolsada dispara repasse real ao médico.
- 🔍 **P0** — `confirmed` é invisível em 8 das 10 telas que listam consultas. A consulta reatribuída (médico ausente) nasce `confirmed` e **some para o paciente**.
- 🔍 **P0** — Paciente é cobrado 50% quando **o médico** falta (`scheduled-tasks:42-47` não olha quem faltou), e o tratamento de médico-ausente está morto (usa `available_now`/`rating`, colunas renomeadas).
- 🔍 **P0** — Dois ledgers de repasse (`wallet_transactions` 50% e `doctor_payouts` 80%) disparam na mesma transição, sem se conhecerem. Risco de repasse em duplicidade.
- 🔍 **P0** — Admin não tem **nenhum** caminho de escrita em `appointments`: cancelar, reatribuir, reembolsar, liberar consulta travada — tudo exige SQL manual em produção, sem auditoria.
- 🔍 **P0** — Sem auditoria de antes/depois em prontuário, pagamento, status ou permissão. Numa plataforma de saúde isso é LGPD Art. 37.
- 🔍 **P0** — Exclusão LGPD nunca é processada (nenhuma função lê `lgpd_deletion_requests`); log de acesso a PHI não acontece.
- 🔍 **P0/P1** — Duplicidade de notificação: no-show e carrinho abandonado notificam em loop (carrinho a cada 30 min "para sempre"); o lembrete de 1h nunca sai (booleano disputado com o de 24h); o médico não recebe "novo agendamento" (RLS derruba o insert em silêncio).

### Financeiro
- ✅ **P0** — Auto-crédito na carteira (acima). Maior perda potencial.
- ✅ **P0** — `amount` do pagamento vem do body (acima).
- 🔍 **P0** — `guest-checkout` confirma consulta sem cobrar.
- 🔍 **P0** — Pagamento antes da consulta **não é garantido no banco**: nenhuma constraint/trigger liga `status` a `payment_status`; `metered-room` (provisiona o vídeo) nem lê a coluna de pagamento; o único bloqueio é um `useState` que o `PreCallCheck` desarma sozinho ao gravar `waiting`.
- 🔍 **P0** — Saque não debita a carteira pelo caminho automático (o trigger de débito só dispara em `status→'approved'`, e o fluxo real pula esse estado).
- 🔍 **P1** — Marketplace split paga o médico duas vezes; o webhook consulta o pagamento com o token errado e `payment_status` nunca vira `approved`.
- ✅ **Crédito ao banco:** o trigger `zzz_protect_appointment_payment` que impede o paciente de forjar `payment_status` é sólido; e **nenhum fluxo apaga pagamento** (zero `.delete()` nas tabelas financeiras — verificado). Proteger o rótulo, porém, não protege o caixa enquanto o valor vier do cliente.
- ⚠️ **Verificar fora do código:** preapprovals órfãs no painel Mercado Pago (`subscriptions` perdeu colunas que `create-subscription` ainda grava → possível cartão cobrado mensalmente sem registro no banco); e o `UNIQUE(mp_payment_id)` de `payment_transactions`, de que dependem três `upsert`, pode não ter sobrevivido ao `DROP ... CASCADE` (a tabela foi restaurada fora do versionamento).

### Meus achados diretos (fluxos 42–45, UX/testes/mobile)
- ✅ Os testes nomeados `booking-flow`, `payment-flow`, `prescription-flow` **não testam fluxo** — validam formato de campo e renderização. Nenhum dos 9 cenários end-to-end existe. O nome cria confiança falsa.
- ✅ Tratamento de erro em 93 telas: loading 66, erro 51, vazio 43, **retry 1**. E **32 lugares** jogam `error.message` cru do backend na tela.
- ✅ Dashboard do paciente não responde "está paga?" nem mostra dependentes.
- ✅ **Wake Lock não existe** — a tela do celular apaga durante a consulta.
- ⚠️ `dvh` **é** usado em `VideoRoom`/`PreCallCheck` — altura em mobile está tratada (corrigi minha leitura inicial).

---

## Roadmap sugerido — por fase, não por domínio

A ordem segue "o que impede o produto de funcionar hoje" → "o que é brecha explorável" → "o que falta para ser completo".

### Fase 0 — Hotfix (horas, correções de 1 linha, destravam o produto)
Estes são todos nomes de coluna/enum errados. Cada um é trivial e juntos devolvem os fluxos principais:
1. `appointment_type: "telemedicina"` → o agendamento volta a funcionar. ✅ verificado
2. `cancelled_at` em `AppointmentDetail` → cancelamento volta a funcionar. ✅ verificado
3. `guest_patient_id` removido de ~8 arquivos → agenda, lista, sala de espera e notificações do médico voltam.
4. Colunas inexistentes em `DoctorSearch`, `AdminApprovals`, `useDoctorDashboard` → busca de médicos, fila de aprovação e dashboard do médico voltam.
5. `pagehide → hang-up` no `use-webrtc` → a consulta para de morrer quando o paciente minimiza o app.

### Fase 1 — Segurança e brechas (dias)
6. **Carteira: INSERT só por `service_role`.** ✅ é a maior perda financeira potencial — vai primeiro.
7. **Valor do pagamento resolvido no servidor**, nunca do body; gate de pagamento em `guest-checkout`. ✅/🔍
8. Remover auto-cadastro de `support`; restringir `assign-role`. ✅ verificado
9. Autenticar `generate-*-pdf` e `register-signature`. 🔍
10. Fechar bypass de KYC (trigger que força `status='pendente'` para não-admin). 🚫 confirmar em staging
11. Policy de `profiles` com `TO authenticated` e escopo por dono. ⚠️ P1
12. Desligar todo o vocabulário "ICP-Brasil/PAdES" enquanto a assinatura for simulada. 🔍 (maior risco jurídico)

### Fase 2 — Fundação de estados e dinheiro (1–2 semanas)
11. Máquina de estados de `appointments`: RPC de transição + tabela de arestas + revogar UPDATE direto. ✅
12. `payment_status` como enum de 6 valores + gate por allowlist (recusado não entra na sala). 🔍
13. Religar `payment_transactions` como ledger (webhook grava; faturamento soma, não estima). ⚠️
14. Um único ledger de repasse; reembolso que executa e notifica. 🔍
15. Auditoria antes/depois em prontuário, pagamento, status, permissão. 🔍

### Fase 3 — Prontuário e documentos clínicos (2–3 semanas)
16. Prontuário salvando em `medical_records` (canônico) com autosave local. 🔍
17. Assinatura digital real (VIDaaS já implementado, só ligar) ou rótulo honesto. 🔍
18. Pré-consulta, exames, atestados vinculados ao atendimento, com entrega ao paciente. 🔍
19. Tela "Minha consulta" consolidada. 🔍

### Fase 4 — Completude e operação (contínuo)
20. Dependentes unificados com `subject_dependent_id` (agendar para o filho). 🔍
21. Painel admin com ações de consulta (drawer de detalhe + RPC). 🔍
22. Suporte com categoria, runbook e visão de caso. 🔍
23. Outbox de notificações (idempotência transversal). 🔍
24. Os 9 cenários end-to-end como testes de verdade. ✅

### Processo (impede a regressão de tudo acima)
- **CI roda migrations contra Postgres limpo** — pega os bugs de enum e coluna automaticamente.
- **Teste de contrato** comparando cada `.select()`/`.update()` do front com o `types.ts` gerado.
- **Proibir `as any` em escrita no Supabase** (lint) — foi a causa direta de 3 P0.

---

## Nota de método

Onde os auditores divergiram do banco real, o banco venceu — e três achados P0 foram rebaixados por isso (PHI público, buckets públicos, `payment_transactions` dropada). Isso não desqualifica os relatórios: a grande maioria dos achados 🔍 é consistente com o schema e com o padrão de bug já confirmado. Mas os itens marcados 🚫/⚠️ **devem ser confirmados em staging ou com conta de teste antes de virar tarefa** — especialmente qualquer um cuja correção mexa em RLS de produção, onde um erro derruba acesso legítimo.
