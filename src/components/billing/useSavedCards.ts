/**
 * Hook para gerenciar cartões salvos (vault Mercado Pago).
 *
 * Funcionalidades:
 *   - list(): lista cartões ativos do usuário
 *   - addCard(form): tokeniza no MP via SDK client + salva via mercadopago-save-card
 *   - remove(cardId): soft-delete (status=removed)
 *   - setDefault(cardId): marca como default
 */
import { useEffect, useState, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { warn } from "@/lib/logger";
import { createCardToken } from "@/lib/mercadopago";
import { toastError } from "@/lib/errorMessages";

export type SavedCard = {
  id: string;
  mp_card_id: string | null;
  pagbank_card_id?: string | null;
  last4: string;
  brand: string;
  holder_name: string;
  expiry_month: string;
  expiry_year: string;
  is_default: boolean;
  status: "active" | "expired" | "removed";
  gateway?: "mercadopago" | "pagbank";
  created_at: string;
};

export type AddCardInput = {
  holder: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cpf: string;
  isDefault?: boolean;
};

export function useSavedCards() {
  const { user } = useAuth();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const list = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (db as any)
      .from("saved_cards")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) warn("[useSavedCards] list error", error);
    setCards((data ?? []) as SavedCard[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { list(); }, [list]);

  const addCard = useCallback(async (input: AddCardInput): Promise<SavedCard | null> => {
    if (!user) {
      toast.error("Faça login");
      return null;
    }
    setAdding(true);
    try {
      // Tokeniza client-side via SDK Mercado Pago (número/CVV nunca trafegam pro backend)
      const token = await createCardToken({
        cardNumber: input.number,
        cardholderName: input.holder,
        cardExpirationMonth: input.expiryMonth,
        cardExpirationYear: input.expiryYear,
        securityCode: input.cvv,
        identificationType: "CPF",
        identificationNumber: input.cpf,
      });

      const { data, error } = await db.functions.invoke("mercadopago-save-card", {
        body: {
          card_token: token.id,
          holder_name: input.holder,
          is_default: input.isDefault ?? false,
        },
      });
      if (error || data?.error || !data?.saved_card_id) {
        toastError(toast, data?.error || error?.message, "pagamento");
        return null;
      }
      toast.success("Cartão salvo!", {
        description: `${data.brand ?? ""} •••• ${data.last4}`,
      });
      await list();
      return {
        id: data.saved_card_id,
        mp_card_id: data.mp_card_id,
        last4: data.last4,
        brand: data.brand,
        holder_name: input.holder,
        expiry_month: input.expiryMonth,
        expiry_year: input.expiryYear,
        is_default: input.isDefault ?? false,
        status: "active",
        gateway: "mercadopago",
        created_at: new Date().toISOString(),
      };
    } catch (e) {
      warn("[useSavedCards] addCard error", e);
      toastError(toast, e, "pagamento");
      return null;
    } finally {
      setAdding(false);
    }
  }, [user, list]);

  const remove = useCallback(async (cardId: string) => {
    const { error } = await (db as any)
      .from("saved_cards")
      .update({ status: "removed", removed_at: new Date().toISOString() })
      .eq("id", cardId);
    if (error) {
      toast.error("Erro ao remover", { description: error.message });
      return false;
    }
    toast.success("Cartão removido");
    await list();
    return true;
  }, [list]);

  const setDefault = useCallback(async (cardId: string) => {
    if (!user) return false;
    // Desmarcar todos
    await (db as any).from("saved_cards").update({ is_default: false }).eq("user_id", user.id);
    // Marcar o escolhido
    const { error } = await (db as any).from("saved_cards").update({ is_default: true }).eq("id", cardId);
    if (error) {
      toast.error("Erro", { description: error.message });
      return false;
    }
    await list();
    return true;
  }, [user, list]);

  return { cards, loading, adding, list, addCard, remove, setDefault };
}
