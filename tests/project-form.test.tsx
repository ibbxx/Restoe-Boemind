// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectForm } from "../components/project/project-form";
import { blankProjectForm } from "../lib/services/projects";

describe("simplified project form", () => {
  it("uses one Location / Market field and hides generated-code and notes inputs", () => {
    render(<ProjectForm mode="create" initial={blankProjectForm()} />);

    expect(document.querySelector('input[name="location_market"]')).toBeTruthy();
    expect(screen.queryByText("Project code")).toBeNull();
    expect(screen.queryByText("Market / region")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
    expect(screen.getByText("Kode proyek dibuat otomatis setelah disimpan.")).toBeTruthy();
    expect(screen.getByText("Nama proyek")).toBeTruthy();
    expect(screen.getByText("Lokasi / Pasar")).toBeTruthy();
  });
});
