import { clsx } from "clsx";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "green" | "yellow" | "red" | "gray";
}

export function Badge({ children, variant = "gray" }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        {
          "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400": variant === "green",
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400": variant === "yellow",
          "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400": variant === "red",
          "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300": variant === "gray",
        }
      )}
    >
      {children}
    </span>
  );
}
