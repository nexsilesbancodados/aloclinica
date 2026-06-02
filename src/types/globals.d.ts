/**
 * Global type augmentations for browser APIs and third-party scripts
 * injected at runtime (Jitsi, Metered, Speech Recognition, etc.)
 */

// ─── Analytics (already in AnalyticsScripts.tsx but kept here for consistency) ──
interface Window {
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  dataLayer?: unknown[];

  // Jitsi Meet External API — loaded dynamically from meet.jit.si/external_api.js
  JitsiMeetExternalAPI?: new (
    domain: string,
    options: Record<string, unknown>
  ) => {
    addEventListener: (event: string, callback: () => void) => void;
    dispose: () => void;
  };

  // Metered video SDK — loaded dynamically
  MeteredFrame?: new () => {
    join: (options: Record<string, unknown>) => Promise<void>;
    [key: string]: unknown;
  };

  // Web Speech API (vendor-prefixed fallback)
  webkitSpeechRecognition?: typeof SpeechRecognition;
  webkitAudioContext?: typeof AudioContext;
}

// ─── Web Speech API event types (missing from this TS DOM lib version) ──
// SpeechRecognitionResult/ResultList já existem na lib DOM; só faltam os eventos.
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
