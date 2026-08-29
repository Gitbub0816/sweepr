/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { MapboxMap, type MapboxMarker } from "@sweepr/ui";

export interface AddressMapPreviewProps {
  lat: number;
  lng: number;
}

/**
 * Small, non-interactive map preview with a seafoam marker at the selected
 * address. Falls back to a styled placeholder box when no Mapbox token is
 * configured (handled by MapboxMap itself).
 */
export function AddressMapPreview({ lat, lng }: AddressMapPreviewProps) {
  const markers: MapboxMarker[] = [
    { lngLat: [lng, lat], color: "#14b8a6", label: "Selected address" },
  ];

  return (
    <div className="relative h-[200px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <MapboxMap
        className="h-full w-full"
        center={[lng, lat]}
        zoom={15}
        markers={markers}
        interactive={false}
      />
    </div>
  );
}

export default AddressMapPreview;
