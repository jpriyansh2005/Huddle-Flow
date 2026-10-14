"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { CaptionThrottle } from "@/lib/realtime/captionThrottle";
import {
  type CaptionProblem,
  SpeechCaptioner,
  speechRecognitionSupported,
} from "@/lib/realtime/speechRecognizer";

/** Unfinished captions go to the room at most this often. */
const INTERIM_INTERVAL_MS = 300;

type UseSpeechCaptionsOptions = {
  /** Listen now: captions are on for the room and the microphone is on. */
  active: boolean;
  send: (text: string, final: boolean) => void;
};

/**
 * Turns the local speaker's voice into captions while `active`, and sends
 * them to the room. Speech is recognised by the browser, not by our server.
 */
export function useSpeechCaptions({ active, send }: UseSpeechCaptionsOptions) {
  // The meeting room only renders in the browser, so this can be read at once.
  const [supported] = useState(speechRecognitionSupported);
  // Once the browser refuses (microphone blocked) or keeps failing, stop
  // trying until the page is reloaded rather than retrying in a loop.
  const [problem, setProblem] = useState<CaptionProblem | null>(null);
  const sendCaption = useEffectEvent(send);

  useEffect(() => {
    if (!active || !supported || problem) return;
    const throttle = new CaptionThrottle(
      (text, final) => sendCaption(text, final),
      INTERIM_INTERVAL_MS,
    );
    const captioner = new SpeechCaptioner({
      lang: navigator.language || "en-US",
      onText: (text, final) => throttle.push(text, final),
      onProblem: setProblem,
    });
    captioner.start();
    return () => {
      captioner.stop();
      throttle.cancel();
    };
  }, [active, supported, problem]);

  return { supported, problem };
}
