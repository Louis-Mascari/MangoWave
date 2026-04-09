import { useEffect, useRef, useState } from 'react';
import howlingSrc from '../assets/howling.png';

export const LAUNCH_DURATION_MS = 2500;
/** Time at which the overlay is translucent enough for clicks to pass through.
 *  CSS `launch-fade` holds opacity:1 until 70%, then fades to 0 at 100%.
 *  At 85% the overlay is roughly half-transparent — safe to allow pointer-events. */
const PASSTHROUGH_MS = LAUNCH_DURATION_MS * 0.85;

interface LaunchAnimationProps {
  onComplete: () => void;
}

export function LaunchAnimation({ onComplete }: LaunchAnimationProps) {
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const [passthrough, setPassthrough] = useState(false);

  useEffect(() => {
    // Allow clicks through once the overlay has faded to transparent
    const fadeTimer = setTimeout(() => setPassthrough(true), PASSTHROUGH_MS);
    const completeTimer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current();
      }
    }, LAUNCH_DURATION_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
    // Stable ref — timers must not restart when parent re-renders
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black ${passthrough ? 'pointer-events-none' : ''}`}
      style={{ animation: `launch-fade ${LAUNCH_DURATION_MS}ms ease-in-out forwards` }}
    >
      {/* Glow layer — blurred copy of the image. The image's own orange body
          and purple headphones/notes produce the brand-color glow naturally.
          Only transform + opacity animate → compositor-friendly. */}
      <img
        src={howlingSrc}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute max-h-[70vh] max-w-[70vw] object-contain"
        style={{
          filter: 'blur(30px) brightness(1.8) saturate(1.4)',
          animation: `launch-glow ${LAUNCH_DURATION_MS}ms ease-in-out forwards`,
        }}
      />
      <img
        src={howlingSrc}
        alt=""
        className="relative max-h-[70vh] max-w-[70vw] object-contain"
        style={{ animation: `launch-image ${LAUNCH_DURATION_MS}ms ease-in-out forwards` }}
      />
      <style>{`
        @keyframes launch-fade {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes launch-glow {
          0% { opacity: 0; transform: scale(0.85); }
          30% { opacity: 0.9; transform: scale(1.08); }
          60% { opacity: 0.4; transform: scale(1.12); }
          100% { opacity: 0; transform: scale(1.15); }
        }
        @keyframes launch-image {
          0% {
            opacity: 0.5;
            transform: scale(0.8);
          }
          30% {
            opacity: 1;
            transform: scale(1.05);
          }
          60% {
            opacity: 1;
            transform: scale(1.1);
          }
          100% {
            opacity: 0.8;
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}
