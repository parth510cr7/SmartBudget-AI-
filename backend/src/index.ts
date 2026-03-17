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
import medicalRouter from "./routes/medical";
import storesRouter from "./routes/stores";
import householdRouter from "./routes/household";
import { validateCloudReceiptApi } from "./services/aiService";

const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
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
app.use("/api/medical", requireAuth, medicalRouter);
app.use("/api/stores", requireAuth, storesRouter);
app.use("/api/household", requireAuth, householdRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err.message ?? "Internal server error";
  const status = msg.includes("Only image") || msg.includes("File too large") ? 400 : 500;
  res.status(status).json({ error: msg });
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
