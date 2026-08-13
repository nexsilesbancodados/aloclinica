/**
 * Web Speech API — tipos mínimos.
 *
 * O TypeScript não traz `SpeechRecognition` na lib DOM padrão (a API nunca foi
 * padronizada; browsers expõem `webkitSpeechRecognition`). Sem estas declarações
 * o `tsc` falha em SpeechToText.tsx e AIChatTab.tsx, que já usam a API em runtime
 * com o guard de disponibilidade.
 *
 * Só o subconjunto realmente consumido por esses dois arquivos está aqui —
 * declarar a especificação inteira seria manutenção sem retorno.
 */

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

// NOTA: `Window.SpeechRecognition` / `webkitSpeechRecognition` NÃO são
// declarados aqui de propósito. WaitingAnamnesis.tsx já os declara como `any`
// num `declare global`, e uma segunda declaração com tipo diferente quebra o
// build (TS2717 — declarações subsequentes precisam ter o mesmo tipo).
// Este arquivo cobre só os tipos de EVENTO, que era o que faltava.
