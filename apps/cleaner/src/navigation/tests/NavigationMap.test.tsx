/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { NavigationMap } from "../components/NavigationMap";

describe("NavigationMap", () => {
  it("renders the MapKit-load-failure fallback when the map failed to initialize", () => {
    render(
      <NavigationMap
        session={{ containerRef: createRef<HTMLDivElement>(), mapStatus: "error" }}
      />
    );
    expect(screen.getByTestId("navigation-map-unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Navigation map unavailable/i)).toBeInTheDocument();
  });

  it("shows a loading message before the map is ready", () => {
    render(
      <NavigationMap
        session={{ containerRef: createRef<HTMLDivElement>(), mapStatus: "loading" }}
      />
    );
    expect(screen.getByText(/Loading map/i)).toBeInTheDocument();
    expect(screen.queryByTestId("navigation-map-unavailable")).not.toBeInTheDocument();
  });

  it("hides the loading/error UI once the map is ready", () => {
    render(
      <NavigationMap
        session={{ containerRef: createRef<HTMLDivElement>(), mapStatus: "ready" }}
      />
    );
    expect(screen.queryByText(/Loading map/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("navigation-map-unavailable")).not.toBeInTheDocument();
  });
});
