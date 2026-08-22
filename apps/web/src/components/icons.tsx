/**
 * Inline icon set.
 *
 * Icons are drawn, never typed: an emoji renders differently on every platform,
 * carries no stroke weight, and cannot inherit colour. These are 24px, 1.5
 * stroke, and inherit `currentColor` so a single icon works on any surface.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const Send = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 13.5 21 3M21 3l-6.5 18-4-8.5L2 8.5 21 3Z" />
  </Icon>
);

export const Inbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h5l2 3h4l2-3h5" />
    <path d="M4.5 5h15l1.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l1.5-7Z" />
  </Icon>
);

export const Layers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="m3 13 9 5 9-5M3 18l9 5 9-5" />
  </Icon>
);

export const Activity = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h4l3 8 4-16 3 8h4" />
  </Icon>
);

export const Wallet = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h12v4" />
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5a2 2 0 0 1-2-2Z" />
    <path d="M16.5 14h.01" />
  </Icon>
);

export const Shield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.5-3 8.2-7.5 9.5-4.5-1.3-7.5-5-7.5-9.5V6L12 3Z" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

export const Alert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 8.5v4.5M12 16.5h.01" />
    <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </Icon>
);

export const Clock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.5l3.5 2" />
  </Icon>
);

export const Download = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);

export const Spark = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </Icon>
);

export const Menu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const Close = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const External = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
  </Icon>
);

export const Logo = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    {/* One intake fanning into three outlets — the product, drawn. */}
    <path d="M12 2.5v7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    <path
      d="M12 9.5 4.5 15.5M12 9.5v6M12 9.5l7.5 6"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      opacity={0.55}
    />
    <circle cx="4.5" cy="18" r="2.2" fill="currentColor" />
    <circle cx="12" cy="18" r="2.2" fill="currentColor" />
    <circle cx="19.5" cy="18" r="2.2" fill="currentColor" />
  </svg>
);
