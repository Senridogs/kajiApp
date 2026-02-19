"use client";

import { type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ActionButtonVariant = "primary" | "secondary" | "destructive" | "success" | "ghost";
export type ActionButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ActionButtonVariant, string> = {
  primary: "border border-[#1A9BE8] bg-[#1A9BE8] text-white shadow-[0_4px_12px_rgba(26,155,232,0.3)]",
  secondary: "border border-[#DADCE0] bg-white text-[#5F6368]",
  destructive: "border border-[#D45858] bg-[#D45858] text-white",
  success: "border border-[#4CAF50] bg-[#4CAF50] text-white",
  ghost: "border border-transparent bg-transparent text-[#5F6368]",
};

const SIZE_CLASS: Record<ActionButtonSize, string> = {
  sm: "rounded-[12px] px-3 py-2 text-[14px]",
  md: "rounded-[14px] px-4 py-[11px] text-[15px]",
  lg: "rounded-[14px] px-4 py-3 text-[15.6px]",
};

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
};

export function ActionButton({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  disabled,
  fullWidth = false,
  children,
  ...rest
}: ActionButtonProps) {
  const isDisabled = Boolean(disabled) || loading;
  const content = loading && loadingLabel ? loadingLabel : children;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : null}
      {content}
    </button>
  );
}
