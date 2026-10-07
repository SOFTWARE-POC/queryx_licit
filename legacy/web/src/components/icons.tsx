import type { SVGProps } from "react";

const base = (d: string) =>
  function Icon(props: SVGProps<SVGSVGElement> & { size?: number }) {
    const { size = 16, ...rest } = props;
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
        <path d={d} />
      </svg>
    );
  };

export const IconChart = base("M4 19.5V13M10 19.5V6.5M16 19.5V10M22 19.5H2");
export const IconGrid = base("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z");
export const IconReports = base("M5 3h14v18H5zM9 17v-4M12 17V9M15 17v-6");
export const IconBuilder = base("M4 5h7v5H4zM4 14h7v5H4zM15 7h5M17.5 4.5v5M15 16.5h5");
export const IconChevron = base("M6 9l6 6 6-6");
export const IconLeft = base("M14 5l-7 7 7 7");
export const IconRight = base("M10 5l7 7-7 7");
export const IconSearch = base("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4");
export const IconBriefcase = base("M4 8h16v11H4zM9 8V5h6v3");
export const IconCalendar = base("M4 6h16v14H4zM4 10h16M8 3v5M16 3v5");
export const IconDownload = base("M12 4v11M7 10l5 5 5-5M5 20h14");
export const IconClock = base("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2");
export const IconCheck = base("M5 12l5 5L20 7");
export const IconAlert = base("M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z");
export const IconMoney = base("M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6");
export const IconEdit = base("M4 20h4L19 9l-4-4L4 16zM13 7l4 4");
export const IconTrash = base("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3");
export const IconPlus = base("M12 5v14M5 12h14");
export const IconLogout = base("M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11");
export const IconUsers = base("M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M21 21v-1a6 6 0 0 0-4-5.6");
