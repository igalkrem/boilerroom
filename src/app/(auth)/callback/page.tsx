import { Spinner } from "@/components/ui";

export default function CallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Spinner className="h-8 w-8 mx-auto mb-4" />
        <p className="text-gray-600 text-sm">Connecting your Snapchat account...</p>
      </div>
    </div>
  );
}
