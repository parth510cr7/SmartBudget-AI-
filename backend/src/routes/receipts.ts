import { Router, Request, Response } from "express";
import multer from "multer";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { parseReceiptImage, parseReceiptImageItemsOnly } from "../services/aiService";
import { getLastReceiptDebug, setLastReceiptDebug } from "../receipt_engine";
import { runHybridPipeline } from "../receipt_engine/hybridPipeline";
import { shareReceiptToGroup } from "../services/receiptShareService";
import { syncReceiptToPriceRecords } from "../services/priceRecordService";

const router = Router();

/** Log parsed summary to server console and set last receipt debug for GET /receipts/debug. */
function logAndSetReceiptDebug(parsed: {
  storeName: string;
  total: number;
  subtotal?: number;
  tax?: number;
  date?: string;
  items: { name: string; rawName?: string; totalPrice: number; category?: string }[];
}, source: "cloud" | "process-text-short" | "from-base64") {
  const itemCount = parsed.items?.length ?? 0;
  console.log(
    `[Receipt] Parsed (${source}): store="${parsed.storeName}" total=$${Number(parsed.total).toFixed(2)} items=${itemCount}`
  );
  setLastReceiptDebug({
    timestamp: new Date().toISOString(),
    source: "from-base64",
    storeName: parsed.storeName,
    subtotal: Number(parsed.subtotal ?? parsed.total),
    tax: Number(parsed.tax ?? 0),
    chosenTotal: Number(parsed.total),
    date: parsed.date,
    itemCount,
    sumOfItemPrices: parsed.items?.reduce((s, i) => s + (i.totalPrice ?? 0), 0),
    extractionSource: "cloud",
    items: parsed.items?.map((i) => ({
      name: i.name,
      rawName: i.rawName ?? i.name,
      totalPrice: i.totalPrice ?? 0,
      category: i.category ?? "Other",
    })),
  });
}

/** Debug: last receipt pipeline snapshot (raw OCR, normalized lines, total candidates, chosen total, items). */
router.get("/debug", async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = getLastReceiptDebug();
    if (!snapshot) {
      res.status(404).json({ error: "No receipt processed yet. Scan or upload a receipt first." });
      return;
    }
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get debug snapshot" });
  }
});

/** Fire-and-forget: sync receipt items to PriceRecord table. Group receipts → GROUP; else PRIVATE. Future: reviewBeforeSync / excludedCategories can gate or filter here. */
function triggerPriceRecordSync(
  receiptId: string,
  shareMode: "NONE" | "PRIVATE" | "GROUP" | "COMMUNITY" = "NONE",
  cityOrArea: string = "Unknown"
): void {
  syncReceiptToPriceRecords(receiptId, shareMode, cityOrArea).catch((err) =>
    console.error("PriceRecord sync failed for receipt", receiptId, err)
  );
}

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
    const searchRaw = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const search = searchRaw.toLowerCase();
    // store + items required for Library and any consumer that needs price/item data
    let receipts = await prisma.receipt.findMany({
      where: { userId: user.id },
      include: { store: true, items: true },
      orderBy: { date: "desc" },
    });
    if (search.length > 0) {
      receipts = receipts.filter((r) => {
        const storeName = (r.store?.name ?? "").toLowerCase();
        if (storeName.includes(search)) return true;
        for (const item of r.items) {
          const name = ((item.name ?? item.rawName) ?? "").toLowerCase();
          if (name.includes(search)) return true;
        }
        return false;
      });
    }
    res.json(receipts);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch receipts";
    res.status(500).json({ error: message });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error("Only image files (jpeg, png, gif, webp) are allowed"));
  },
});

router.post("/", upload.single("image"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: "No image file provided. Use multipart field 'image'." });
      return;
    }

    const base64 = file.buffer.toString("base64");
    const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl : null;

    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let parsed: Awaited<ReturnType<typeof parseReceiptImage>>;
    try {
      parsed = await parseReceiptImage(base64);
    } catch (aiErr) {
      console.error("AI parsing failed (receipt upload):", aiErr);
      const store = await prisma.store.upsert({
        where: {
          userId_name: { userId: user.id, name: "Pending Review" },
        },
        create: {
          userId: user.id,
          name: "Pending Review",
        },
        update: {},
      });
      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          storeId: store.id,
          date: new Date(),
          subtotal: 0,
          tax: 0,
          total: 0,
          imageUrl,
          status: "NEEDS_REVIEW",
        },
      });
      await prisma.item.createMany({
        data: [
          {
            receiptId: receipt.id,
            name: "Pending Review",
            rawName: "Pending Review",
            quantity: 1,
            unit: "item",
            unitPrice: 0,
            totalPrice: 0,
            category: "Uncategorized",
          },
        ],
      });
      triggerPriceRecordSync(receipt.id, receipt.groupId ? "GROUP" : "PRIVATE", "Unknown");
      const receiptWithItems = await prisma.receipt.findUnique({
        where: { id: receipt.id },
        include: { store: true, items: true },
      });
      res.status(201).json(receiptWithItems);
      return;
    }

    const receiptDate = new Date(parsed.date);
    if (isNaN(receiptDate.getTime())) {
      res.status(400).json({ error: "Invalid receipt date from AI" });
      return;
    }

    logAndSetReceiptDebug(parsed, "cloud");

    const store = await prisma.store.upsert({
      where: {
        userId_name: { userId: user.id, name: parsed.storeName.trim() },
      },
      create: {
        userId: user.id,
        name: parsed.storeName.trim(),
        address: parsed.storeAddress ?? undefined,
      },
      update: {
        address: parsed.storeAddress ?? undefined,
      },
    });

    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        storeId: store.id,
        date: receiptDate,
        subtotal: Number(parsed.subtotal),
        tax: Number(parsed.tax),
        total: Number(parsed.total),
        imageUrl,
        status: "VERIFIED",
        extractionSource: "cloud",
      },
    });

    await prisma.item.createMany({
      data: parsed.items.map((it) => ({
        receiptId: receipt.id,
        name: it.name,
        rawName: it.rawName ?? it.name,
        quantity: Number(it.quantity),
        unit: (it as { unit?: string }).unit?.trim() || "item",
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
        category: it.category ?? "Other",
      })),
    });
    triggerPriceRecordSync(receipt.id, receipt.groupId ? "GROUP" : "PRIVATE", "Unknown");

    const receiptWithItems = await prisma.receipt.findUnique({
      where: { id: receipt.id },
      include: { store: true, items: true },
    });

    res.status(201).json(receiptWithItems);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Receipt processing failed";
    const isClient = message.includes("Invalid") || message.includes("No image") || message.includes("Only image");
    res.status(isClient ? 400 : 500).json({ error: message });
  }
});

/** Native Intelligence: fully processed on-device; no image, no Cloud AI. */
router.post("/from-local", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const body = req.body as { storeName?: string; total?: number; date?: string; category?: string };
    const storeName = typeof body.storeName === "string" ? body.storeName.trim() : "";
    const total = typeof body.total === "number" ? body.total : 0;
    if (!storeName || total <= 0) {
      res.status(400).json({ error: "from-local requires storeName and total" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const dateStr = typeof body.date === "string" ? body.date.trim() : new Date().toISOString().slice(0, 10);
    const receiptDate = new Date(dateStr);
    const date = isNaN(receiptDate.getTime()) ? new Date() : receiptDate;
    const category = typeof body.category === "string" && body.category.trim()
      ? body.category.trim()
      : "Other";
    const store = await prisma.store.upsert({
      where: { userId_name: { userId: user.id, name: storeName } },
      create: { userId: user.id, name: storeName },
      update: {},
    });
    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        storeId: store.id,
        date,
        subtotal: total,
        tax: 0,
        total,
        status: "NEEDS_REVIEW",
        extractionSource: "local",
      },
    });
    await prisma.item.createMany({
      data: [
        {
          receiptId: receipt.id,
          name: "Receipt",
          rawName: "Fully Processed On-Device",
          quantity: 1,
          unit: "item",
          unitPrice: total,
          totalPrice: total,
          category,
        },
      ],
    });
    triggerPriceRecordSync(receipt.id, receipt.groupId ? "GROUP" : "PRIVATE", "Unknown");
    const receiptWithItems = await prisma.receipt.findUnique({
      where: { id: receipt.id },
      include: { store: true, items: true },
    });
    res.status(201).json(receiptWithItems);
  } catch (err) {
    const message = err instanceof Error ? err.message : "from-local failed";
    res.status(500).json({ error: message });
  }
});

/** Short-OCR safety: do not run local parser on suspiciously short OCR; go straight to cloud when image is provided. */
const PROCESS_TEXT_MIN_LINES = 5;
const PROCESS_TEXT_MIN_CHARS = 150;

/** Hybrid pipeline: OCR text → confidence scoring → optional local repair → optional cloud fallback. Optional body.image (base64) triggers cloud when confidence is low. */
router.post("/process-text", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const body = req.body as { rawText?: string; image?: string };
    let rawText = typeof body.rawText === "string" ? body.rawText : "";
    rawText = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!rawText) {
      res.status(400).json({ error: "process-text requires rawText (OCR output)" });
      return;
    }
    const base64Image = typeof body.image === "string" && body.image.trim().length > 0 ? body.image.trim() : null;
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const lineCount = rawText.split(/\n/).filter((l) => l.trim().length > 0).length;
    const charCount = rawText.length;
    const suspiciouslyShort = lineCount < PROCESS_TEXT_MIN_LINES || charCount < PROCESS_TEXT_MIN_CHARS;
    const hasTotalLine = /\b(?:total|amount\s+due|grand\s+total|balance\s+due)\s*\$?\s*\d/i.test(rawText);
    const possiblyTruncated = !hasTotalLine && lineCount >= 3;
    if (base64Image && (suspiciouslyShort || possiblyTruncated)) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[process-text] Using cloud: ${suspiciouslyShort ? "short OCR" : "no total line (possibly truncated)"} (lines=${lineCount} chars=${charCount}).`);
      }
      const parsed = await parseReceiptImage(base64Image);
      logAndSetReceiptDebug(parsed, "process-text-short");
      const receiptDate = new Date(parsed.date);
      const date = isNaN(receiptDate.getTime()) ? new Date() : receiptDate;
      const store = await prisma.store.upsert({
        where: { userId_name: { userId: user.id, name: parsed.storeName.trim() } },
        create: { userId: user.id, name: parsed.storeName.trim(), address: parsed.storeAddress ?? undefined },
        update: { address: parsed.storeAddress ?? undefined },
      });
      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          storeId: store.id,
          date,
          subtotal: Number(parsed.subtotal),
          tax: Number(parsed.tax),
          total: Number(parsed.total),
          status: "VERIFIED",
          extractionSource: "cloud",
          pipelineDebug: {
            shortOcrBypass: true,
            rawOcrLines: lineCount,
            rawOcrChars: charCount,
            cloudFallbackTriggered: true,
          } as object,
        },
      });
      await prisma.item.createMany({
        data: parsed.items.map((it) => ({
          receiptId: receipt.id,
          name: it.name,
          rawName: it.rawName ?? it.name,
          quantity: Number(it.quantity) || 1,
          unit: (it as { unit?: string }).unit?.trim() || "item",
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
          category: it.category ?? "Other",
        })),
      });
      triggerPriceRecordSync(receipt.id, receipt.groupId ? "GROUP" : "PRIVATE", "Unknown");
      const receiptWithItems = await prisma.receipt.findUnique({
        where: { id: receipt.id },
        include: { store: true, items: true },
      });
      return res.status(201).json({
        ...receiptWithItems,
        needsReview: false,
        totalConfidence: "high",
        extractionSource: "cloud",
      });
    }

    const { result, pipelineDebug } = await runHybridPipeline(rawText, base64Image);
    const receiptDate = new Date(result.purchaseDate);
    const date = isNaN(receiptDate.getTime()) ? new Date() : receiptDate;
    const receiptStatus = result.reviewStatus === "verified" ? "VERIFIED" : "NEEDS_REVIEW";
    const safeNum = (n: number) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
    const subtotal = safeNum(result.subtotal);
    const tax = safeNum(result.tax);
    const total = safeNum(result.total);

    const store = await prisma.store.upsert({
      where: {
        userId_name: { userId: user.id, name: result.merchantName },
      },
      create: { userId: user.id, name: result.merchantName },
      update: {},
    });

    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        storeId: store.id,
        date,
        subtotal,
        tax,
        total,
        status: receiptStatus,
        extractionSource: result.extractionSource,
        pipelineDebug: pipelineDebug as object,
      },
    });

    const itemsToCreate = result.items.length > 0
      ? result.items.map((it) => ({
          receiptId: receipt.id,
          name: String(it.normalizedName ?? it.rawText ?? "").trim() || "Item",
          rawName: String(it.rawText ?? it.normalizedName ?? "").trim() || "Item",
          quantity: safeNum(it.quantity) || 1,
          unit: (it.unit?.trim() || "item") as string,
          unitPrice: safeNum(it.unitPrice),
          totalPrice: safeNum(it.totalPrice),
          category: (it.category ?? "Other").trim() || "Other",
        }))
      : [
          {
            receiptId: receipt.id,
            name: "Receipt",
            rawName: "Processed by Receipt Engine",
            quantity: 1,
            unit: "item",
            unitPrice: total,
            totalPrice: total,
            category: "Other",
          },
        ];

    await prisma.item.createMany({ data: itemsToCreate });
    triggerPriceRecordSync(receipt.id, receipt.groupId ? "GROUP" : "PRIVATE", "Unknown");

    const receiptWithItems = await prisma.receipt.findUnique({
      where: { id: receipt.id },
      include: { store: true, items: true },
    });
    const payload = receiptWithItems ?? {
      id: receipt.id,
      store: { name: result.merchantName },
      total,
      items: [],
      storeId: store.id,
      userId: user.id,
      date,
      subtotal,
      tax,
      status: receiptStatus,
      imageUrl: null,
      createdAt: new Date(),
      groupId: null,
      extractionSource: result.extractionSource,
      pipelineDebug,
    };
    res.status(201).json({
      ...payload,
      needsReview: result.reviewStatus === "needs_review",
      totalConfidence: result.overallConfidence,
      extractionSource: result.extractionSource,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "process-text failed";
    res.status(500).json({ error: message });
  }
});

router.post("/from-base64", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { image: base64, imageUrl: bodyImageUrl, localExtract: bodyLocalExtract } = req.body as {
      image?: string;
      imageUrl?: string;
      localExtract?: { storeName?: string; total?: number; date?: string };
    };
    if (!base64 || typeof base64 !== "string") {
      res.status(400).json({ error: "Missing or invalid 'image' base64 string in body." });
      return;
    }
    const imageUrl = typeof bodyImageUrl === "string" ? bodyImageUrl : null;
    const localExtract =
      bodyLocalExtract &&
      typeof bodyLocalExtract.storeName === "string" &&
      typeof bodyLocalExtract.total === "number" &&
      bodyLocalExtract.total > 0
        ? {
            storeName: bodyLocalExtract.storeName.trim(),
            total: bodyLocalExtract.total,
            date: typeof bodyLocalExtract.date === "string" ? bodyLocalExtract.date.trim() : undefined,
          }
        : null;

    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let parsed: Awaited<ReturnType<typeof parseReceiptImage>>;
    try {
      if (localExtract) {
        const items = await parseReceiptImageItemsOnly(base64, localExtract);
        parsed = {
          storeName: localExtract.storeName,
          total: localExtract.total,
          date: localExtract.date ?? new Date().toISOString().slice(0, 10),
          subtotal: localExtract.total,
          tax: 0,
          items,
        };
      } else {
        parsed = await parseReceiptImage(base64);
      }
    } catch (aiErr) {
      console.error("AI parsing failed (receipt from-base64):", aiErr);
      const store = await prisma.store.upsert({
        where: {
          userId_name: { userId: user.id, name: "Pending Review" },
        },
        create: {
          userId: user.id,
          name: "Pending Review",
        },
        update: {},
      });
      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          storeId: store.id,
          date: new Date(),
          subtotal: 0,
          tax: 0,
          total: 0,
          imageUrl,
          status: "NEEDS_REVIEW",
          extractionSource: "cloud",
        },
      });
      await prisma.item.createMany({
        data: [
          {
            receiptId: receipt.id,
            name: "Pending Review",
            rawName: "Pending Review",
            quantity: 1,
            unit: "item",
            unitPrice: 0,
            totalPrice: 0,
            category: "Uncategorized",
          },
        ],
      });
      triggerPriceRecordSync(receipt.id, receipt.groupId ? "GROUP" : "PRIVATE", "Unknown");
      const receiptWithItems = await prisma.receipt.findUnique({
        where: { id: receipt.id },
        include: { store: true, items: true },
      });
      res.status(201).json(receiptWithItems);
      return;
    }

    logAndSetReceiptDebug(parsed, "from-base64");

    const receiptDate = new Date(parsed.date);
    if (isNaN(receiptDate.getTime())) {
      res.status(400).json({ error: "Invalid receipt date from AI" });
      return;
    }

    const store = await prisma.store.upsert({
      where: {
        userId_name: { userId: user.id, name: parsed.storeName.trim() },
      },
      create: {
        userId: user.id,
        name: parsed.storeName.trim(),
        address: parsed.storeAddress ?? undefined,
      },
      update: {
        address: parsed.storeAddress ?? undefined,
      },
    });

    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        storeId: store.id,
        date: receiptDate,
        subtotal: Number(parsed.subtotal),
        tax: Number(parsed.tax),
        total: Number(parsed.total),
        imageUrl,
        status: "VERIFIED",
        extractionSource: localExtract ? "local" : "cloud",
      },
    });

    await prisma.item.createMany({
      data: parsed.items.map((it) => ({
        receiptId: receipt.id,
        name: it.name,
        rawName: it.rawName ?? it.name,
        quantity: Number(it.quantity),
        unit: (it as { unit?: string }).unit?.trim() || "item",
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
        category: it.category ?? "Other",
      })),
    });
    triggerPriceRecordSync(receipt.id, receipt.groupId ? "GROUP" : "PRIVATE", "Unknown");

    const receiptWithItems = await prisma.receipt.findUnique({
      where: { id: receipt.id },
      include: { store: true, items: true },
    });

    res.status(201).json(receiptWithItems);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Receipt processing failed";
    const isClient = message.includes("Invalid") || message.includes("Missing") || message.includes("No image");
    res.status(isClient ? 400 : 500).json({ error: message });
  }
});

router.post("/:id/share-to-group", async (req: AuthRequest, res: Response) => {
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
    const receiptId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const groupId = typeof req.body?.groupId === "string" ? req.body.groupId.trim() : "";
    const participantIds = Array.isArray(req.body?.participantIds)
      ? req.body.participantIds.filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "")
      : undefined;

    if (!receiptId || !groupId) {
      res.status(400).json({ error: "receiptId and groupId are required" });
      return;
    }

    const result = await shareReceiptToGroup(receiptId, groupId, user.id, participantIds);
    res.status(200).json({
      success: true,
      expenseId: result.expenseId,
      alreadyShared: result.alreadyShared,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Share failed";
    const isClient =
      message.includes("not found") ||
      message.includes("Not a member") ||
      message.includes("must be positive") ||
      message.includes("participant");
    const safe = message.includes("Invalid `") || message.includes("Prisma") ? "Could not split this receipt with the group." : message;
    res.status(isClient ? 400 : 500).json({ error: safe });
  }
});

router.patch("/:id/group", async (req: AuthRequest, res: Response) => {
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
    const receiptId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const groupId = req.body?.groupId === null || req.body?.groupId === undefined
      ? null
      : typeof req.body?.groupId === "string" ? req.body.groupId : null;

    if (groupId !== null) {
      const group = await prisma.group.findFirst({
        where: {
          id: groupId,
          OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
        },
      });
      if (!group) {
        res.status(400).json({ error: "Group not found or access denied" });
        return;
      }
    }

    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, userId: user.id },
    });
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }

    await prisma.receipt.update({
      where: { id: receiptId },
      data: { groupId },
    });
    res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    res.status(500).json({ error: message });
  }
});

/** Mark a receipt as verified (expedite pending review). Only for receipts that are NEEDS_REVIEW and belong to the user. */
router.patch("/:id/approve", async (req: AuthRequest, res: Response) => {
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
    const receiptId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!receiptId) {
      res.status(400).json({ error: "Receipt ID required" });
      return;
    }

    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, userId: user.id },
    });
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (receipt.status !== "NEEDS_REVIEW") {
      res.status(400).json({ error: "Receipt is already verified or not pending review" });
      return;
    }

    await prisma.receipt.update({
      where: { id: receiptId },
      data: { status: "VERIFIED" },
    });
    const updated = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: { store: true, items: true },
    });
    res.status(200).json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approve failed";
    res.status(500).json({ error: message });
  }
});

export default router;
