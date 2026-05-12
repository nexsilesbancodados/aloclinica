/**
 * useIdempotent — guard contra double-submit em ações sensíveis.
 *
 * Cobre 3 casos:
 *   1. Usuário clica 2x rápido no botão "Pagar"
 *   2. Usuário dá F5 enquanto requisição tá in-flight
 *   3. React StrictMode dispara handler 2x em dev
 *
 * Como funciona:
 *   const { run, busy } = useIdempotent();
 *   const handlePay = () => run(async () => {
 *     await db.functions.invoke("mercadopago-create-payment", ...);
 *   });
 *
 * Enquanto `busy === true`, novos `run()` retornam undefined imediatamente
 * (no-op). Não precisa lembrar de checar `busy` no JSX — só usar pra
 * desabilitar o botão visualmente.
 */
import { useCallback, useRef, useState } from "react";

export function useIdempotent<T = unknown>() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) {
      // Silenciosamente ignora a segunda chamada
      return undefined;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    inFlight.current = false;
    setBusy(false);
  }, []);

  return { run, busy, reset };
}
