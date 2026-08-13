# Aplicar as migrations pendentes

Quatro migrations estão no repositório e **não foram aplicadas**. Três fecham
falhas de segurança já exploráveis; a quarta habilita as Feature Flags.

| Arquivo | O que fecha | Severidade |
|---|---|---|
| `20260809100000_appointment_payment_integrity.sql` | Paciente marcava a própria consulta como paga e o gatilho de repasse creditava o médico com dinheiro que nunca entrou | **P0 — perda financeira** |
| `20260809100100_doctor_profile_insert_protection.sql` | Qualquer conta inseria a própria ficha já `is_approved=true` e virava médico listado, agendável e com acesso a paciente | **P0 — escalada de privilégio** |
| `20260809100200_bare_doctor_role_phi_scope.sql` | Papel `doctor` puro (auto-cadastro, sem aprovação) lia fila de urgência com sintomas e os buckets de exames/laudos | **P0 — PHI** |
| `20260810120000_feature_flags.sql` | Habilita o módulo de Feature Flags | Funcionalidade |

> ⚠️ Estes exploits foram derivados dos **arquivos de migration**, não do banco ao
> vivo. O `docs/CORRECOES-PENDENTES.md` (item C2) documenta drift comprovado.
> Rode a verificação do passo 2 antes de assumir que o banco está vulnerável — e
> antes de assumir que está protegido.

---

## 1. Backup primeiro

Não pule. As três migrations de segurança criam gatilhos que passam a **recusar
silenciosamente** escritas que antes passavam. Se algum fluxo legítimo depender
de uma delas, você vai querer voltar atrás.

```bash
supabase db dump --db-url "$DATABASE_URL" -f backup-pre-migrations-$(date +%Y%m%d-%H%M).sql
```

## 2. Verificar o estado ANTES

```bash
psql "$DATABASE_URL" -f scripts/verify_pending_migrations.sql
```

Leia a seção **5. PRÉ-REQUISITOS**: se `is_admin()`, `payment_transactions` ou
`on_demand_queue.appointment_id` vierem como `false`, a migration correspondente
falha ao aplicar — resolva antes.

Leia também as seções **6 e 7**, que apontam duas armadilhas conhecidas de drift
(ver "Riscos conhecidos" abaixo).

## 3. Aplicar em STAGING

```bash
supabase db push --db-url "$STAGING_DATABASE_URL"
```

Ou, uma a uma:

```bash
for f in \
  supabase/migrations/20260809100000_appointment_payment_integrity.sql \
  supabase/migrations/20260809100100_doctor_profile_insert_protection.sql \
  supabase/migrations/20260809100200_bare_doctor_role_phi_scope.sql \
  supabase/migrations/20260810120000_feature_flags.sql
do
  echo ">>> $f"
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

`ON_ERROR_STOP=1` é importante: sem ele o psql segue após um erro e você fica com
metade de uma migration aplicada.

## 4. Testar os fluxos que os gatilhos tocam

Os gatilhos são defensivos — o risco não é quebrar o ataque, é quebrar o uso
legítimo. Confirme em staging:

- [ ] **Agendamento normal:** paciente marca consulta, paga com cartão, a consulta fica `approved`. (Quem aprova agora é o servidor: `mercadopago-create-payment` / `-charge-saved-card` / webhooks.)
- [ ] **Plantão:** paciente paga a fila, médico aceita, a consulta nasce `approved` e o repasse é gerado. Este é o caminho mais sensível — a autorização vem de `payment_transactions` com `resource_type='urgent_queue'`.
- [ ] **Cancelamento** pelo paciente segue funcionando.
- [ ] **Recepção/clínica** ainda marcam `no_show` e `completed` (o bloqueio é só para o paciente).
- [ ] **Cadastro de médico** (`/medico/cadastro`) conclui e cai em "aguardando aprovação".
- [ ] **Aprovação pelo admin** continua promovendo o médico.
- [ ] **Fila de urgência** visível para médico aprovado; invisível para candidato não aprovado.

## 5. Produção

Só depois que o item 4 passar inteiro. Mesma sequência, com janela de manutenção
se possível.

## 6. Verificar DEPOIS

```bash
psql "$DATABASE_URL" -f scripts/verify_pending_migrations.sql
```

Esperado: 3 gatilhos presentes, `cobre_insert = t`, `is_approved_doctor`
existente, **zero** policies usando o papel `doctor` puro, 3 tabelas e 4 funções
de feature flags.

---

## Rollback

As migrations são aditivas — nenhuma apaga dado ou coluna. Para reverter, remova
os gatilhos e restaure as policies anteriores:

```sql
-- Reverte a proteção de pagamento (volta a permitir escrita do cliente)
DROP TRIGGER IF EXISTS zzz_protect_appointment_payment ON public.appointments;

-- Reverte a proteção de INSERT do médico, mantendo a de UPDATE (C1 original)
DROP TRIGGER IF EXISTS zzz_protect_doctor_verification ON public.doctor_profiles;
CREATE TRIGGER zzz_protect_doctor_verification
  BEFORE UPDATE ON public.doctor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_doctor_verification_fields();

-- Feature flags: remover as tabelas apaga as flags configuradas.
-- Para apenas desativar o módulo, tire a rota do Dashboard — não derrube as tabelas.
```

Reverter a `20260809100200` significa voltar a expor PHI. Se algo quebrar por
causa dela, prefira ajustar a policy específica a derrubar a migration inteira.

---

## Riscos conhecidos antes de aplicar

**`activity_logs` tem duas formas no repositório.** A migration `20260215214937`
cria `details` + `performed_by`; o rebuild `20260415020135` cria `metadata` e não
tem nenhuma das duas. O `admin-secret-manager` grava usando `details` e
`performed_by` — se o banco estiver na forma do rebuild, **a auditoria de
alteração de secrets falha em silêncio**. A seção 6 da verificação mostra qual
forma está viva.

**`discount_cards.discount_percent` pode não existir.** O gatilho da fila
(`20260809100300`, do Codex) lê essa coluna dentro de um `EXECUTE` protegido por
`to_regclass` — que valida a *tabela*, não a *coluna*. Se o banco tiver a versão
reconstruída em `20260701051000` (que não tem a coluna), o `BEFORE INSERT`
levanta erro e **nenhum paciente consegue entrar na fila do plantão**. A seção 7
verifica isso. Resolva antes de aplicar aquela migration.

**Divergência de desconto no plantão.** O cliente usa
`discount_percent ?? 30` e o gatilho usa `COALESCE(discount_percent, 0)`. Com a
coluna nula, a tela mostra um preço e a cobrança sai por outro — maior do que o
exibido, que é justamente o que `mercadopago-create-payment` documenta evitar.
