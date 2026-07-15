/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResumeNavigationButton } from "../components/ResumeNavigationButton";

describe("ResumeNavigationButton", () => {
  it("renders nothing while the camera is following", () => {
    const { container } = render(<ResumeNavigationButton cameraMode="following" onResume={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing in overview/maneuver-preview/arrival modes", () => {
    for (const mode of ["overview", "maneuver-preview", "arrival"] as const) {
      const { container } = render(<ResumeNavigationButton cameraMode={mode} onResume={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("renders and calls onResume only when camera mode is user-controlled", () => {
    const onResume = vi.fn();
    render(<ResumeNavigationButton cameraMode="user-controlled" onResume={onResume} />);
    const button = screen.getByRole("button", { name: /resume navigation/i });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
