import { Router, Request, Response } from "express";
import multer from "multer";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { parseReceiptImage, parseReceiptImageItemsOnly } from "../services/aiService";
import { getLastReceiptDebug, setLastReceiptDebug } from "../receipt_engine";
import { runHybridPipeline } from "../receipt_engine/hybridPipeline";
import { shareReceiptToGroup } from "../services/receiptShareService";
import { syncReceiptToPriceRecords } from "../services/priceRecordService";
import { ALL_CATEGORY_NAMES } from "../config/categories";
import { saveUserRule, type CategoryName } from "../receipt_engine/aiCategorizer";
import { parseReceiptDate } from "../receipt_engine/dateParser";
import { ReceiptVisibility } from "@prisma/client";
import { getOverpaidInsight } from "../services/overpaidInsightService";

const router = Router();

const ALLOWED_CATEGORIES_SET = new Set(ALL_CATEGORY_NAMES);

/** Normalize and validate receipt date (multi-format); return valid Date or today. */
function toValidReceiptDate(dateStr: string | undefined): Date {
  const normalized = parseReceiptDate((dateStr ?? "").trim()) ?? dateStr?.trim();
  if (normalized) {
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

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

function getShareMode(receipt: { groupId?: string | null }, user: { isCommunityOptIn?: boolean }): "GROUP" | "COMMUNITY" | "PRIVATE" {
  if (receipt.groupId) return "GROUP";
  return user.isCommunityOptIn ? "COMMUNITY" : "PRIVATE";
}

function getLatLngFromBody(body: unknown): { lat?: number; lng?: number } {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const lat = b.lat != null ? Number(b.lat) : undefined;
  const lng = b.lng != null ? Number(b.lng) : undefined;
  return { lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined };
}

async function getReceiptVisibilityForCreate(
  userId: string,
  body: unknown
): Promise<{ visibilityType: ReceiptVisibility; householdId: string | null }> {
  if (!body || typeof body !== "object") return { visibilityType: ReceiptVisibility.PERSONAL, householdId: null };
  const b = body as Record<string, unknown>;
  const visibilityRaw = typeof b.visibilityType === "string" ? b.visibilityType.trim().toLowerCase() : "";
  const householdId = typeof b.householdId === "string" ? b.householdId.trim() : "";

  if (visibilityRaw !== "household") return { visibilityType: ReceiptVisibility.PERSONAL, householdId: null };
  if (!householdId) return { visibilityType: ReceiptVisibility.PERSONAL, householdId: null };

  const membership = await prisma.householdMember.findFirst({
    where: { userId, householdId, status: "active" },
  });
  if (!membership) throw new Error("Not a member of this household");
  return { visibilityType: ReceiptVisibility.HOUSEHOLD, householdId };
}

/** Fire-and-forget: sync receipt items to PriceRecord table. Use COMMUNITY when user opted in (and not group); pass lat/lng for 30km filter. */
function triggerPriceRecordSync(
  receiptId: string,
  shareMode: "NONE" | "PRIVATE" | "GROUP" | "COMMUNITY",
  cityOrArea: string = "Unknown",
  lat?: number | null,
  lng?: number | null
): void {
  syncReceiptToPriceRecords(receiptId, shareMode, cityOrArea, lat, lng).catch((err) =>
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
    const baseUrl = `${req.protocol}://${req.get("host") ?? ""}`.replace(/\/$/, "");
    const payload = receipts.map((r) => {
      const rec = r as { imageDataBase64?: string | null; imageUrl?: string | null; [k: string]: unknown };
      const hasStoredImage = typeof rec.imageDataBase64 === "string" && rec.imageDataBase64.length > 0;
      const { imageDataBase64: _omit, ...rest } = rec;
      return {
        ...rest,
        imageUrl: hasStoredImage ? `${baseUrl}/api/receipts/${r.id}/image` : (r.imageUrl ?? null),
      };
    });
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch receipts";
    res.status(500).json({ error: message });
  }
});

/** Serve stored receipt image so Library can display it (client file:// URLs are often invalid after upload). */
router.get("/:id/image", async (req: AuthRequest, res: Response) => {
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    let receipt = await prisma.receipt.findFirst({
      where: { id, userId: user.id },
      select: { imageDataBase64: true },
    });
    if (!receipt) {
      const householdReceipt = await prisma.receipt.findFirst({
        where: { id },
        select: { imageDataBase64: true, householdId: true },
      });
      if (householdReceipt?.householdId && householdReceipt.imageDataBase64) {
        const member = await prisma.householdMember.findFirst({
          where: { userId: user.id, householdId: householdReceipt.householdId, status: "active" },
        });
        if (member) receipt = { imageDataBase64: householdReceipt.imageDataBase64 };
      }
    }
    if (!receipt?.imageDataBase64) {
      res.status(404).json({ error: "No image" });
      return;
    }
    const wantsJson = req.headers.accept?.includes("application/json");
    if (wantsJson) {
      res.setHeader("Content-Type", "application/json");
      res.json({ image: receipt.imageDataBase64 });
      return;
    }
    const buf = Buffer.from(receipt.imageDataBase64, "base64");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load image";
    res.status(500).json({ error: message });
  }
});

/** GET /:id/overpaid-insight — savings vs your history + staple benchmarks (MVP). */
router.get("/:id/overpaid-insight", async (req: AuthRequest, res: Response) => {
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const insight = await getOverpaidInsight(user.id, id);
    if (!insight) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    res.status(200).json(insight);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Overpaid insight failed";
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

    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { visibilityType, householdId } = await getReceiptVisibilityForCreate(user.id, req.body);

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
          uploadedByUserId: user.id,
          householdId,
          visibilityType,
          storeId: store.id,
          date: new Date(),
          subtotal: 0,
          tax: 0,
          total: 0,
          imageDataBase64: base64,
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
      const { lat: lat1, lng: lng1 } = getLatLngFromBody(req.body);
      triggerPriceRecordSync(receipt.id, getShareMode(receipt, user), "Unknown", lat1, lng1);
      const receiptWithItems = await prisma.receipt.findUnique({
        where: { id: receipt.id },
        include: { store: true, items: true },
      });
      res.status(201).json(receiptWithItems);
      return;
    }

    const receiptDate = toValidReceiptDate(parsed.date);

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
        uploadedByUserId: user.id,
        householdId,
        visibilityType,
        storeId: store.id,
        date: receiptDate,
        subtotal: Number(parsed.subtotal),
        tax: Number(parsed.tax),
        total: Number(parsed.total),
        imageDataBase64: base64,
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
        subcategory: (it as { subcategory?: string }).subcategory ?? null,
      })),
    });
    const { lat: latPost, lng: lngPost } = getLatLngFromBody(req.body);
    triggerPriceRecordSync(receipt.id, getShareMode(receipt, user), "Unknown", latPost, lngPost);

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

/** Native Intelligence: fully processed on-device; optional image stored for Library display. */
router.post("/from-local", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const body = req.body as {
      storeName?: string;
      total?: number;
      date?: string;
      category?: string;
      visibilityType?: string;
      householdId?: string;
      image?: string;
      storeAddress?: string;
    };
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

    const { visibilityType, householdId } = await getReceiptVisibilityForCreate(user.id, body);
    const dateStr = typeof body.date === "string" ? body.date.trim() : new Date().toISOString().slice(0, 10);
    const receiptDate = new Date(dateStr);
    const date = isNaN(receiptDate.getTime()) ? new Date() : receiptDate;
    const category = typeof body.category === "string" && body.category.trim()
      ? body.category.trim()
      : "Other";
    const rawImage = typeof body.image === "string" ? body.image.trim() : "";
    const imageBase64 = rawImage.length > 100 ? rawImage : null;
    const storeAddress = typeof body.storeAddress === "string" && body.storeAddress.trim().length > 0 ? body.storeAddress.trim() : null;
    const store = await prisma.store.upsert({
      where: { userId_name: { userId: user.id, name: storeName } },
      create: { userId: user.id, name: storeName, address: storeAddress ?? undefined },
      update: storeAddress !== null ? { address: storeAddress } : {},
    });
    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        uploadedByUserId: user.id,
        householdId,
        visibilityType,
        storeId: store.id,
        date,
        subtotal: total,
        tax: 0,
        total,
        imageDataBase64: imageBase64,
        status: "VERIFIED",
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
    const { lat: latLocal, lng: lngLocal } = getLatLngFromBody(req.body);
    triggerPriceRecordSync(receipt.id, getShareMode(receipt, user), "Unknown", latLocal, lngLocal);
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
    const body = req.body as { rawText?: string; image?: string; visibilityType?: string; householdId?: string };
    let rawText = typeof body.rawText === "string" ? body.rawText : "";
    rawText = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!rawText) {
      res.status(400).json({ error: "process-text requires rawText (OCR output)" });
      return;
    }
    const rawImage = typeof body.image === "string" ? body.image.trim() : "";
    const base64Image = rawImage.length > 100 ? rawImage : null;
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { visibilityType, householdId } = await getReceiptVisibilityForCreate(user.id, body);

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
      const date = toValidReceiptDate(parsed.date);
      const store = await prisma.store.upsert({
        where: { userId_name: { userId: user.id, name: parsed.storeName.trim() } },
        create: { userId: user.id, name: parsed.storeName.trim(), address: parsed.storeAddress ?? undefined },
        update: { address: parsed.storeAddress ?? undefined },
      });
      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          uploadedByUserId: user.id,
          householdId,
          visibilityType,
          storeId: store.id,
          date,
          subtotal: Number(parsed.subtotal),
          tax: Number(parsed.tax),
          total: Number(parsed.total),
          imageDataBase64: base64Image,
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
          subcategory: (it as { subcategory?: string }).subcategory ?? null,
        })),
      });
      const { lat: latShort, lng: lngShort } = getLatLngFromBody(req.body);
      triggerPriceRecordSync(receipt.id, getShareMode(receipt, user), "Unknown", latShort, lngShort);
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
    const date = toValidReceiptDate(result.purchaseDate);
    const receiptStatus = result.reviewStatus === "verified" ? "VERIFIED" : "NEEDS_REVIEW";
    const safeNum = (n: number) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
    const subtotal = safeNum(result.subtotal);
    const tax = safeNum(result.tax);
    const total = safeNum(result.total);

    const merchantAddress = (result as { merchantAddress?: string | null }).merchantAddress;
    const storeAddressStr = typeof merchantAddress === "string" && merchantAddress.trim().length > 0 ? merchantAddress.trim() : null;
    const store = await prisma.store.upsert({
      where: {
        userId_name: { userId: user.id, name: result.merchantName },
      },
      create: { userId: user.id, name: result.merchantName, address: storeAddressStr ?? undefined },
      update: storeAddressStr !== null ? { address: storeAddressStr } : {},
    });

    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        uploadedByUserId: user.id,
        householdId,
        visibilityType,
        storeId: store.id,
        date,
        subtotal,
        tax,
        total,
        imageDataBase64: base64Image ?? null,
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
          subcategory: it.subcategory ?? null,
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
    const { lat: latPt, lng: lngPt } = getLatLngFromBody(req.body);
    triggerPriceRecordSync(receipt.id, getShareMode(receipt, user), "Unknown", latPt, lngPt);

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

    const { image: base64, imageUrl: bodyImageUrl, localExtract: bodyLocalExtract, visibilityType: bodyVis, householdId: bodyHouseholdId } = req.body as {
      image?: string;
      imageUrl?: string;
      visibilityType?: string;
      householdId?: string;
      localExtract?: { storeName?: string; total?: number; date?: string };
    };
    if (!base64 || typeof base64 !== "string") {
      res.status(400).json({ error: "Missing or invalid 'image' base64 string in body." });
      return;
    }
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

    const { visibilityType, householdId } = await getReceiptVisibilityForCreate(user.id, {
      visibilityType: bodyVis,
      householdId: bodyHouseholdId,
    });

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
          uploadedByUserId: user.id,
          householdId,
          visibilityType,
          storeId: store.id,
          date: new Date(),
          subtotal: 0,
          tax: 0,
          total: 0,
          imageDataBase64: base64.length > 0 ? base64 : null,
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
      const { lat: latNeeds, lng: lngNeeds } = getLatLngFromBody(req.body);
      triggerPriceRecordSync(receipt.id, getShareMode(receipt, user), "Unknown", latNeeds, lngNeeds);
      const receiptWithItems = await prisma.receipt.findUnique({
        where: { id: receipt.id },
        include: { store: true, items: true },
      });
      res.status(201).json(receiptWithItems);
      return;
    }

    logAndSetReceiptDebug(parsed, "from-base64");

    const receiptDate = toValidReceiptDate(parsed.date);

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
        uploadedByUserId: user.id,
        householdId,
        visibilityType,
        storeId: store.id,
        date: receiptDate,
        subtotal: Number(parsed.subtotal),
        tax: Number(parsed.tax),
        total: Number(parsed.total),
        imageDataBase64: base64.length > 0 ? base64 : null,
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
        subcategory: (it as { subcategory?: string }).subcategory ?? null,
      })),
    });
    const { lat: latB64, lng: lngB64 } = getLatLngFromBody(req.body);
    triggerPriceRecordSync(receipt.id, getShareMode(receipt, user), "Unknown", latB64, lngB64);

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
    if (user.isCommunityOptIn) {
      triggerPriceRecordSync(receiptId, "COMMUNITY", "Unknown");
    }
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

/** PATCH /:id — update receipt date (e.g. when store format was wrong). */
router.patch("/:id", async (req: AuthRequest, res: Response) => {
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
    const body = (req.body ?? {}) as { date?: string };
    const dateStr = typeof body.date === "string" ? body.date.trim() : undefined;
    if (!dateStr) {
      res.status(400).json({ error: "Provide date (YYYY-MM-DD) to update" });
      return;
    }
    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, userId: user.id },
    });
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    const date = toValidReceiptDate(dateStr);
    await prisma.receipt.update({
      where: { id: receiptId },
      data: { date },
    });
    const updated = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: { store: true, items: true },
    });
    res.status(200).json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update receipt failed";
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

/** Update a receipt line item (e.g. category for item-level mapping). Optionally saves to user rules for future receipts. */
router.patch("/:id/items/:itemId", async (req: AuthRequest, res: Response) => {
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
    const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
    if (!receiptId || !itemId) {
      res.status(400).json({ error: "Receipt ID and Item ID required" });
      return;
    }
    const body = (req.body || {}) as { category?: string; subcategory?: string; name?: string; rawName?: string };
    const category =
      typeof body.category === "string" && body.category.trim()
        ? (ALLOWED_CATEGORIES_SET.has(body.category.trim() as CategoryName) ? body.category.trim() : "Other")
        : undefined;
    const subcategory = typeof body.subcategory === "string" ? body.subcategory.trim() || null : undefined;
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
    const rawName = typeof body.rawName === "string" ? body.rawName.trim() : undefined;
    if (category === undefined && subcategory === undefined && name === undefined && rawName === undefined) {
      res.status(400).json({ error: "Provide at least one of category, subcategory, name, or rawName" });
      return;
    }

    const item = await prisma.item.findFirst({
      where: { id: itemId, receiptId },
      include: { receipt: true },
    });
    if (!item || item.receipt.userId !== user.id) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    const data: { category?: string; subcategory?: string | null; name?: string; rawName?: string } = {};
    if (category !== undefined) data.category = category;
    if (subcategory !== undefined) data.subcategory = subcategory;
    if (name !== undefined) data.name = name;
    if (rawName !== undefined) data.rawName = rawName;

    const updated = await prisma.item.update({
      where: { id: itemId },
      data,
    });
    if (category !== undefined) {
      try {
        saveUserRule(item.rawName || item.name, category as CategoryName);
      } catch {
        // ignore file write failure
      }
    }
    res.status(200).json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update item failed";
    res.status(500).json({ error: message });
  }
});

export default router;
