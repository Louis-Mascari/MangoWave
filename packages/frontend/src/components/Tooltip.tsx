export function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex cursor-help">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5 text-white/40"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-48 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-center text-[10px] leading-tight text-white/80 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}
