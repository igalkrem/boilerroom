import { clsx } from "clsx";

interface AlertProps {
  type?: "info" | "error" | "success" | "warning";
  children: React.ReactNode;
  className?: string;
}

export function Alert({ type = "info", children, className }: AlertProps) {
  return (
    <div
      className={clsx(
        "rounded-lg px-4 py-3 text-sm",
        {
          "bg-blue-50 text-blue-800 border border-blue-200": type === "info",
          "bg-red-50 text-red-800 border border-red-200": type === "error",
          "bg-green-50 text-green-800 border border-green-200": type === "success",
          "bg-yellow-50 text-yellow-800 border border-yellow-200": type === "warning",
        },
        className
      )}
    >
      {children}
    </div>
  );
}
