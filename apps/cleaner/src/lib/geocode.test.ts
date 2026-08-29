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
import { geocodeUrl, parseGeocodeResponse } from "./geocode";

describe("geocodeUrl", () => {
  it("targets the Mapbox places endpoint with US address autocomplete params", () => {
    const url = geocodeUrl("123 Main St, Austin, TX", "tok_abc");
    expect(url).toContain("https://api.mapbox.com/geocoding/v5/mapbox.places/");
    expect(url).toContain("access_token=tok_abc");
    expect(url).toContain("autocomplete=true");
    expect(url).toContain("country=us");
    expect(url).toContain("types=address");
    expect(url).toContain("limit=5");
  });

  it("url-encodes the query", () => {
    expect(geocodeUrl("a b, c", "t")).toContain("mapbox.places/a%20b%2C%20c.json");
  });
});

describe("parseGeocodeResponse", () => {
  it("maps features to {placeName, center} in [lng, lat] order", () => {
    const out = parseGeocodeResponse({
      features: [
        { place_name: "123 Main St", center: [-97.74, 30.27] },
        { place_name: "456 Oak Ave", center: [-97.75, 30.28] },
      ],
    });
    expect(out).toEqual([
      { placeName: "123 Main St", center: [-97.74, 30.27] },
      { placeName: "456 Oak Ave", center: [-97.75, 30.28] },
    ]);
  });

  it("drops malformed features and tolerates non-object input", () => {
    expect(parseGeocodeResponse({ features: [{ center: [1] }, {}] })).toEqual([]);
    expect(parseGeocodeResponse(null)).toEqual([]);
    expect(parseGeocodeResponse({})).toEqual([]);
  });
});
