"use client";

import { useState, useCallback, useEffect } from "react";
import type { CommentAttachment } from "@/types";
import { capturePreviewScreenshot } from "@/lib/screenshot";

interface PreviewClipOverlayProps {
  onCapture: (attachment: CommentAttachment) => void;
  onCancel: () => void;
}

/**
 * Full-screen overlay that lets the user draw a bounding box over the preview
 * iframe, then clips that region as a PNG and passes it back as an attachment.
 */
export function PreviewClipOverlay({ onCapture, onCancel }: PreviewClipOverlayProps) {
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Get iframe rect for positioning the selection overlay just over the preview
  const [iframeRect, setIframeRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const iframe = document.querySelector('iframe[title="Live Preview"]') as HTMLIFrameElement;
    if (iframe) {
      setIframeRect(iframe.getBoundingClientRect());
    } else {
      // No preview iframe — cancel on next tick
      onCancel();
    }
    // Escape key to cancel
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDrawing(true);
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;
    setEnd({ x: e.clientX, y: e.clientY });
  }, [drawing]);

  const handleMouseUp = useCallback(async () => {
    if (!drawing || !start || !end || !iframeRect) return;
    setDrawing(false);

    // Calculate selection rectangle relative to iframe
    const selLeft = Math.min(start.x, end.x);
    const selTop = Math.min(start.y, end.y);
    const selWidth = Math.abs(end.x - start.x);
    const selHeight = Math.abs(end.y - start.y);

    // Minimum selection size (5px)
    if (selWidth < 5 || selHeight < 5) {
      onCancel();
      return;
    }

    setCapturing(true);

    try {
      // Capture full iframe screenshot first
      const fullScreenshot = await capturePreviewScreenshot();
      if (!fullScreenshot) {
        onCancel();
        return;
      }

      // Load the full screenshot into an image to crop it
      const img = new Image();
      img.src = fullScreenshot.data;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load screenshot"));
      });

      // Calculate crop coordinates relative to the iframe
      const cropX = Math.max(0, selLeft - iframeRect.left);
      const cropY = Math.max(0, selTop - iframeRect.top);
      const cropW = Math.min(selWidth, iframeRect.width - cropX);
      const cropH = Math.min(selHeight, iframeRect.height - cropY);

      // Scale factor: the captured image may be at device pixel ratio
      const scaleX = img.naturalWidth / iframeRect.width;
      const scaleY = img.naturalHeight / iframeRect.height;

      // Create cropped canvas
      const canvas = document.createElement("canvas");
      const dpr = window.devicePixelRatio || 1;
      canvas.width = cropW * dpr;
      canvas.height = cropH * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onCancel();
        return;
      }

      ctx.drawImage(
        img,
        cropX * scaleX,
        cropY * scaleY,
        cropW * scaleX,
        cropH * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const dataUrl = canvas.toDataURL("image/png");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

      onCapture({
        name: `preview-clip-${timestamp}.png`,
        type: "image/png",
        data: dataUrl,
      });
    } catch (err) {
      console.error("Clip capture failed:", err);
      onCancel();
    }
  }, [drawing, start, end, iframeRect, onCapture, onCancel]);

  // Selection rectangle coordinates
  const selRect = start && end ? {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  } : null;

  if (!iframeRect) {
    return null;
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: "fixed",
        left: iframeRect.left,
        top: iframeRect.top,
        width: iframeRect.width,
        height: iframeRect.height,
        zIndex: 9999,
        cursor: capturing ? "wait" : "crosshair",
        backgroundColor: drawing ? "rgba(0, 0, 0, 0.15)" : "rgba(0, 0, 0, 0.05)",
        transition: "background-color 150ms",
      }}
    >
      {/* Instructions banner */}
      {!drawing && !capturing && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(12px)",
            padding: "10px 20px",
            borderRadius: 12,
            color: "white",
            fontSize: 13,
            fontWeight: 500,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          Click and drag to select a region · Esc to cancel
        </div>
      )}

      {/* Capturing spinner */}
      {capturing && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            padding: "16px 24px",
            borderRadius: 12,
            color: "white",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Capturing...
        </div>
      )}

      {/* Selection rectangle */}
      {selRect && drawing && (
        <div
          style={{
            position: "fixed",
            left: selRect.left,
            top: selRect.top,
            width: selRect.width,
            height: selRect.height,
            border: "2px dashed rgba(91, 141, 249, 0.9)",
            backgroundColor: "rgba(91, 141, 249, 0.08)",
            borderRadius: 4,
            pointerEvents: "none",
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.25)",
          }}
        />
      )}
    </div>
  );
}
