/**
 * AddCardForm — formulário inline para adicionar novo cartão ao vault.
 *
 * Coleta dados, chama useSavedCards.addCard (que tokeniza no Mercado Pago).
 * NÃO armazena número/CVV em estado por mais tempo que o necessário.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Loader2 } from "lucide-react";
import { useSavedCards } from "./useSavedCards";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/supabase/untyped";
import { toast } from "sonner";

type Props = {
  onSaved?: (cardId: string) => void;
  onCancel?: () => void;
  defaultIsDefault?: boolean;
};

export function AddCardForm({ onSaved, onCancel, defaultIsDefault = false }: Props) {
  const { user } = useAuth();
  const { addCard, adding } = useSavedCards();
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [isDefault, setIsDefault] = useState(defaultIsDefault);

  // Pre-fill CPF do profile (usuário não precisa redigitar)
  useEffect(() => {
    if (!user) return;
    db.from("profiles").select("cpf").eq("user_id", user.id).single()
      .then(({ data }) => { if (data?.cpf) setCpf(data.cpf); });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpf) {
      toast.error("CPF não encontrado", { description: "Complete seu cadastro com CPF antes de salvar um cartão." });
      return;
    }
    const card = await addCard({
      holder: holder.trim(),
      number: number.replace(/\D/g, ""),
      expiryMonth,
      expiryYear,
      cvv,
      cpf,
      isDefault,
    });
    if (card) {
      // Limpa dados sensíveis
      setNumber(""); setCvv("");
      onSaved?.(card.id);
    }
  };

  const formatCardNumber = (v: string) => {
    return v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="holder">Nome no cartão *</Label>
        <Input
          id="holder"
          value={holder}
          onChange={(e) => setHolder(e.target.value.toUpperCase())}
          placeholder="JOAO M SILVA"
          required
          autoComplete="cc-name"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="number">Número do cartão *</Label>
        <Input
          id="number"
          value={formatCardNumber(number)}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="0000 0000 0000 0000"
          inputMode="numeric"
          autoComplete="cc-number"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="exp-m">Mês *</Label>
          <Input
            id="exp-m"
            value={expiryMonth}
            onChange={(e) => setExpiryMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="MM"
            inputMode="numeric"
            autoComplete="cc-exp-month"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-y">Ano *</Label>
          <Input
            id="exp-y"
            value={expiryYear}
            onChange={(e) => setExpiryYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="AAAA"
            inputMode="numeric"
            autoComplete="cc-exp-year"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cvv">CVV *</Label>
          <Input
            id="cvv"
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="123"
            inputMode="numeric"
            autoComplete="cc-csc"
            required
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
        <Label className="text-sm font-normal cursor-pointer">
          Definir como cartão padrão
        </Label>
        <Switch checked={isDefault} onCheckedChange={setIsDefault} />
      </div>

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={adding} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={adding} className="flex-1 gap-2">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {adding ? "Salvando..." : "Salvar cartão"}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center pt-1">
        🔒 Dados do cartão são processados com criptografia pelo PagBank.
        Não armazenamos número completo nem CVV.
      </p>
    </form>
  );
}

export default AddCardForm;
