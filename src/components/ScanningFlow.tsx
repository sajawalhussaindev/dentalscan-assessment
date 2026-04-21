"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  ActiveScanningSection,
  CameraErrorBanner,
  CompletionSection,
  ScanningHeader,
  ScanControls,
  ScanThumbnails,
} from "./ScanningFlowSections";

/**
 * CHALLENGE: SCAN ENHANCEMENT
 * 
 * Your goal is to improve the User Experience of the Scanning Flow.
 * 1. Implement a Visual Guidance Overlay (e.g., a circle or mouth outline) on the video feed.
 * 2. Add real-time feedback to the user (e.g., "Face not centered", "Move closer").
 * 3. Ensure the UI feels premium and responsive.
 */



const VIEWS = [
  { label: "Front View", instruction: "Smile and look straight at the camera." },
  { label: "Left View", instruction: "Turn your head to the left." },
  { label: "Right View", instruction: "Turn your head to the right." },
  { label: "Upper Teeth", instruction: "Tilt your head back and open wide." },
  { label: "Lower Teeth", instruction: "Tilt your head down and open wide." },
] as const;

type QualityState = "searching" | "good" | "tooClose" | "tooFar";
type CameraFacing = "user" | "environment";

const QUALITY_UI: Record<
  QualityState,
  { ringClassName: string; dotClassName: string; label: string }
> = {
  searching: {
    ringClassName: "border-zinc-400/70 shadow-[0_0_0_1px_rgba(161,161,170,0.3)_inset]",
    dotClassName: "bg-zinc-400",
    label: "Hold steady",
  },
  good: {
    ringClassName: "border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.35)]",
    dotClassName: "bg-emerald-400",
    label: "Good framing",
  },
  tooClose: {
    ringClassName: "border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.3)]",
    dotClassName: "bg-amber-400",
    label: "Move farther",
  },
  tooFar: {
    ringClassName: "border-rose-400 shadow-[0_0_30px_rgba(251,113,133,0.28)]",
    dotClassName: "bg-rose-400",
    label: "Move closer",
  },
};

const getNextQualityState = (previousState: QualityState): QualityState => {
  const roll = Math.random();

  if (previousState === "good") {
    if (roll < 0.68) return "good";
    if (roll < 0.84) return "tooClose";
    if (roll < 0.95) return "tooFar";
    return "searching";
  }

  if (roll < 0.2) return previousState;
  if (roll < 0.52) return "good";
  if (roll < 0.74) return "tooClose";
  if (roll < 0.92) return "tooFar";
  return "searching";
};

const getCameraErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission denied. Allow camera access in browser settings and try again.";
    }
    if (error.name === "NotFoundError") {
      return "No camera found on this device.";
    }
    if (error.name === "NotReadableError") {
      return "Camera is busy. Wait a moment and retry.";
    }
  }

  return "Unable to start camera. Check permissions and secure connection.";
};

const getCameraStream = async (
  cameraFacing: CameraFacing
): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: cameraFacing } },
      audio: false,
    });
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError") {
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: cameraFacing } },
          audio: false,
        });
      }
    }
    throw error;
  }
};

const getCameraStreamWithRetry = async (
  cameraFacing: CameraFacing
): Promise<MediaStream> => {
  try {
    return await getCameraStream(cameraFacing);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotReadableError") {
      await wait(650);
      return getCameraStream(cameraFacing);
    }
    throw error;
  }
};

const wait = (ms: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const DEFAULT_PATIENT_ID = "patient-demo-001";

type ThreadMessage = {
  id: string;
  threadId: string;
  content: string;
  sender: MessageSender;
  createdAt: string;
};

type UiThreadMessage = ThreadMessage & {
  clientStatus?: "pending" | "failed";
};

type MessageSender = "patient" | "dentist";

type MessagingPostResponse =
  | {
      ok: true;
      threadId: string;
      message: ThreadMessage;
      error?: never;
    }
  | {
      ok?: false;
      threadId?: string;
      message?: ThreadMessage;
      error?: string;
    };

type MessagingGetResponse = {
  threadId?: string | null;
  messages?: ThreadMessage[];
  error?: string;
};

const isValidMessagingPostResponse = (
  payload: MessagingPostResponse
): payload is { ok: true; threadId: string; message: ThreadMessage } => {
  return (
    payload.ok === true &&
    typeof payload.threadId === "string" &&
    payload.threadId.length > 0 &&
    Boolean(payload.message)
  );
};

const createOptimisticMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `optimistic-${crypto.randomUUID()}`;
  }
  return `optimistic-${Date.now()}`;
};

const normalizeServerMessages = (messages: unknown): ThreadMessage[] => {
  if (!Array.isArray(messages)) return [];
  return messages.filter((message): message is ThreadMessage => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as Partial<ThreadMessage>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.threadId === "string" &&
      typeof candidate.content === "string" &&
      (candidate.sender === "patient" || candidate.sender === "dentist") &&
      typeof candidate.createdAt === "string"
    );
  });
};

const mergeServerMessages = (
  currentMessages: UiThreadMessage[],
  serverMessages: ThreadMessage[]
): UiThreadMessage[] => {
  const serverMessageIds = new Set(serverMessages.map((message) => message.id));
  const pendingOrFailedMessages = currentMessages.filter(
    (message) =>
      message.clientStatus === "pending" ||
      (message.clientStatus === "failed" && !serverMessageIds.has(message.id))
  );

  return [...serverMessages, ...pendingOrFailedMessages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
};

const reconcileOptimisticMessage = (
  currentMessages: UiThreadMessage[],
  optimisticId: string,
  serverMessage: ThreadMessage
): UiThreadMessage[] => {
  const withoutOptimistic = currentMessages.filter(
    (message) => message.id !== optimisticId && message.id !== serverMessage.id
  );
  return [...withoutOptimistic, serverMessage].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
};



const ScanningFlow = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startRequestIdRef = useRef(0);
  const isStartingRef = useRef(false);
  const hasSubmittedCompletionRef = useRef(false);
  const hasAttemptedCompletionSubmitRef = useRef(false);
  const completionScanIdRef = useRef<string>("");
  const [camReady, setCamReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [qualityState, setQualityState] = useState<QualityState>("searching");
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("user");
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiThreadMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const stopCurrentStream = useCallback(() => {
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    const requestId = ++startRequestIdRef.current;

    if (!window.isSecureContext) {
      setCameraError("Camera needs a secure connection. Open this app over HTTPS or localhost.");
      isStartingRef.current = false;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not support camera access.");
      isStartingRef.current = false;
      return;
    }

    setCameraError(null);
    setCamReady(false);
    stopCurrentStream();
    await wait(cameraFacing === "environment" ? 420 : 180);

    try {
      const stream = await getCameraStreamWithRetry(cameraFacing);

      if (requestId !== startRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      setCamReady(true);
    } catch (err) {
      console.error("Camera access failed", err);
      setCamReady(false);
      setCameraError(getCameraErrorMessage(err));
    } finally {
      if (requestId === startRequestIdRef.current) {
        isStartingRef.current = false;
      }
    }
  }, [cameraFacing, stopCurrentStream]);

  useEffect(() => {
    startCamera();

    return () => {
      stopCurrentStream();
    };
  }, [startCamera, stopCurrentStream]);

  useEffect(() => {
    const detectMobileDevice = () => {
      const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const hasTouchSupport = navigator.maxTouchPoints > 0;
      const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(
        navigator.userAgent
      );

      setIsMobileDevice(hasCoarsePointer || hasTouchSupport || mobileUserAgent);
    };

    detectMobileDevice();

    const mediaQueryList = window.matchMedia("(pointer: coarse)");
    const handlePointerChange = () => detectMobileDevice();
    mediaQueryList.addEventListener("change", handlePointerChange);

    return () => {
      mediaQueryList.removeEventListener("change", handlePointerChange);
    };
  }, []);

  useEffect(() => {
    if (!camReady || currentStep >= VIEWS.length) return;

    const interval = setInterval(() => {
      setQualityState((previousState) => {
        const nextState = getNextQualityState(previousState);
        return nextState === previousState ? previousState : nextState;
      });
    }, 400);

    return () => clearInterval(interval);
  }, [camReady, currentStep]);

  const handleCapture = useCallback(() => {
    // Boilerplate logic for capturing a frame from the video feed
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg");
      const isFinalCapture = currentStep === VIEWS.length - 1;
      setCapturedImages((prev) => [...prev, dataUrl]);
      setCurrentStep((prev) => prev + 1);
      if (isFinalCapture) {
        stopCurrentStream();
        setCamReady(false);
      }
    }
  }, [currentStep, stopCurrentStream]);

  const submitScanCompletion = useCallback(async () => {
    if (
      hasSubmittedCompletionRef.current ||
      hasAttemptedCompletionSubmitRef.current ||
      isSubmittingCompletion
    ) {
      return;
    }

    hasAttemptedCompletionSubmitRef.current = true;

    setSubmitError(null);
    setSubmitSuccessMessage(null);
    setIsSubmittingCompletion(true);

    try {
      if (!completionScanIdRef.current) {
        completionScanIdRef.current =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `scan-${Date.now()}`;
      }

      const response = await fetch("/api/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scanId: completionScanIdRef.current,
          status: "completed",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to trigger completion notification.");
      }

      const data: { message?: string } = await response.json();
      hasSubmittedCompletionRef.current = true;
      setSubmitSuccessMessage(data.message ?? "Clinic has been notified.");
    } catch (error) {
      console.error("Scan completion submit error", error);
      setSubmitError("We could not notify the clinic. Please retry.");
    } finally {
      setIsSubmittingCompletion(false);
    }
  }, [isSubmittingCompletion]);

  useEffect(() => {
    const hasCompletedAllSteps = currentStep >= VIEWS.length;
    const hasAllCapturedImages = capturedImages.length >= VIEWS.length;

    if (hasCompletedAllSteps && hasAllCapturedImages) {
      void submitScanCompletion();
    }
  }, [capturedImages.length, currentStep, submitScanCompletion]);

  useEffect(() => {
    if (currentStep >= VIEWS.length) {
      stopCurrentStream();
      setCamReady(false);
    }
  }, [currentStep, stopCurrentStream]);

  useEffect(() => {
    if (currentStep < VIEWS.length) return;

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      setMessageError(null);

      try {
        const query = threadId
          ? `threadId=${encodeURIComponent(threadId)}`
          : `patientId=${encodeURIComponent(DEFAULT_PATIENT_ID)}`;
        const response = await fetch(`/api/messaging?${query}`);
        if (!response.ok) {
          throw new Error("Failed to load message history.");
        }

        const data: MessagingGetResponse = await response.json();
        if (typeof data.threadId === "string" && data.threadId.length > 0) {
          setThreadId(data.threadId);
        }
        const fetchedMessages = normalizeServerMessages(data.messages);
        setMessages((previous) => mergeServerMessages(previous, fetchedMessages));
      } catch (error) {
        console.error("Load messages error", error);
        setMessageError("We could not load message history.");
      } finally {
        setIsLoadingMessages(false);
      }
    };

    void loadMessages();
  }, [currentStep, threadId]);

  const handleSendMessage = useCallback(async () => {
    const trimmedMessage = draftMessage.trim();
    if (!trimmedMessage || isSendingMessage) {
      return;
    }

    const optimisticId = createOptimisticMessageId();
    const optimisticMessage: UiThreadMessage = {
      id: optimisticId,
      threadId: threadId ?? "pending-thread",
      content: trimmedMessage,
      sender: "patient",
      createdAt: new Date().toISOString(),
      clientStatus: "pending",
    };

    setIsSendingMessage(true);
    setMessageError(null);
    setMessages((previous) => [...previous, optimisticMessage]);

    try {
      const response = await fetch("/api/messaging", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
          patientId: DEFAULT_PATIENT_ID,
          content: trimmedMessage,
          sender: "patient",
        }),
      });

      const payload: MessagingPostResponse = await response.json();
      if (!isValidMessagingPostResponse(payload) || !response.ok) {
        throw new Error(payload.error ?? "Failed to send message.");
      }

      setThreadId(payload.threadId);
      setMessages((previous) =>
        reconcileOptimisticMessage(previous, optimisticId, payload.message)
      );
      setDraftMessage("");
    } catch (error) {
      console.error("Send message error", error);
      setMessages((previous) =>
        previous.map((message) =>
          message.id === optimisticId
            ? { ...message, clientStatus: "failed" }
            : message
        )
      );
      setMessageError("Message was not sent. Please retry.");
    } finally {
      setIsSendingMessage(false);
    }
  }, [draftMessage, isSendingMessage, threadId]);

  return (
    <div className="flex flex-col items-center bg-gradient-to-b from-black via-zinc-950 to-black min-h-screen text-white">
      <ScanningHeader currentStep={currentStep} totalSteps={VIEWS.length} />

      <div
        className={`relative w-full overflow-hidden flex items-center justify-center border border-zinc-800/80 ${
          currentStep < VIEWS.length
            ? "max-w-md aspect-[3/4] bg-zinc-950"
            : "max-w-5xl mx-4 mt-6 rounded-3xl bg-zinc-950/70 min-h-[430px] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        }`}
      >
        {currentStep < VIEWS.length ? (
          <ActiveScanningSection
            videoRef={videoRef}
            instruction={VIEWS[currentStep].instruction}
            ringClassName={QUALITY_UI[qualityState].ringClassName}
            dotClassName={QUALITY_UI[qualityState].dotClassName}
            label={QUALITY_UI[qualityState].label}
            camReady={camReady}
            cameraError={cameraError}
          />
        ) : (
          <CompletionSection
            isSubmittingCompletion={isSubmittingCompletion}
            submitError={submitError}
            submitSuccessMessage={submitSuccessMessage}
            onRetrySubmit={() => {
              hasSubmittedCompletionRef.current = false;
              hasAttemptedCompletionSubmitRef.current = false;
              void submitScanCompletion();
            }}
            views={VIEWS}
            capturedImages={capturedImages}
            isLoadingMessages={isLoadingMessages}
            messages={messages}
            messageError={messageError}
            draftMessage={draftMessage}
            setDraftMessage={setDraftMessage}
            handleSendMessage={() => void handleSendMessage()}
            isSendingMessage={isSendingMessage}
          />
        )}
      </div>

      <ScanControls
        isMobileDevice={isMobileDevice}
        isScanning={currentStep < VIEWS.length}
        cameraFacing={cameraFacing}
        onToggleCameraFacing={() =>
          setCameraFacing((prev) => (prev === "user" ? "environment" : "user"))
        }
        onCapture={handleCapture}
        camReady={camReady}
      />

      <CameraErrorBanner cameraError={cameraError} onRetryCamera={startCamera} />

      {currentStep < VIEWS.length && (
        <ScanThumbnails
          views={VIEWS}
          capturedImages={capturedImages}
          currentStep={currentStep}
        />
      )}
    </div>
  );
};

export default ScanningFlow;
