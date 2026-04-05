import { Router, Request, Response } from "express";
import admin from "firebase-admin";
import { prisma } from "../lib/db";

const router = Router();

function ensureFirebase(): boolean {
  if (admin.apps.length > 0) return true;
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
      admin.initializeApp({ projectId });
      return true;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * POST /auth/sync
 * Body: none. Expects Authorization: Bearer \<Firebase ID token\> from the client Firebase Auth
 * session (`user.getIdToken()` after Sign in with Apple / Google via Firebase Auth).
 * Verifies with Firebase Admin `verifyIdToken`, upserts the user, returns the user for the store.
 */
router.post("/sync", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header or token" });
  }

  if (!ensureFirebase()) {
    console.error("[auth/sync] Firebase not initialized");
    return res.status(503).json({ error: "Authentication service unavailable" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid as string;
    const email =
      typeof decodedToken.email === "string" && decodedToken.email.trim()
        ? decodedToken.email.trim()
        : `${uid}@firebase.local`;
    const name =
      typeof decodedToken.name === "string" && decodedToken.name.trim()
        ? decodedToken.name.trim()
        : (typeof decodedToken.email === "string" ? decodedToken.email.split("@")[0] : null) ?? "User";
    const avatarUrl =
      typeof decodedToken.picture === "string" && decodedToken.picture.trim()
        ? decodedToken.picture.trim()
        : null;

    const user = await prisma.user.upsert({
      where: { firebaseId: uid },
      create: {
        firebaseId: uid,
        email,
        name: name || "User",
        avatarUrl: avatarUrl ?? undefined,
        customCategories: [],
      },
      update: {
        name: name || "User",
        avatarUrl: avatarUrl ?? null,
      },
    });

    return res.status(200).json({
      user: {
        id: user.id,
        firebaseId: user.firebaseId,
        email: user.email,
        name: user.name ?? undefined,
        displayName: user.displayName ?? undefined,
        avatarUrl: user.avatarUrl ?? undefined,
      },
    });
  } catch (err) {
    console.error("[auth/sync] verify or upsert failed", err instanceof Error ? err : err);
    if (err && typeof err === "object") console.error("[auth/sync] Error details", JSON.stringify(err, null, 2));
    const message = err instanceof Error ? err.message : "Authentication failed";
    const status = message.includes("token") || message.includes("expired") ? 401 : 500;
    return res.status(status).json({ error: message });
  }
});

export default router;
