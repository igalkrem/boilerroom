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
          "bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700": type === "info",
          "bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700": type === "error",
          "bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700": type === "success",
          "bg-yellow-50 text-yellow-800 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700": type === "warning",
        },
        className
      )}
    >
      {children}
    </div>
  );
}
