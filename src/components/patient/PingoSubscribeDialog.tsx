/**
 * PingoSubscribeDialog — modal de assinatura do Pingo Card.
 *
 * Coleta cartão (cliente) → tokeniza via MP SDK → chama edge function
 * `mercadopago-create-subscription` (com plan_table=pingo_card_plans
 * e skip_db_insert=true) → no success, INSERT em pingo_card_subscriptions
 * com mp_preapproval_id retornado.
 */

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { toast } from "sonner";
import { toastError } from "@/lib/errorMessages";
import { createCardToken } from "@/lib/mercadopago";

type PingoPlan = {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PingoPlan | null;
  billingCycle: "monthly" | "yearly";
  onSubscribed: () => void;
};

const generateCardNumber = () => {
  const block = () => Math.floor(1000 + Math.random() * 9000);
  return `${block()} ${block()} ${block()} ${block()}`;
};

export function PingoSubscribeDialog({ open, onOpenChange, plan, billingCycle, onSubscribed }: Props) {
  const { user } = useAuth();
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill CPF + nome do profile
  useEffect(() => {
    if (!user || !open) return;
    db.from("profiles").select("cpf, first_name, last_name").eq("user_id", user.id).single()
      .then(({ data }) => {
        if (data?.cpf) setCpf(data.cpf);
        if (data?.first_name && data?.last_name && !holder) {
          setHolder(`${data.first_name} ${data.last_name}`.toUpperCase());
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open]);

  if (!plan) return null;

  const amount = billingCycle === "yearly" ? plan.price_yearly : plan.price_monthly;
  const formatBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!cpf) { toast.error("CPF obrigatório", { description: "Complete seu cadastro primeiro." }); return; }
    if (!agreed) { toast.error("Aceite os termos pra continuar."); return; }

    setSubmitting(true);
    try {
      // 1. Tokeniza cartão client-side (número/CVV nunca tocam o backend)
      const [m, y] = exp.split("/");
      const token = await createCardToken({
        cardNumber: number.replace(/\s/g, ""),
        cardholderName: holder,
        cardExpirationMonth: m,
        cardExpirationYear: y,
        securityCode: cvv,
        identificationType: "CPF",
        identificationNumber: cpf,
      });

      // 2. Cria preapproval no Mercado Pago via edge function
      const { data: mp, error: mpErr } = await db.functions.invoke("mercadopago-create-subscription", {
        body: {
          plan_id: plan.id,
          plan_table: "pingo_card_plans",
          billing_cycle: billingCycle,
          card_token: token.id,
          payer_email: user.email,
          skip_db_insert: true,
          metadata: { source: "pingo_card_panel" },
        },
      });

      if (mpErr || (mp as any)?.error || !(mp as any)?.mp_preapproval_id) {
        toastError(toast, (mp as any)?.error || mpErr?.message, "pagamento");
        return;
      }

      // 3. Insere localmente em pingo_card_subscriptions com mp_preapproval_id
      const { error: insertErr } = await db.from("pingo_card_subscriptions").insert({
        user_id: user.id,
        plan_id: plan.id,
        card_number: generateCardNumber(),
        status: "active",
        billing_cycle: billingCycle,
        gateway: "mercadopago",
        mp_preapproval_id: (mp as any).mp_preapproval_id,
        next_charge_at: (mp as any).next_payment_date ?? null,
        current_period_end: new Date(Date.now() + (billingCycle === "yearly" ? 365 : 30) * 86400_000).toISOString(),
      } as any);

      if (insertErr) {
        // Rollback no MP
        await db.functions.invoke("mercadopago-cancel-subscription", {
          body: { mp_preapproval_id: (mp as any).mp_preapproval_id },
        });
        toast.error("Erro local — assinatura cancelada no MP", { description: insertErr.message });
        return;
      }

      toast.success("Bem-vindo ao Pingo Card! 🎉", {
        description: `Plano ${plan.name} ativado.`,
      });
      onSubscribed();
      onOpenChange(false);
    } catch (e) {
      toastError(toast, e, "pagamento");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Assinar {plan.name}
          </DialogTitle>
          <DialogDescription>
            Cobrança {billingCycle === "yearly" ? "anual" : "mensal"} de <strong>{formatBRL(amount)}</strong>{" "}
            — renovação automática no cartão informado. Cancele a qualquer momento.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="holder">Nome no cartão</Label>
            <Input
              id="holder"
              value={holder}
              onChange={(e) => setHolder(e.target.value.toUpperCase())}
              placeholder="JOAO M SILVA"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="number">Número do cartão</Label>
            <Input
              id="number"
              inputMode="numeric"
              value={number}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 19);
                setNumber(v.replace(/(\d{4})(?=\d)/g, "$1 "));
              }}
              placeholder="0000 0000 0000 0000"
              required
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp">Validade</Label>
              <Input
                id="exp"
                inputMode="numeric"
                value={exp}
                onChange={(e) => {
                  const c = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setExp(c.length >= 3 ? `${c.slice(0, 2)}/${c.slice(2)}` : c);
                }}
                placeholder="MM/AA"
                required
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cvv">CVV</Label>
              <Input
                id="cvv"
                inputMode="numeric"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF do titular</Label>
            <Input
              id="cpf"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="00000000000"
              required
              disabled={submitting}
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <p>Cartão tokenizado direto no Mercado Pago — número e CVV nunca passam pelo nosso servidor.</p>
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={agreed} onCheckedChange={setAgreed} disabled={submitting} />
            <span>
              Aceito os <a href="/terms" target="_blank" className="text-primary underline">Termos</a> e autorizo
              cobrança recorrente no meu cartão. Posso cancelar a qualquer momento.
            </span>
          </label>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !agreed} className="gap-1.5">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando…</> : (
                <>
                  <ShieldCheck className="w-4 h-4" /> Assinar por {formatBRL(amount)}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
