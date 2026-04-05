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
      {/* Glow layer — separate element so it uses only opacity (compositor-friendly).
          The radial gradients approximate the original drop-shadow effect. */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: 'min(70vw, 70vh)',
          height: 'min(70vw, 70vh)',
          animation: `launch-glow ${LAUNCH_DURATION_MS}ms ease-in-out forwards`,
          background:
            'radial-gradient(ellipse at center, rgba(255,140,50,0.5) 0%, transparent 60%), ' +
            'radial-gradient(ellipse at center, rgba(224,80,224,0.3) 0%, transparent 70%)',
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
          0% { opacity: 0; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1.1); }
          60% { opacity: 0.5; transform: scale(1.15); }
          100% { opacity: 0; transform: scale(1.2); }
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
