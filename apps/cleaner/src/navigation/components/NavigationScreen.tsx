/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useMemo, useState } from "react";
import { useNavigationSession } from "../hooks/useNavigationSession";
import { NavigationMap } from "./NavigationMap";
import { ManeuverBanner } from "./ManeuverBanner";
import { NavigationBottomBar } from "./NavigationBottomBar";
import { NavigationControls } from "./NavigationControls";
import { ResumeNavigationButton } from "./ResumeNavigationButton";
import { RouteOverviewButton } from "./RouteOverviewButton";
import { NavigationPermissionNotice, type NavigationNoticeReason } from "./NavigationPermissionNotice";
import type { Coordinate, NavigationRoute } from "../types/navigation";

export interface NavigationScreenProps {
  route: NavigationRoute | null;
  destination: { coordinate: Coordinate; label: string } | null;
  onEndNavigation(): void;
}

function appleMapsUrl(destination: { coordinate: Coordinate; label: string } | null): string | null {
  if (!destination) return null;
  const { lat, lng } = destination.coordinate;
  const params = new URLSearchParams({ daddr: `${lat},${lng}` });
  return `https://maps.apple.com/?${params.toString()}`;
}

function permissionReason(state: ReturnType<typeof useNavigationSession>["state"]): NavigationNoticeReason | null {
  if (typeof window !== "undefined" && !window.isSecureContext) return "non-secure-context";
  if (state.permissionState === "unsupported") return "unsupported-browser";
  if (state.permissionState === "denied") return "permission-denied";
  if (state.gpsAccuracyMeters != null && state.gpsAccuracyMeters > 200) return "poor-accuracy";
  return null;
}

/**
 * Top-level navigation screen: full-viewport map plus all chrome (maneuver
 * banner, ETA bar, controls, permission notices). Safe-area aware via
 * env(safe-area-inset-*) and 100dvh so it renders correctly under the notch/
 * home-indicator on mobile Safari and behind Chrome-Android's dynamic
 * toolbar.
 */
export function NavigationScreen({ route, destination, onEndNavigation }: NavigationScreenProps) {
  const session = useNavigationSession({
    route,
    destination: destination?.coordinate ?? null,
    enabled: true,
  });
  const [showOverview, setShowOverview] = useState(false);

  const currentStep = route?.steps[session.state.currentStepIndex] ?? null;
  const nextStep = route?.steps[session.state.currentStepIndex + 1] ?? null;
  const mapsUrl = useMemo(() => appleMapsUrl(destination), [destination]);
  const noticeReason = permissionReason(session.state);

  return (
    <div
      className="relative flex flex-col bg-slate-950"
      style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="relative flex-1 overflow-hidden">
        <NavigationMap session={session} />

        <div className="pointer-events-none absolute inset-x-0 top-0">
          <div className="pointer-events-auto">
            <ManeuverBanner
              currentStep={currentStep}
              nextStep={nextStep}
              distanceToManeuverMeters={session.state.distanceToNextManeuverMeters}
            />
          </div>
        </div>

        <div className="pointer-events-none absolute right-3 top-24 flex flex-col gap-2">
          <div className="pointer-events-auto">
            <RouteOverviewButton
              onShowOverview={() => {
                setShowOverview(true);
                session.setCameraMode("overview");
              }}
            />
          </div>
          <div className="pointer-events-auto">
            <NavigationControls
              voiceGuidanceEnabled={session.state.voiceGuidanceEnabled}
              onToggleVoiceGuidance={() =>
                session.setVoiceGuidanceEnabled(!session.state.voiceGuidanceEnabled)
              }
              onEndNavigation={onEndNavigation}
            />
          </div>
        </div>

        {(showOverview || session.state.cameraMode === "user-controlled") && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <div className="pointer-events-auto">
              <ResumeNavigationButton
                cameraMode={session.state.cameraMode}
                onResume={() => {
                  setShowOverview(false);
                  session.resumeFollowing();
                }}
              />
            </div>
          </div>
        )}

        {noticeReason && (
          <div className="absolute inset-x-4 top-24 z-10">
            <NavigationPermissionNotice reason={noticeReason} />
          </div>
        )}
      </div>

      <NavigationBottomBar
        remainingDurationSeconds={session.state.remainingDurationSeconds}
        distanceRemainingMeters={session.state.distanceRemainingMeters}
        estimatedArrival={session.state.estimatedArrival}
      />

      {mapsUrl && (
        <div
          className="bg-slate-900 px-4 py-2 text-center"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-seafoam-400 underline underline-offset-2"
          >
            Open in Apple Maps (native handoff)
          </a>
        </div>
      )}
    </div>
  );
}
