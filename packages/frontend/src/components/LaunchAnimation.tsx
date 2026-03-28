import { useEffect, useRef } from 'react';
import howlingSrc from '../assets/howling.png';

export const LAUNCH_DURATION_MS = 2500;

interface LaunchAnimationProps {
  onComplete: () => void;
}

export function LaunchAnimation({ onComplete }: LaunchAnimationProps) {
  const completedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    }, LAUNCH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      style={{ animation: `launch-fade ${LAUNCH_DURATION_MS}ms ease-in-out forwards` }}
    >
      <img
        src={howlingSrc}
        alt=""
        className="max-h-[70vh] max-w-[70vw] object-contain"
        style={{ animation: `launch-image ${LAUNCH_DURATION_MS}ms ease-in-out forwards` }}
      />
      <style>{`
        @keyframes launch-fade {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes launch-image {
          0% {
            transform: scale(0.8);
            filter: brightness(0.5);
          }
          30% {
            transform: scale(1.05);
            filter: brightness(1.8) drop-shadow(0 0 60px rgba(255, 140, 50, 0.8)) drop-shadow(0 0 120px rgba(224, 80, 224, 0.5));
          }
          60% {
            transform: scale(1.1);
            filter: brightness(1.2) drop-shadow(0 0 40px rgba(255, 140, 50, 0.4)) drop-shadow(0 0 80px rgba(224, 80, 224, 0.3));
          }
          100% {
            transform: scale(1.1);
            filter: brightness(0.8);
          }
        }
      `}</style>
    </div>
  );
}
