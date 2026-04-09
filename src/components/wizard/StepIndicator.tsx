import { clsx } from "clsx";

const STEPS = ["Campaigns", "Ad Sets", "Creatives", "Review"];

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < currentStep;
        const active = step === currentStep;

        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors",
                  {
                    "bg-yellow-400 border-yellow-400 text-gray-900": done || active,
                    "bg-white border-gray-300 text-gray-400": !done && !active,
                  }
                )}
              >
                {done ? "✓" : step}
              </div>
              <span
                className={clsx("text-xs mt-1 font-medium", {
                  "text-yellow-600": active,
                  "text-gray-500": !active,
                })}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={clsx("h-0.5 w-16 mx-1 mb-5 transition-colors", {
                  "bg-yellow-400": done,
                  "bg-gray-200": !done,
                })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
