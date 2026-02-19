"use client";

import { type CSSProperties, type ReactNode, useEffect } from "react";

import { ActionButton, type ActionButtonVariant } from "@/components/kaji/action-button";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  detail?: string;
  confirmLabel: string;
  confirmLoadingLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  confirmVariant?: Extract<ActionButtonVariant, "primary" | "destructive" | "success">;
  loading?: boolean;
  closeOnBackdrop?: boolean;
  ariaLabel?: string;
  icon?: ReactNode;
  zIndexClassName?: string;
  overlayClassName?: string;
  panelClassName?: string;
  overlayStyle?: CSSProperties;
};

export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel,
  confirmLoadingLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  onClose,
  confirmVariant = "primary",
  loading = false,
  closeOnBackdrop = true,
  ariaLabel,
  icon,
  zIndexClassName = "z-[9998]",
  overlayClassName,
  panelClassName,
  overlayStyle,
}: ConfirmDialogProps) {
  const closeHandler = onClose ?? onCancel;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (loading) return;
      closeHandler?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeHandler, loading, open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm",
        zIndexClassName,
        overlayClassName,
      )}
      style={overlayStyle}
      onClick={() => {
        if (!closeOnBackdrop || loading) return;
        closeHandler?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        className={cn(
          "w-full max-w-[340px] animate-[scaleIn_0.2s_ease-out] rounded-[20px] bg-white p-6 shadow-xl",
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {icon ? <div className="mx-auto mb-2 flex justify-center">{icon}</div> : null}
        <p className="text-center text-[17px] font-bold text-[#202124]">{title}</p>
        {description ? <p className="mt-2 text-center text-[13px] font-medium text-[#5F6368]">{description}</p> : null}
        {detail ? <p className="mt-1 text-center text-[12.5px] font-medium text-[#5F6368]">{detail}</p> : null}
        <div className={cn("mt-5", cancelLabel ? "grid grid-cols-2 gap-2" : "")}>
          {cancelLabel && onCancel ? (
            <ActionButton
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              disabled={loading}
              onClick={onCancel}
            >
              {cancelLabel}
            </ActionButton>
          ) : null}
          <ActionButton
            type="button"
            variant={confirmVariant}
            size="md"
            fullWidth
            loading={loading}
            loadingLabel={confirmLoadingLabel}
            onClick={onConfirm}
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
