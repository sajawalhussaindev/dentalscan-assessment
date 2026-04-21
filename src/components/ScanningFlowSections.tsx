"use client";

import React from "react";
import { Camera, CheckCircle2, RefreshCw } from "lucide-react";
import { ScanGuideOverlay } from "./ScanGuideOverlay";

type ViewItem = {
  label: string;
  instruction: string;
};

type MessageSender = "patient" | "dentist";

type UiThreadMessage = {
  id: string;
  threadId: string;
  content: string;
  sender: MessageSender;
  createdAt: string;
  clientStatus?: "pending" | "failed";
};

type ActiveScanningSectionProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  instruction: string;
  ringClassName: string;
  dotClassName: string;
  label: string;
  camReady: boolean;
  cameraError: string | null;
};

export const ScanningHeader = ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => (
  <div className="p-4 w-full bg-zinc-900 border-b border-zinc-800 flex justify-between">
    <h1 className="font-bold text-blue-400">DentalScan AI</h1>
    <span className="text-xs text-zinc-500">
      Step {currentStep + 1}/{totalSteps}
    </span>
  </div>
);

export const ActiveScanningSection = ({
  videoRef,
  instruction,
  ringClassName,
  dotClassName,
  label,
  camReady,
  cameraError,
}: ActiveScanningSectionProps) => (
  <>
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover grayscale opacity-80"
    />

    <ScanGuideOverlay
      ringClassName={ringClassName}
      dotClassName={dotClassName}
      label={label}
      camReady={camReady}
      cameraError={cameraError}
    />

    <div className="absolute bottom-10 left-0 right-0 p-6 bg-gradient-to-t from-black to-transparent text-center">
      <p className="text-sm font-medium">{instruction}</p>
    </div>
  </>
);

type CompletionSectionProps = {
  isSubmittingCompletion: boolean;
  submitError: string | null;
  submitSuccessMessage: string | null;
  onRetrySubmit: () => void;
  views: readonly ViewItem[];
  capturedImages: string[];
  isLoadingMessages: boolean;
  messages: UiThreadMessage[];
  messageError: string | null;
  draftMessage: string;
  setDraftMessage: (value: string) => void;
  handleSendMessage: () => void;
  isSendingMessage: boolean;
};

export const CompletionSection = ({
  isSubmittingCompletion,
  submitError,
  submitSuccessMessage,
  onRetrySubmit,
  views,
  capturedImages,
  isLoadingMessages,
  messages,
  messageError,
  draftMessage,
  setDraftMessage,
  handleSendMessage,
  isSendingMessage,
}: CompletionSectionProps) => (
  <div className="w-full h-full p-5 md:p-7 flex flex-col lg:flex-row gap-5">
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:flex-1">
      <div className="text-center lg:text-left">
        <CheckCircle2 size={46} className="text-green-500 mx-auto lg:mx-0 mb-3" />
        <h2 className="text-xl font-bold">Scan Complete</h2>
        <p className="text-zinc-400 mt-2 text-sm max-w-sm mx-auto lg:mx-0">
          {isSubmittingCompletion
            ? "Uploading results..."
            : submitError
            ? "Upload interrupted."
            : "Upload complete. A clinic provider can now review your scan."}
        </p>
        {submitError && (
          <button
            onClick={onRetrySubmit}
            className="mt-3 rounded-full border border-rose-400/60 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/10 transition-colors"
          >
            Retry notification
          </button>
        )}
        {submitSuccessMessage && (
          <p className="mt-2 text-xs text-emerald-300">{submitSuccessMessage}</p>
        )}
      </div>

      <div className="mt-5">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
          Captured views
        </p>
        <div className="grid grid-cols-5 gap-2">
          {views.map((view, index) => (
            <div
              key={view.label}
              className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-1"
            >
              {capturedImages[index] ? (
                <img
                  src={capturedImages[index]}
                  alt={view.label}
                  className="h-16 w-full rounded object-cover"
                />
              ) : (
                <div className="h-16 w-full rounded bg-zinc-900 flex items-center justify-center text-[10px] text-zinc-600">
                  {index + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>

    <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 lg:w-[42%] flex flex-col min-h-0">
      <h3 className="text-base font-semibold text-white">Quick message to clinic</h3>
      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
        Ask questions while your scan is being reviewed.
      </p>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 flex-1 overflow-y-auto min-h-[180px] max-h-[280px]">
        {isLoadingMessages ? (
          <p className="text-xs text-zinc-400">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No messages yet. Send a quick question to your clinic.
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  message.sender === "patient"
                    ? message.clientStatus === "failed"
                      ? "ml-auto bg-rose-500/15 border border-rose-400/40 text-rose-100"
                      : "ml-auto bg-blue-500/20 border border-blue-400/30 text-blue-100"
                    : "mr-auto bg-zinc-800 border border-zinc-700 text-zinc-100"
                }`}
              >
                <p>{message.content}</p>
                {message.clientStatus === "pending" && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-blue-200/80">
                    Sending...
                  </p>
                )}
                {message.clientStatus === "failed" && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-rose-200/85">
                    Failed to send
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {messageError && <p className="mt-2 text-xs text-rose-300">{messageError}</p>}

      <div className="mt-4 flex flex-col gap-2">
        <textarea
          value={draftMessage}
          onChange={(event) => setDraftMessage(event.target.value)}
          placeholder="Type your message..."
          rows={3}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <button
          onClick={handleSendMessage}
          disabled={isSendingMessage || draftMessage.trim().length === 0}
          className="self-end rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSendingMessage ? "Sending..." : "Send message"}
        </button>
      </div>
    </aside>
  </div>
);

type ScanControlsProps = {
  isMobileDevice: boolean;
  isScanning: boolean;
  cameraFacing: "user" | "environment";
  onToggleCameraFacing: () => void;
  onCapture: () => void;
  camReady: boolean;
};

export const ScanControls = ({
  isMobileDevice,
  isScanning,
  cameraFacing,
  onToggleCameraFacing,
  onCapture,
  camReady,
}: ScanControlsProps) => (
  <div className="p-8 w-full flex items-center justify-center gap-3">
    {isMobileDevice && isScanning && (
      <button
        onClick={onToggleCameraFacing}
        className="h-12 rounded-full border border-white/30 px-4 text-xs font-medium text-white/90 hover:bg-white/10 transition-colors flex items-center gap-2"
      >
        <RefreshCw size={14} />
        {cameraFacing === "user" ? "Use back camera" : "Use front camera"}
      </button>
    )}

    {isScanning && (
      <button
        onClick={onCapture}
        disabled={!camReady}
        className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
          <Camera className="text-black" />
        </div>
      </button>
    )}
  </div>
);

export const CameraErrorBanner = ({
  cameraError,
  onRetryCamera,
}: {
  cameraError: string | null;
  onRetryCamera: () => void;
}) =>
  cameraError ? (
    <div className="px-4 pb-2 text-center">
      <p className="text-xs text-rose-300">{cameraError}</p>
      <button
        onClick={onRetryCamera}
        className="mt-2 rounded-full border border-white/25 px-3 py-1 text-xs text-white/90 hover:bg-white/10 transition-colors"
      >
        Retry camera
      </button>
    </div>
  ) : null;

export const ScanThumbnails = ({
  views,
  capturedImages,
  currentStep,
}: {
  views: readonly ViewItem[];
  capturedImages: string[];
  currentStep: number;
}) => (
  <div className="flex gap-2 p-4 overflow-x-auto w-full">
    {views.map((view, index) => (
      <div
        key={view.label}
        className={`w-16 h-20 rounded border-2 shrink-0 ${
          index === currentStep ? "border-blue-500 bg-blue-500/10" : "border-zinc-800"
        }`}
      >
        {capturedImages[index] ? (
          <img src={capturedImages[index]} alt={view.label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-700">
            {index + 1}
          </div>
        )}
      </div>
    ))}
  </div>
);
