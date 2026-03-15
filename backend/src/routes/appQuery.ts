import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { runAppQuery } from "../services/appQueryService";

const router = Router();

/** POST / — app-data query: spend by store, by category, top category, recent purchase, cheapest store for item, group summary */
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const body = (req.body ?? {}) as { query?: string };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const result = await runAppQuery(user.id, query || "summary");
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "App query failed";
    res.status(500).json({ error: message });
  }
});

export default router;
