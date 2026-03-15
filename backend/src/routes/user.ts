import { Router, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";

const router = Router();

router.put("/profile", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { displayName, avatarUrl } = req.body as { displayName?: string | null; avatarUrl?: string | null };

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(displayName !== undefined && { displayName: displayName ?? null }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl ?? null }),
      },
    });

    res.status(200).json({
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Profile update failed";
    res.status(500).json({ error: message });
  }
});

export default router;
