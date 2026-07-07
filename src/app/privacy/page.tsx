export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Privacy Policy</h1>
      <p className="mb-4">
        BoilerRoom is an internal ad campaign management tool. We connect to third-party
        advertising platforms (Snapchat, Meta) solely to create and manage ad campaigns
        on your behalf.
      </p>
      <p className="mb-4">
        We store OAuth access tokens securely (encrypted at rest) and use them only to
        communicate with the advertising APIs you have authorized. We do not sell, share,
        or distribute your data to any third parties.
      </p>
      <p className="mb-4">
        You can revoke access at any time by disconnecting the platform from the
        Traffic Sources page or by removing the app from your platform settings.
      </p>
      <p className="text-sm text-gray-500 mt-8">Last updated: July 2026</p>
    </div>
  );
}
