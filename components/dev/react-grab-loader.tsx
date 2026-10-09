"use client";

import { useEffect } from "react";

/** Load React Grab automatically in dev, without adding controls to the app UI. */
export function ReactGrabLoader() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let cancelled = false;
    import("react-grab")
      .then(({ getGlobalApi }) => {
        if (cancelled) return;
        const api = getGlobalApi();
        if (!api) return;

        // Keep React Grab's native Cmd/Ctrl+C shortcut and input behavior.
        // Only disable React-update freezing so an active grab cannot stall the sheet.
        api.setOptions({ freezeReactUpdates: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error("React Grab gagal dimuat:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
