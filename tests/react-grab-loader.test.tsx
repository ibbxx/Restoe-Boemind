// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import { ReactGrabLoader } from "@/components/dev/react-grab-loader";

const grab = vi.hoisted(() => ({
  getGlobalApi: vi.fn(),
  setOptions: vi.fn(),
}));

vi.mock("react-grab", () => ({ getGlobalApi: grab.getGlobalApi }));

describe("ReactGrabLoader", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    grab.getGlobalApi.mockReturnValue({ setOptions: grab.setOptions });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("loads automatically without UI and preserves the native Cmd/Ctrl+C shortcut", async () => {
    const { container } = render(<ReactGrabLoader />);
    expect(container.firstChild).toBeNull();
    await waitFor(() => expect(grab.setOptions).toHaveBeenCalledOnce());
    expect(grab.setOptions).toHaveBeenCalledWith({ freezeReactUpdates: false });
  });

  it("does not initialize outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<ReactGrabLoader />);
    expect(grab.getGlobalApi).not.toHaveBeenCalled();
  });
});
