/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Navigation } from "lucide-react";
import type { NavigationCameraMode } from "../types/navigation";

export interface ResumeNavigationButtonProps {
  cameraMode: NavigationCameraMode;
  onResume(): void;
}

/** Shown only while the camera is in user-controlled mode (the user panned
 *  or zoomed the map away from auto-follow). */
export function ResumeNavigationButton({ cameraMode, onResume }: ResumeNavigationButtonProps) {
  if (cameraMode !== "user-controlled") return null;

  return (
    <button
      type="button"
      onClick={onResume}
      className="flex items-center gap-2 rounded-full bg-seafoam-500 px-4 py-2 text-sm font-semibold text-white shadow-lg"
    >
      <Navigation className="h-4 w-4" aria-hidden="true" />
      Resume navigation
    </button>
  );
}
