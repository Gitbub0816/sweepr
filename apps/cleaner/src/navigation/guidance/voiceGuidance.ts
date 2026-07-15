/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { RouteStep, VoiceAnnouncementStage } from "../types/navigation";

function stageText(stage: VoiceAnnouncementStage, step: RouteStep | null): string {
  const instruction = step?.instruction?.trim();
  switch (stage) {
    case "early-warning":
      return instruction ? `In a while, ${instruction}` : "Continue on this road.";
    case "approaching":
      return instruction ? `Coming up, ${instruction}` : "Continue on this road.";
    case "final":
      return instruction ?? "Continue on this road.";
    case "rerouting":
      return "Rerouting.";
    case "arrival":
      return "You have arrived.";
    default:
      return instruction ?? "";
  }
}

export interface VoiceGuidanceHandle {
  /** Speaks the text for a stage/step, cancelling any in-flight utterance
   *  first (a new maneuver announcement should never overlap the previous
   *  one). No-op if unsupported, muted, or the tab is hidden. */
  announce(stage: VoiceAnnouncementStage, step: RouteStep | null): void;
  setMuted(muted: boolean): void;
  cancel(): void;
  destroy(): void;
}

/**
 * Web Speech API wrapper for turn-by-turn voice announcements. Fully
 * optional — every method degrades to a silent no-op when
 * `window.speechSynthesis` is unavailable, so navigation remains fully
 * usable with voice guidance off or unsupported (Web Speech API support and
 * voice quality/availability vary significantly across mobile browsers).
 */
export function createVoiceGuidance(): VoiceGuidanceHandle {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  let muted = false;
  let destroyed = false;
  let voicesReady = false;
  let pendingVoiceListeners: (() => void)[] = [];

  if (supported) {
    const synth = window.speechSynthesis;
    if (synth.getVoices().length > 0) {
      voicesReady = true;
    } else if ("onvoiceschanged" in synth) {
      synth.onvoiceschanged = () => {
        voicesReady = true;
        pendingVoiceListeners.forEach((fn) => fn());
        pendingVoiceListeners = [];
      };
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) synth.cancel();
    });
  }

  function speak(text: string) {
    if (!supported || destroyed || muted || !text) return;
    const synth = window.speechSynthesis;
    if (document.hidden) return;

    const doSpeak = () => {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      synth.speak(utterance);
    };

    if (voicesReady || synth.getVoices().length > 0) {
      doSpeak();
    } else {
      // getVoices() can be empty until onvoiceschanged fires on first use in
      // some browsers — queue this announcement instead of speaking with no
      // voice loaded (which some engines silently drop).
      pendingVoiceListeners.push(doSpeak);
    }
  }

  return {
    announce(stage, step) {
      speak(stageText(stage, step));
    },
    setMuted(next) {
      muted = next;
      if (muted && supported) window.speechSynthesis.cancel();
    },
    cancel() {
      if (supported) window.speechSynthesis.cancel();
    },
    destroy() {
      destroyed = true;
      pendingVoiceListeners = [];
      if (supported) window.speechSynthesis.cancel();
    },
  };
}
