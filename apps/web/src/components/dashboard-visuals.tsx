import type { ReactNode } from 'react';

export type DashboardIconName =
  'home' | 'folder' | 'document' | 'star' | 'users' | 'trash' | 'bulb' | 'plus' | 'chevron';

const shapes: Record<DashboardIconName, ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M9 21v-8h6v8" />
    </>
  ),
  folder: <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />,
  document: (
    <>
      <path d="M14 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9Z" />
      <path d="M14 3v6h6M8 13h8M8 17h6M8 9h2" />
    </>
  ),
  star: <path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9Z" />,
  users: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 20v-2a6 6 0 0 1 12 0v2ZM16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2h-3" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18v-2c0-2-4-3-4-7a7 7 0 1 1 14 0c0 4-4 5-4 7v2ZM9 21h6M12 18v-6M9 9l3 3 3-3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 5 7 7-7 7" />,
};

export function DashboardIcon({
  name,
  className = '',
}: {
  name: DashboardIconName;
  className?: string;
}) {
  return (
    <svg
      className={`dl-dashboard-svg ${className}`.trim()}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}

export function WorkspaceIllustration() {
  return (
    <svg className="dl-dashboard-illustration" viewBox="0 0 280 240" fill="none" aria-hidden="true">
      <circle cx="139" cy="120" r="102" fill="#eff8f4" />
      <ellipse cx="140" cy="199" rx="73" ry="9" fill="#d9e9e1" opacity=".35" />
      <g className="dl-dashboard-paper-back" transform="rotate(7 145 111)">
        <rect x="90" y="48" width="117" height="151" rx="11" fill="white" stroke="#edf1ef" />
        <path
          d="M112 78h67M112 94h56M112 110h63"
          stroke="#e5e9ec"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </g>
      <g className="dl-dashboard-paper-front" transform="rotate(-2 123 158)">
        <rect x="54" y="117" width="138" height="83" rx="11" fill="white" stroke="#edf1ef" />
        <rect x="74" y="137" width="29" height="37" rx="5" fill="#dcefe5" />
        <path
          d="M94 143H80v25h18v-20Zm0 0v5h4M84 154h9M84 159h7"
          stroke="#287457"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M119 148h51M119 162h45" stroke="#e5e9ec" strokeWidth="6" strokeLinecap="round" />
      </g>
      <path
        d="m35 68 7 5-2-11ZM28 79l10-2-4-4ZM224 193l7 7 4-9ZM218 201l-1 9 7-4Z"
        fill="#287457"
      />
    </svg>
  );
}
