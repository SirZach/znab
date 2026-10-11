import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

// Testing Library only cleans up by itself when the runner exposes a global
// afterEach, so it is registered here rather than relied on.
afterEach(() => {
  cleanup();
});
