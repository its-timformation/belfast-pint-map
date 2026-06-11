import { useEffect, useState } from "react";
import { Delete, X } from "lucide-react";
import { trpc } from "../lib/trpc";

interface Props {
  onUnlock: (token: string) => void;
  onCancel: () => void;
}

export function PinSentry({ onUnlock, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [checking, setChecking] = useState(false);
  const checkPin = trpc.auth.checkPin.useMutation();

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;
  const remainingMs = lockedUntil ? Math.max(0, lockedUntil - Date.now()) : 0;

  useEffect(() => {
    if (!isLocked) return;
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [isLocked]);

  useEffect(() => {
    if (lockedUntil && Date.now() >= lockedUntil) setLockedUntil(null);
  }, [tick, lockedUntil]);

  useEffect(() => {
    if (pin.length !== 6 || checking || isLocked) return;
    setChecking(true);
    checkPin.mutateAsync({ pin })
      .then(result => {
        if (result.ok) {
          onUnlock(result.token);
        } else {
          setShake(true);
          if (result.locked) {
            setLockedUntil(Date.now() + result.retryInMs);
          } else if ("attemptsLeft" in result) {
            setAttemptsLeft(result.attemptsLeft);
          }
          setTimeout(() => {
            setShake(false);
            setPin("");
          }, 350);
        }
      })
      .catch(() => {
        // Network error — let the user retry
        setShake(true);
        setTimeout(() => { setShake(false); setPin(""); }, 350);
      })
      .finally(() => setChecking(false));
  }, [pin]);

  const press = (d: string) => {
    if (isLocked || pin.length >= 6 || checking) return;
    setPin(p => p + d);
  };
  const del = () => {
    if (isLocked || checking) return;
    setPin(p => p.slice(0, -1));
  };

  let statusLine: string;
  if (isLocked) {
    statusLine = `STAFF DOOR JAMMED · TRY IN ${Math.ceil(remainingMs / 1000)} SEC`;
  } else if (checking) {
    statusLine = "CHECKING…";
  } else if (attemptsLeft !== null && attemptsLeft < 3) {
    statusLine = `${attemptsLeft} ATTEMPT${attemptsLeft === 1 ? "" : "S"} LEFT`;
  } else {
    statusLine = `${pin.length.toString().padStart(2, "0")} OF 06 ENTERED`;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--color-ink)] flex flex-col" role="dialog" aria-label="Admin PIN entry">
      <div className="hairline-b">
        <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between text-eyebrow opacity-70">
          <span>BELFAST PINT MAP</span>
          <span>ADMIN ACCESS</span>
          <span className="text-[var(--color-blaze)] opacity-100">VOL.01</span>
        </div>
      </div>

      <div className="flex-1 max-w-md w-full mx-auto px-6 pt-10 pb-6 flex flex-col">
        <div className="text-eyebrow text-[var(--color-blaze)] mb-3">RESTRICTED · STAFF ONLY</div>
        <h1 className="text-headline text-[var(--color-paper)] mb-8">
          ENTER<br/>YOUR PIN
        </h1>

        <div className={`flex gap-2 mb-4 ${shake ? "shake" : ""}`}>
          {[0,1,2,3,4,5].map(i => {
            const filled = i < pin.length;
            return (
              <div key={i}
                className={`w-11 flex items-center justify-center border ${filled ? "bg-[var(--color-paper)] border-[var(--color-paper)]" : "border-[var(--color-rule)] bg-transparent"}`}
                style={{ height: "52px" }}>
                {filled && <div className="w-2.5 h-2.5 bg-[var(--color-ink)] rounded-full" />}
              </div>
            );
          })}
        </div>
        <div className="text-meta opacity-55 mb-6">
          {statusLine}
        </div>

        <div className="grid grid-cols-3 border-t border-l border-[var(--color-rule)] flex-1 max-h-[420px]">
          {["1","2","3","4","5","6","7","8","9"].map(d => (
            <button key={d} className="keypad-btn" onClick={() => press(d)} disabled={isLocked || checking} aria-label={`Digit ${d}`}>{d}</button>
          ))}
          <button className="keypad-btn" disabled aria-hidden style={{cursor:"default", opacity:0}}></button>
          <button className="keypad-btn" onClick={() => press("0")} disabled={isLocked || checking} aria-label="Digit 0">0</button>
          <button className="keypad-btn flex items-center justify-center" onClick={del} disabled={isLocked || checking || pin.length === 0} aria-label="Delete">
            <Delete size={20} strokeWidth={1.6} />
          </button>
        </div>

        <button onClick={onCancel} className="mt-4 mx-auto text-meta opacity-55 hover:opacity-100 transition-opacity flex items-center gap-2" aria-label="Cancel">
          <X size={14} />
          CANCEL · BACK TO APP
        </button>
      </div>
    </div>
  );
}
