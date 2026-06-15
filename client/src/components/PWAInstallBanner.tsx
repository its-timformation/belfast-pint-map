import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "bpm-pwa-dismissed";

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iOSVisible, setIOSVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    // Check if running as installed PWA already
    const isInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isInstalled) return;

    // iOS detection (Safari doesn't fire beforeinstallprompt)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    if (ios) {
      setIsIOS(true);
      // Show after a short delay so it doesn't jar on first load
      const t = setTimeout(() => setIOSVisible(true), 3000);
      return () => clearTimeout(t);
    }

    // Android / Chrome — wait for browser's beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const t = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(t);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
    setIOSVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setVisible(false);
    }
  }

  // iOS install instructions
  if (isIOS && iOSVisible) {
    return (
      <div className="fixed bottom-[var(--shell-bottom,4rem)] left-0 right-0 z-[9000] px-3 pb-2 pointer-events-none">
        <div className="max-w-md mx-auto bg-[var(--color-ink)] border border-[var(--color-rule)] px-4 py-3 flex items-start gap-3 pointer-events-auto">
          <img src="/favicon.svg" alt="" className="w-9 h-9 rounded-lg shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-display text-sm uppercase text-[var(--color-paper)] leading-tight mb-0.5">
              ADD TO HOME SCREEN
            </div>
            <div className="text-meta opacity-55 leading-snug">
              Tap <span className="inline-block align-middle opacity-80">⎙</span> then <strong className="text-[var(--color-paper)] opacity-80">Add to Home Screen</strong> for the full app
            </div>
          </div>
          <button onClick={dismiss} className="!min-h-0 p-1 opacity-30 hover:opacity-70 shrink-0">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Android / Chrome install prompt
  if (!visible || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-[var(--shell-bottom,4rem)] left-0 right-0 z-[9000] px-3 pb-2">
      <div className="max-w-md mx-auto bg-[var(--color-ink)] border border-[var(--color-blaze)] px-4 py-3 flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="w-9 h-9 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm uppercase text-[var(--color-paper)] leading-tight">
            BELFAST PINT MAP
          </div>
          <div className="text-meta opacity-55">Install for offline access</div>
        </div>
        <button
          onClick={install}
          className="bg-[var(--color-blaze)] text-[var(--color-paper)] font-display text-xs px-3 py-2 tracking-wider shrink-0"
        >
          INSTALL
        </button>
        <button onClick={dismiss} className="!min-h-0 p-1 opacity-30 hover:opacity-70 shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
