/**
 * Live captions for the local speaker, using the browser's Web Speech API.
 *
 * Chrome and Edge support it (they send the audio to their own speech
 * service); Firefox does not. The recogniser stops by itself after a pause
 * or about a minute of speech, so it is restarted for as long as captions are
 * wanted, with a limit so a broken microphone cannot cause a restart storm.
 */

/** The longest caption the server accepts; longer text keeps its end. */
export const MAX_CAPTION_LENGTH = 500;

// The parts of the Web Speech API used here. TypeScript's DOM types do not
// include it in every version, so it is described locally.
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
export type SpeechResultEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResult };
};
type SpeechErrorEvent = { error: string };
type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => BrowserRecognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Whether this browser can turn the user's speech into captions. */
export function speechRecognitionSupported(): boolean {
  return recognitionClass() !== null;
}

/** Text ready to send: trimmed, single spaced, and within the server's limit. */
export function cleanCaption(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_CAPTION_LENGTH ? clean.slice(-MAX_CAPTION_LENGTH).trim() : clean;
}

/**
 * Split a recognition event into the sentences it finished and the text it
 * is still unsure about. Only results from `resultIndex` on are new.
 */
export function readResults(event: SpeechResultEvent): { finals: string[]; interim: string } {
  const finals: string[] = [];
  let interim = "";
  for (let index = event.resultIndex; index < event.results.length; index++) {
    const result = event.results[index];
    const text = result[0].transcript;
    if (result.isFinal) {
      const clean = cleanCaption(text);
      if (clean) finals.push(clean);
    } else {
      interim += text;
    }
  }
  return { finals, interim: cleanCaption(interim) };
}

/** Allows at most `limit` restarts within `windowMs`. */
export class RestartBudget {
  private restarts: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(now: number): boolean {
    this.restarts = this.restarts.filter((time) => now - time < this.windowMs);
    if (this.restarts.length >= this.limit) return false;
    this.restarts.push(now);
    return true;
  }
}

export type CaptionProblem = "blocked" | "failed";

type SpeechCaptionerOptions = {
  lang: string;
  onText: (text: string, final: boolean) => void;
  /** The recogniser gave up: the microphone or speech service was refused, or kept failing. */
  onProblem: (problem: CaptionProblem) => void;
};

export class SpeechCaptioner {
  private recognition: BrowserRecognition | null = null;
  private running = false;
  private readonly budget = new RestartBudget(8, 30_000);

  constructor(private readonly options: SpeechCaptionerOptions) {}

  start(): void {
    const Recognition = recognitionClass();
    if (!Recognition || this.running) return;
    this.running = true;

    const recognition = new Recognition();
    recognition.lang = this.options.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const { finals, interim } = readResults(event);
      for (const text of finals) this.options.onText(text, true);
      if (interim) this.options.onText(interim, false);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.stop();
        this.options.onProblem("blocked");
      }
      // Other errors ("no-speech", "network", "aborted") end the session;
      // onend below decides whether to start again.
    };
    recognition.onend = () => {
      if (!this.running) return;
      if (!this.budget.allow(Date.now())) {
        this.stop();
        this.options.onProblem("failed");
        return;
      }
      try {
        recognition.start();
      } catch {
        // Already starting; the next end event tries again.
      }
    };
    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.stop();
      this.options.onProblem("failed");
    }
  }

  stop(): void {
    this.running = false;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
    }
  }
}
