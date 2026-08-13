import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Node MSW server shared across the unit/component test run.
export const server = setupServer(...handlers);
