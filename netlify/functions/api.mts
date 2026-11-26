import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { route } from "../lib/core.mjs";

export default async (req: Request, _context: Context) => {
  const store = getStore({ name: "isvm", consistency: "strong" });
  return route(store, req);
};

export const config: Config = {
  path: "/api/*",
  excludedPath: ["/api/admin/login"],
};
