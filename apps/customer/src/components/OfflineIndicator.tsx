import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Shows a fixed banner whenever the browser reports it is offline. */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-charcoal px-4 py-2 text-sm font-semibold text-white"
    >
      <WifiOff className="h-4 w-4" />
      You're offline. Changes will sync when you reconnect.
    </div>
  );
}

export default OfflineIndicator;
