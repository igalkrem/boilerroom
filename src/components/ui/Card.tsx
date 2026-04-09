import { HTMLAttributes } from "react";
import { clsx } from "clsx";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("bg-white rounded-xl border border-gray-200 shadow-sm p-6", className)}
      {...props}
    >
      {children}
    </div>
  );
}
