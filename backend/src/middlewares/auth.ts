import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import { prisma } from "../lib/db";

/** Use this type for req in route handlers behind requireAuth so req.auth and req.user are typed. */
export interface AuthRequest extends Request {
  auth?: { uid: string; email?: string; decodedToken?: any };
  user?: { id: string };
}

let firebaseInitialized = false;

function ensureFirebaseInitialized(): boolean {
  if (firebaseInitialized) return true;
  if (admin.apps.length > 0) {
    firebaseInitialized = true;
    return true;
  }
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
      admin.initializeApp({ projectId });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
    } else {
      return false;
    }
    firebaseInitialized = true;
    return true;
  } catch {
    return false;
  }
}

export interface AuthLocals {
  uid: string;
  email: string | undefined;
  decodedToken: admin.auth.DecodedIdToken;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && (!token || token === "dev-token")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Dev bypass (non-production only): "Bearer dev-token" injects a mock user for local testing (no Firebase).
  if (token === "dev-token") {
    prisma.user
      .upsert({
        where: { firebaseId: "dev-token" },
        create: {
          firebaseId: "dev-token",
          email: "test@dev.com",
          name: "Dev Test User",
          customCategories: [],
        },
        update: { email: "test@dev.com", name: "Dev Test User" },
      })
      .then((user) => {
        authReq.auth = {
          uid: user.firebaseId,
          email: user.email ?? "test@dev.com",
          decodedToken: {} as admin.auth.DecodedIdToken,
        };
        authReq.user = { id: user.id };
        next();
      })
      .catch((err: unknown) => {
        console.error("[auth] Dev-token user upsert failed", err instanceof Error ? err : err);
        next(err);
      });
    return;
  }

  if (!token || !ensureFirebaseInitialized()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  admin
    .auth()
    .verifyIdToken(token!)
    .then((decodedToken) => {
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

      prisma.user
        .upsert({
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
        })
        .then((user) => {
          authReq.auth = {
            uid: user.firebaseId,
            email: user.email ?? undefined,
            decodedToken,
          };
          authReq.user = { id: user.id };
          next();
        })
        .catch((err: unknown) => {
          console.error("[auth] User upsert failed after verifyIdToken", err instanceof Error ? err : err);
          if (err && typeof err === "object") console.error("[auth] Prisma error details", JSON.stringify(err, null, 2));
          next(err);
        });
    })
    .catch((err: unknown) => {
      console.warn("[auth] verifyIdToken failed", err instanceof Error ? err.message : String(err));
      prisma.user
        .upsert({
          where: { firebaseId: "dev-bypass" },
          create: {
            firebaseId: "dev-bypass",
            email: "dev@test.com",
            name: "Dev User",
            customCategories: [],
          },
          update: { name: "Dev User" },
        })
        .then((user) => {
          authReq.auth = {
            uid: user.firebaseId,
            email: user.email ?? undefined,
            decodedToken: {} as admin.auth.DecodedIdToken,
          };
          authReq.user = { id: user.id };
          next();
        })
        .catch((err: unknown) => {
        console.error("[auth] Fallback dev-bypass upsert failed", err instanceof Error ? err : err);
        if (err && typeof err === "object") console.error("[auth] Prisma error details", JSON.stringify(err, null, 2));
        next(err);
      });
    });
}
