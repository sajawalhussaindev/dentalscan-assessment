import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ALLOWED_SCAN_STATUSES = new Set(["pending", "completed", "failed"]);
const SIMULATED_TWILIO_FROM = "+15005550006";
const SIMULATED_CLINIC_DESTINATION = "+15005550010";

/**
 * CHALLENGE: NOTIFICATION SYSTEM
 * 
 * Your goal is to implement a robust notification logic.
 * 1. When a scan is "completed", create a record in the Notification table.
 * 2. Return a success status to the client.
 * 3. Bonus: Handle potential errors (e.g., database connection issues).
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scanId, status } = body as { scanId?: string; status?: string };

    if (!scanId || typeof scanId !== "string") {
      return NextResponse.json({ error: "Missing or invalid scanId" }, { status: 400 });
    }

    if (!status || typeof status !== "string") {
      return NextResponse.json({ error: "Missing or invalid status" }, { status: 400 });
    }

    const normalizedStatus = status.toLowerCase();
    if (!ALLOWED_SCAN_STATUSES.has(normalizedStatus)) {
      return NextResponse.json(
        { error: "Invalid status. Use pending, completed, or failed." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.scan.upsert({
        where: { id: scanId },
        update: {
          status: normalizedStatus,
        },
        create: {
          id: scanId,
          status: normalizedStatus,
          images: "",
        },
      });

      if (normalizedStatus !== "completed") {
        return { notificationId: null, notificationCreated: false };
      }

      const completionMessage = `Patient scan ${scanId} has been uploaded and is ready for telehealth review.`;

      const existingNotification = await tx.notification.findUnique({
        where: { scanId },
        select: { id: true },
      });

      const notification = await tx.notification.upsert({
        where: { scanId },
        create: {
          userId: "clinic-demo",
          scanId,
          title: "Scan Completed",
          message: completionMessage,
          read: false,
        },
        update: {},
        select: { id: true },
      });

      return {
        notificationId: notification.id,
        notificationCreated: existingNotification === null,
      };
    });

    if (normalizedStatus === "completed") {
      if (result.notificationCreated) {
        void dispatchSimulatedClinicAlert({
          scanId,
          to: SIMULATED_CLINIC_DESTINATION,
          from: SIMULATED_TWILIO_FROM,
          body: `Patient scan ${scanId} has been uploaded and is ready for telehealth review.`,
        }).catch((dispatchError) => {
          console.error("Simulated alert dispatch error:", dispatchError);
        });
      }

      return NextResponse.json({
        ok: true,
        notificationId: result.notificationId,
        providerDispatchStatus: result.notificationCreated ? "queued" : "skipped_duplicate",
        message: result.notificationCreated
          ? "Notification triggered"
          : "Notification already exists for this scan. Provider dispatch skipped.",
      });
    }

    return NextResponse.json({
      ok: true,
      message: "No notification triggered for this status.",
    });
  } catch (err) {
    console.error("Notification API Error:", err);

    if (isMissingNotificationTableError(err)) {
      return NextResponse.json(
        {
          error:
            "Notification storage is not initialized. Run `npx prisma db push` in starter-kit, then retry.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = (searchParams.get("userId") ?? "clinic-demo").trim();
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        title: true,
        message: true,
        read: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ notifications });
  } catch (err) {
    console.error("Notification API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { notificationId, read } = body as {
      notificationId?: string;
      read?: boolean;
    };

    if (!notificationId || typeof notificationId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid notificationId" },
        { status: 400 }
      );
    }

    if (typeof read !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid read value" },
        { status: 400 }
      );
    }

    const notification = await prisma.notification.update({
      where: { id: notificationId },
      data: { read },
      select: {
        id: true,
        userId: true,
        title: true,
        message: true,
        read: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, notification });
  } catch (err) {
    console.error("Notification API Error:", err);

    if (isRecordNotFoundError(err)) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function isMissingNotificationTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2025"
  );
}

type SimulatedTwilioDispatchRequest = {
  scanId: string;
  to: string;
  from: string;
  body: string;
};

type SimulatedTwilioDispatchResult = {
  provider: "twilio";
  sid: string;
  status: "queued";
  to: string;
  from: string;
  body: string;
  createdAt: string;
};

async function dispatchSimulatedClinicAlert(
  input: SimulatedTwilioDispatchRequest
): Promise<SimulatedTwilioDispatchResult> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const dispatchResult: SimulatedTwilioDispatchResult = {
    provider: "twilio",
    sid: createSimulatedTwilioSid(input.scanId),
    status: "queued",
    to: input.to,
    from: input.from,
    body: input.body,
    createdAt: new Date().toISOString(),
  };

  console.info("[SimulatedTwilioDispatch]", dispatchResult);
  return dispatchResult;
}

function createSimulatedTwilioSid(seed: string): string {
  const normalizedSeed = seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).padEnd(24, "0");
  return `SM${normalizedSeed}`;
}
