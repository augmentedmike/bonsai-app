"use client";

import { useVoiceInput } from "@/hooks/use-voice-input";
import { useCallback, forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

interface VoiceTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** className applied to the outer wrapper div. Defaults to block. */
  wrapperClassName?: string;
}

/**
 * Drop-in replacement for <textarea> with an embedded mic button.
 * When a transcript arrives it is appended (with a newline) to the current value
 * via the onChange handler — works with any controlled textarea.
 */
export const VoiceTextarea = forwardRef<HTMLTextAreaElement, VoiceTextareaProps>(
  function VoiceTextarea(
    { onChange, value, className, style, wrapperClassName, placeholder, readOnly, disabled, ...props },
    ref
  ) {
    const handleTranscript = useCallback(
      (text: string) => {
        const current = typeof value === "string" ? value : "";
        const next = current ? `${current}\n${text}` : text;
        onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLTextAreaElement>);
      },
      [value, onChange]
    );

    const voice = useVoiceInput({ onTranscript: handleTranscript });

    const isBlocked = voice.isRecording || voice.isProcessingAI;

    return (
      <div className={wrapperClassName} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
        <textarea
          ref={ref}
          value={value}
          onChange={onChange}
          placeholder={
            voice.isRecording
              ? voice.interimTranscript || "Listening..."
              : voice.isProcessingAI
              ? "Processing voice..."
              : placeholder
          }
          className={className}
          style={{
            paddingBottom: voice.isSpeechSupported ? "1.75rem" : undefined,
            ...style,
          }}
          readOnly={isBlocked || readOnly}
          disabled={(!isBlocked && disabled) || undefined}
          {...props}
        />

        {/* Recording bar */}
        {voice.isRecording && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "3px 8px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              borderTop: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "0 0 8px 8px",
            }}
          >
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <span
              style={{
                flex: 1,
                fontSize: 11,
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {voice.interimTranscript || "Listening..."}
            </span>
            <button
              type="button"
              onClick={voice.stopRecording}
              className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 flex-shrink-0"
            >
              Done
            </button>
            <button
              type="button"
              onClick={voice.cancelRecording}
              className="text-xs px-1.5 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/5 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Processing bar */}
        {voice.isProcessingAI && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "3px 8px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(91, 141, 249, 0.06)",
              borderTop: "1px solid var(--border-medium)",
              borderRadius: "0 0 8px 8px",
            }}
          >
            <svg className="animate-spin h-3 w-3 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Processing...</span>
          </div>
        )}

        {/* Idle mic button — bottom-right */}
        {voice.isSpeechSupported && !voice.isRecording && !voice.isProcessingAI && (
          <button
            type="button"
            onClick={voice.startRecording}
            title="Voice input"
            style={{ position: "absolute", bottom: 5, right: 8 }}
            className="flex items-center gap-1 text-[var(--text-muted)] opacity-40 hover:opacity-90 transition-opacity"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }
);
