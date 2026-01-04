import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

export const TerminalDemo = ({
  className,
  children,
  ...props
}: ComponentProps<"div">) => {
  return (
    <div className={cn("", className)} {...props}>
      {children || "Terminal Demo"}
    </div>
  );
};
