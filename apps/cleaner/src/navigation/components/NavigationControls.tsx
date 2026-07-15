/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Volume2, VolumeX, X } from "lucide-react";

export interface NavigationControlsProps {
  voiceGuidanceEnabled: boolean;
  onToggleVoiceGuidance(): void;
  onEndNavigation(): void;
}

export function NavigationControls({
  voiceGuidanceEnabled,
  onToggleVoiceGuidance,
  onEndNavigation,
}: NavigationControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggleVoiceGuidance}
        aria-label={voiceGuidanceEnabled ? "Mute voice guidance" : "Unmute voice guidance"}
        aria-pressed={voiceGuidanceEnabled}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md dark:bg-charcoal dark:text-slate-200"
      >
        {voiceGuidanceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={onEndNavigation}
        aria-label="End navigation"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-md"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
