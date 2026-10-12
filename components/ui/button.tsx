import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "destructive" | "ghost";
type ButtonSize = "default" | "sm";

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  const variantClass = {
    default: "btn-primary",
    outline: "btn-secondary",
    destructive: "btn-danger",
    ghost: "btn-ghost",
  }[variant];

  return cn(
    variantClass,
    "whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
    size === "sm" ? "min-h-8" : "min-h-10",
    className,
  );
}

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonVariants({ variant, size, className })} {...props} />;
}
