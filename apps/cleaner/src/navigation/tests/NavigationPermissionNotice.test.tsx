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
import { NavigationPermissionNotice } from "../components/NavigationPermissionNotice";

describe("NavigationPermissionNotice", () => {
  it("renders permission-denied messaging", () => {
    render(<NavigationPermissionNotice reason="permission-denied" />);
    expect(screen.getByText(/Location access denied/i)).toBeInTheDocument();
  });

  it("renders unsupported-browser messaging", () => {
    render(<NavigationPermissionNotice reason="unsupported-browser" />);
    expect(screen.getByText(/Browser not supported/i)).toBeInTheDocument();
  });

  it("renders unavailable / timeout / poor-accuracy / non-secure-context variants distinctly", () => {
    const { rerender } = render(<NavigationPermissionNotice reason="unavailable" />);
    expect(screen.getByText(/Location unavailable/i)).toBeInTheDocument();

    rerender(<NavigationPermissionNotice reason="timeout" />);
    expect(screen.getByText(/taking a while/i)).toBeInTheDocument();

    rerender(<NavigationPermissionNotice reason="poor-accuracy" />);
    expect(screen.getByText(/accuracy is low/i)).toBeInTheDocument();

    rerender(<NavigationPermissionNotice reason="non-secure-context" />);
    expect(screen.getByText(/Secure connection required/i)).toBeInTheDocument();
  });

  it("always includes the honest browser-limitation tips", () => {
    render(<NavigationPermissionNotice reason="permission-denied" />);
    expect(screen.getByText(/Keep this page open/i)).toBeInTheDocument();
    expect(screen.getByText(/Keep your screen active/i)).toBeInTheDocument();
    expect(screen.getByText(/precise/i)).toBeInTheDocument();
  });

  it("invokes onRetry when provided", () => {
    const onRetry = vi.fn();
    render(<NavigationPermissionNotice reason="timeout" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
