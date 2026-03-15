import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";

const router = Router();

/** GET / — list current user's medical folders */
router.get("/", async (req: AuthRequest, res: Response) => {
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
    const folders = await prisma.medicalFolder.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { records: true, expenses: true } },
      },
    });
    res.json(
      folders.map((f) => ({
        id: f.id,
        patientName: f.patientName,
        createdAt: f.createdAt.toISOString(),
        recordsCount: f._count.records,
        expensesCount: f._count.expenses,
      }))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list medical folders";
    res.status(500).json({ error: message });
  }
});

/** POST / — create medical folder */
router.post("/", async (req: AuthRequest, res: Response) => {
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
    const patientName = typeof req.body?.patientName === "string" ? req.body.patientName.trim() : "";
    if (!patientName) {
      res.status(400).json({ error: "patientName is required" });
      return;
    }
    const folder = await prisma.medicalFolder.create({
      data: { userId: user.id, patientName },
    });
    res.status(201).json({
      id: folder.id,
      patientName: folder.patientName,
      createdAt: folder.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create medical folder";
    if (String(err).includes("Unique constraint")) {
      res.status(400).json({ error: "A folder with this patient name already exists" });
      return;
    }
    res.status(500).json({ error: message });
  }
});

/** GET /:folderId — get folder with records and expenses */
router.get("/:folderId", async (req: AuthRequest, res: Response) => {
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
    const folderId = Array.isArray(req.params.folderId) ? req.params.folderId[0] : req.params.folderId;
    const folder = await prisma.medicalFolder.findFirst({
      where: { id: folderId, userId: user.id },
      include: {
        records: { orderBy: { date: "desc" } },
        expenses: { orderBy: { date: "desc" } },
      },
    });
    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    res.json({
      id: folder.id,
      patientName: folder.patientName,
      createdAt: folder.createdAt.toISOString(),
      records: folder.records.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        date: r.date.toISOString(),
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      })),
      expenses: folder.expenses.map((e) => ({
        id: e.id,
        itemName: e.itemName,
        price: e.price,
        date: e.date.toISOString(),
        storeName: e.storeName,
        storeAddress: e.storeAddress,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get folder";
    res.status(500).json({ error: message });
  }
});

/** DELETE /:folderId — delete folder (cascades to records and expenses) */
router.delete("/:folderId", async (req: AuthRequest, res: Response) => {
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
    const folderId = Array.isArray(req.params.folderId) ? req.params.folderId[0] : req.params.folderId;
    const folder = await prisma.medicalFolder.findFirst({
      where: { id: folderId, userId: user.id },
    });
    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    await prisma.medicalFolder.delete({ where: { id: folderId } });
    res.status(200).json({ message: "Folder deleted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete folder";
    res.status(500).json({ error: message });
  }
});

/** POST /:folderId/records — add record */
router.post("/:folderId/records", async (req: AuthRequest, res: Response) => {
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
    const folderId = Array.isArray(req.params.folderId) ? req.params.folderId[0] : req.params.folderId;
    const folder = await prisma.medicalFolder.findFirst({
      where: { id: folderId, userId: user.id },
    });
    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    const type = typeof req.body?.type === "string" ? req.body.type.trim() : "Note";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const dateStr = typeof req.body?.date === "string" ? req.body.date : null;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const date = dateStr ? new Date(dateStr) : new Date();
    const record = await prisma.medicalRecord.create({
      data: { folderId, type, title, date, notes: notes ?? undefined },
    });
    res.status(201).json({
      id: record.id,
      type: record.type,
      title: record.title,
      date: record.date.toISOString(),
      notes: record.notes,
      createdAt: record.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add record";
    res.status(500).json({ error: message });
  }
});

/** POST /:folderId/expenses — add expense */
router.post("/:folderId/expenses", async (req: AuthRequest, res: Response) => {
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
    const folderId = Array.isArray(req.params.folderId) ? req.params.folderId[0] : req.params.folderId;
    const folder = await prisma.medicalFolder.findFirst({
      where: { id: folderId, userId: user.id },
    });
    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    const itemName = typeof req.body?.itemName === "string" ? req.body.itemName.trim() : "";
    const price = typeof req.body?.price === "number" ? req.body.price : Number(req.body?.price);
    const dateStr = typeof req.body?.date === "string" ? req.body.date : null;
    const storeName = typeof req.body?.storeName === "string" ? req.body.storeName : null;
    const storeAddress = typeof req.body?.storeAddress === "string" ? req.body.storeAddress : null;
    if (!itemName || !Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: "itemName and a non-negative price are required" });
      return;
    }
    const date = dateStr ? new Date(dateStr) : new Date();
    const expense = await prisma.medicalExpense.create({
      data: { folderId, itemName, price, date, storeName: storeName ?? undefined, storeAddress: storeAddress ?? undefined },
    });
    res.status(201).json({
      id: expense.id,
      itemName: expense.itemName,
      price: expense.price,
      date: expense.date.toISOString(),
      storeName: expense.storeName,
      storeAddress: expense.storeAddress,
      createdAt: expense.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add expense";
    res.status(500).json({ error: message });
  }
});

export default router;
