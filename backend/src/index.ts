import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { requireAuth } from "./middlewares/auth";
import receiptsRouter from "./routes/receipts";
import smartlistRouter from "./routes/smartlist";
import demoRouter from "./routes/demo";
import aiRouter from "./routes/ai";
import transactionsRouter from "./routes/transactions";
import userRouter from "./routes/user";
import reportsRouter from "./routes/reports";
import groupsRouter from "./routes/groups";
import authRouter from "./routes/auth";
import expensesRouter from "./routes/expenses";
import balancesRouter from "./routes/balances";
import paymentsRouter from "./routes/payments";
import pricesRouter from "./routes/prices";
import basketRouter from "./routes/basket";
import appQueryRouter from "./routes/appQuery";
import storesRouter from "./routes/stores";
import householdRouter from "./routes/household";
import { validateCloudReceiptApi } from "./services/aiService";
import { requestContextMiddleware } from "./middlewares/requestContext";

const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(requestContextMiddleware);

app.get("/health", (_req, res) => {
  let version: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require("../package.json") as { version?: string };
    version = typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    version = null;
  }
  const gitSha =
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    null;

  // Debuggability: return non-secret DB fingerprint so clients can confirm they’re hitting the expected environment.
  const dbUrlRaw = (process.env.USE_DIRECT_URL === "1" || process.env.USE_DIRECT_URL === "true")
    ? (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "")
    : (process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "");
  let dbHost: string | null = null;
  let dbName: string | null = null;
  let dbUserHint: string | null = null;
  try {
    const u = new URL(String(dbUrlRaw).replace(/^postgresql:/i, "http:"));
    dbHost = u.hostname || null;
    dbName = (u.pathname || "").replace(/^\//, "") || null;
    const user = decodeURIComponent(u.username || "");
    dbUserHint = user ? (user.length <= 4 ? user : `${user.slice(0, 2)}…${user.slice(-2)}`) : null;
  } catch {
    dbHost = null;
    dbName = null;
    dbUserHint = null;
  }
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version,
    gitSha,
    db: { host: dbHost, name: dbName, userHint: dbUserHint },
  });
});

/** Cloud AI status (cloud providers removed; on-device-first). */
app.get("/health/cloud", async (req, res) => {
  const validate = req.query.validate === "1" || req.query.validate === "true";
  if (!validate) {
    res.status(200).json({
      cloudReceiptApi: "disabled",
      message: "Cloud AI is disabled (on-device-only mode).",
    });
    return;
  }
  const result = await validateCloudReceiptApi();
  res.status(200).json({
    cloudReceiptApi: result.ok ? "ok" : "error",
    message: result.message,
  });
});

app.use("/api/auth", authRouter);
app.use("/api/receipts", requireAuth, receiptsRouter);
app.use("/api/smartlist", requireAuth, smartlistRouter);
app.use("/api/demo", requireAuth, demoRouter);
app.use("/api/ai", requireAuth, aiRouter);
app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/user", requireAuth, userRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/groups", requireAuth, groupsRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/balances", requireAuth, balancesRouter);
app.use("/api/payments", requireAuth, paymentsRouter);
app.use("/api/prices", requireAuth, pricesRouter);
app.use("/api/basket", requireAuth, basketRouter);
app.use("/api/app-query", requireAuth, appQueryRouter);
app.use("/api/stores", requireAuth, storesRouter);
app.use("/api/household", requireAuth, householdRouter);

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err.message ?? "Internal server error";
  const status = msg.includes("Only image") || msg.includes("File too large") ? 400 : 500;
  // Note: ts-node-dev can sometimes miss Express module augmentation during dev reloads.
  // Use a safe cast to keep runtime behavior stable.
  const requestId = typeof (req as unknown as { requestId?: unknown }).requestId === "string"
    ? ((req as unknown as { requestId: string }).requestId)
    : undefined;
  res.status(status).json({
    error: msg,
    ...(requestId ? { meta: { requestId } } : {}),
  });
});

const PORT = Number(process.env.PORT) || 8080;
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: "/socket.io",
});
app.set("io", io);

io.on("connection", (socket) => {
  socket.on("join_group", (groupId: string) => {
    if (typeof groupId === "string" && groupId.trim()) socket.join(groupId.trim());
  });
});

const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`SmartBudget AI backend listening on http://${HOST}:${PORT} (reachable at http://localhost:${PORT} or http://<this-machine-ip>:${PORT})`);
});
