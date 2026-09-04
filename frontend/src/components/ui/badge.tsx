import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva("badge", {
  variants: {
    variant: {
      default: "badge-default",
      success: "badge-success",
      warning: "badge-warning",
      danger: "badge-danger",
      info: "badge-info",
    },
  },
  defaultVariants: { variant: "default" },
})

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
