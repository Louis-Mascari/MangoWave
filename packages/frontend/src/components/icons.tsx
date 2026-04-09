/**
 * Centralized SVG icon components for cross-platform consistency.
 * All icons use currentColor so they inherit text color from their parent.
 */

interface IconProps {
  className?: string;
}

// ── Transport Controls ────────────────────────────────────────────────

export function PlayIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 3.5v13l10-6.5z" />
    </svg>
  );
}

export function PauseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <rect x="5" y="3" width="3.5" height="14" rx="0.75" />
      <rect x="11.5" y="3" width="3.5" height="14" rx="0.75" />
    </svg>
  );
}

export function PreviousTrackIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <rect x="2" y="4" width="2.5" height="12" rx="0.5" />
      <path d="M16 4v12l-9-6z" />
    </svg>
  );
}

export function NextTrackIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4 4v12l9-6z" />
      <rect x="15.5" y="4" width="2.5" height="12" rx="0.5" />
    </svg>
  );
}

export function ShuffleIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6h3l8 8h3" />
      <path d="M3 14h3l8-8h3" />
      <polyline points="15,4 17,6 15,8" />
      <polyline points="15,12 17,14 15,16" />
    </svg>
  );
}

export function RepeatIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 2l2 2-2 2" />
      <path d="M4 8V6a2 2 0 012-2h10" />
      <path d="M6 18l-2-2 2-2" />
      <path d="M16 12v2a2 2 0 01-2 2H4" />
    </svg>
  );
}

export function RepeatOneIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 2l2 2-2 2" />
      <path d="M4 8V6a2 2 0 012-2h10" />
      <path d="M6 18l-2-2 2-2" />
      <path d="M16 12v2a2 2 0 01-2 2H4" />
      <text
        x="10"
        y="12.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="7"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
      >
        1
      </text>
    </svg>
  );
}

export function VolumeMuteIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 8v4h3l4 4V4L6 8H3z" fill="currentColor" stroke="none" />
      <line x1="14" y1="8" x2="18" y2="12" />
      <line x1="18" y1="8" x2="14" y2="12" />
    </svg>
  );
}

export function VolumeHighIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 8v4h3l4 4V4L6 8H3z" fill="currentColor" stroke="none" />
      <path d="M13 7.5a3.5 3.5 0 010 5" />
      <path d="M15.5 5.5a7 7 0 010 9" />
    </svg>
  );
}

// ── Preset Navigation ─────────────────────────────────────────────────

export function ChevronLeftIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.5 4l-6 6 6 6z" />
    </svg>
  );
}

export function ChevronRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M7.5 4l6 6-6 6z" />
    </svg>
  );
}

// ── Close / Dismiss ───────────────────────────────────────────────────

export function CloseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  );
}

// ── Reorder ───────────────────────────────────────────────────────────

export function ArrowUpIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 5l6 8H4z" />
    </svg>
  );
}

export function ArrowDownIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 15l6-8H4z" />
    </svg>
  );
}

// ── Mobile Controls ───────────────────────────────────────────────────

export function StarIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export function GearIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M8.4 3.2L8.6 1.1h2.8l.2 2.1 2.1.8 1.6-1.3 2 2-1.3 1.6.8 2.1 2.1.2v2.8l-2.1.2-.8 2.1 1.3 1.6-2 2-1.6-1.3-2.1.8-.2 2.1H8.6l-.2-2.1-2.1-.8-1.6 1.3-2-2 1.3-1.6-.8-2.1-2.1-.2V8.6l2.1-.2.8-2.1L2.7 4.7l2-2 1.6 1.3 2.1-.8zM10 13a3 3 0 100-6 3 3 0 000 6z"
      />
    </svg>
  );
}

export function FullscreenIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="3,8 3,3 8,3" />
      <polyline points="17,8 17,3 12,3" />
      <polyline points="3,12 3,17 8,17" />
      <polyline points="17,12 17,17 12,17" />
    </svg>
  );
}

export function BlockIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <line x1="5" y1="5" x2="15" y2="15" />
    </svg>
  );
}

// ── Now Playing ───────────────────────────────────────────────────────

export function NowPlayingIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      {/* Music note: oval head + stem + flag */}
      <ellipse cx="8" cy="14.5" rx="3" ry="2.5" />
      <rect x="10.5" y="3" width="1.5" height="12" rx="0.5" />
      <path d="M12 3c2.5 0.5 4.5 2 5 4-1.5-0.5-3.5-1-5-1.5z" />
    </svg>
  );
}

// ── Onboarding ────────────────────────────────────────────────────────

export function KeyboardIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="1" y="4" width="18" height="12" rx="2" />
      <line x1="5" y1="8" x2="6" y2="8" />
      <line x1="9" y1="8" x2="11" y2="8" />
      <line x1="14" y1="8" x2="15" y2="8" />
      <line x1="6" y1="12" x2="14" y2="12" />
    </svg>
  );
}
