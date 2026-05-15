'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const segmentLabels: Record<string, string> = {
  dashboard: '대시보드',
  registration: '데이터 업로드',
  timetable: '타임테이블',
  interpreters: '통역사 배정',
  template: '상담일지 양식',
  settings: '옵션',
  attendance: '출석표',
  operate: '현장운영',
  infodesk: '인포데스크',
  notice: '공지사항',
  reports: '상담일지',
};

interface BreadcrumbProps {
  eventId: string;
  eventName: string;
}

export function Breadcrumb({ eventId, eventName }: BreadcrumbProps) {
  const pathname = usePathname();

  // /admin/events/[id]/(subpath)/(rest...) — subpath만 추출
  const match = pathname.match(/^\/admin\/events\/[^/]+(?:\/([^/]+))?(?:\/(.+))?$/);
  const subpath = match?.[1];
  const rest = match?.[2];

  const items: { label: string; href?: string }[] = [
    { label: '상담회 관리', href: '/admin/events' },
    { label: eventName, href: subpath ? `/admin/events/${eventId}` : undefined },
  ];

  if (subpath) {
    const label = segmentLabels[subpath] ?? subpath;
    items.push({ label, href: rest ? `/admin/events/${eventId}/${subpath}` : undefined });
  }
  if (rest && subpath === 'reports') {
    items.push({ label: '상세' });
  }

  return (
    <nav className="flex items-center text-sm text-slate-500 mb-4" aria-label="브레드크럼">
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-slate-400" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
