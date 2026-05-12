/**
 * usePixCountdown — countdown reutilizável pro QR Code PIX (30 min).
 *
 * Uso:
 *   const { secondsLeft, expired } = usePixCountdown(pixQrCode, () => {
 *     toast.error("PIX expirado", { description: "..." });
 *   });
 *
 * Reseta automaticamente quando `triggerKey` muda (ex: novo QR Code gerado).
 */
import { useEffect, useState } from "react";

export const PIX_EXPIRY_SECONDS = 1800; // 30 min

export function usePixCountdown(triggerKey: unknown, onExpire?: () => void) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!triggerKey) return;
    setSecondsLeft(PIX_EXPIRY_SECONDS);
    setExpired(false);
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setExpired(true);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // onExpire intentionally omitted — caller is responsible for stable ref if needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  return { secondsLeft, expired };
}
