import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { route } from "../lib/core.mjs";

// Вход в админку вынесен отдельно, чтобы ограничить частоту попыток подбора пароля.
export default async (req: Request, _context: Context) => {
  const store = getStore({ name: "isvm", consistency: "strong" });
  return route(store, req);
};

export const config: Config = {
  path: "/api/admin/login",
  method: ["POST"],
  rateLimit: {
    windowLimit: 8,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
