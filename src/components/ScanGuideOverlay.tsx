"use client";

import React from "react";

type ScanGuideOverlayProps = {
  ringClassName: string;
  dotClassName: string;
  label: string;
  camReady: boolean;
  cameraError: string | null;
};

export const ScanGuideOverlay = React.memo(
  ({ ringClassName, dotClassName, label, camReady, cameraError }: ScanGuideOverlayProps) => {
    return (
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 border border-white/10 px-3 py-1.5 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-white/90">
            <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
            <span>{camReady ? label : cameraError ? "Camera unavailable" : "Starting camera..."}</span>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`relative w-[70%] max-w-[320px] aspect-square rounded-full border-[3px] transition-colors duration-200 ${ringClassName}`}
            aria-hidden
          >
            <div className="absolute inset-[7%] rounded-full border border-white/20" />
          </div>
        </div>
      </div>
    );
  }
);
