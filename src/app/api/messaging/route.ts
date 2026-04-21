import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ALLOWED_SENDERS = new Set(["patient", "dentist"]);
const MAX_MESSAGE_LENGTH = 1000;

/**
 * CHALLENGE: MESSAGING SYSTEM
 * 
 * Your goal is to build a basic communication channel between the Patient and Dentist.
 * 1. Implement the POST handler to save a new message into a Thread.
 * 2. Implement the GET handler to retrieve message history for a given thread.
 * 3. Focus on data integrity and proper relations.
 */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const threadId = normalizeOptionalString(searchParams.get("threadId"));
    const patientId = normalizeOptionalString(searchParams.get("patientId"));

    if (!threadId && !patientId) {
      return NextResponse.json(
        { error: "Missing threadId or patientId" },
        { status: 400 }
      );
    }

    let resolvedThreadId = threadId ?? "";

    if (!resolvedThreadId && patientId) {
      const existingThread = await prisma.thread.findFirst({
        where: { patientId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });

      if (!existingThread) {
        return NextResponse.json({ threadId: null, messages: [] });
      }

      resolvedThreadId = existingThread.id;
    } else if (resolvedThreadId) {
      const existingThread = await prisma.thread.findUnique({
        where: { id: resolvedThreadId },
        select: { id: true },
      });
      if (!existingThread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
    }

    const messages = await prisma.message.findMany({
      where: { threadId: resolvedThreadId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        threadId: true,
        content: true,
        sender: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ threadId: resolvedThreadId, messages });
  } catch (err) {
    console.error("Messaging API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const {
      threadId: requestedThreadId,
      patientId,
      content,
      sender,
    }: {
      threadId?: unknown;
      patientId?: unknown;
      content?: unknown;
      sender?: unknown;
    } = body ?? {};

    const normalizedThreadId = normalizeOptionalString(requestedThreadId);
    const normalizedPatientId = normalizeOptionalString(patientId);
    const normalizedContent = normalizeOptionalString(content);
    const normalizedSender = normalizeOptionalString(sender);

    if (!normalizedContent) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }
    if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }

    if (!normalizedSender || !ALLOWED_SENDERS.has(normalizedSender)) {
      return NextResponse.json(
        { error: "Invalid sender. Use 'patient' or 'dentist'." },
        { status: 400 }
      );
    }

    if (!normalizedThreadId && !normalizedPatientId) {
      return NextResponse.json(
        { error: "Missing threadId or patientId" },
        { status: 400 }
      );
    }

    let resolvedThreadId = normalizedThreadId;

    if (resolvedThreadId) {
      const existingThread = await prisma.thread.findUnique({
        where: { id: resolvedThreadId },
        select: { id: true },
      });

      if (!existingThread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
    } else {
      const existingThread = await prisma.thread.findFirst({
        where: { patientId: normalizedPatientId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });

      if (existingThread) {
        resolvedThreadId = existingThread.id;
      } else {
        const createdThread = await prisma.thread.create({
          data: { patientId: normalizedPatientId },
          select: { id: true },
        });
        resolvedThreadId = createdThread.id;
      }
    }

    const message = await prisma.message.create({
      data: {
        threadId: resolvedThreadId!,
        content: normalizedContent,
        sender: normalizedSender,
      },
      select: {
        id: true,
        threadId: true,
        content: true,
        sender: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, threadId: resolvedThreadId, message });
  } catch (err) {
    console.error("Messaging API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
