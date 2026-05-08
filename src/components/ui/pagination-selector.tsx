'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10개' },
  { value: '20', label: '20개' },
  { value: '30', label: '30개' },
  { value: '50', label: '50개' },
  { value: 'all', label: '전체' },
];

interface PaginationSelectorProps {
  totalItems: number;
  pageSize: number | 'all';
  currentPage: number;
  onPageSizeChange: (size: number | 'all') => void;
  onPageChange: (page: number) => void;
}

export function PaginationSelector({
  totalItems,
  pageSize,
  currentPage,
  onPageSizeChange,
  onPageChange,
}: PaginationSelectorProps) {
  const effectivePageSize = pageSize === 'all' ? totalItems : pageSize;
  const totalPages = effectivePageSize > 0 ? Math.ceil(totalItems / effectivePageSize) : 1;
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1;
  const endItem = Math.min(currentPage * effectivePageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Select
          value={pageSize === 'all' ? 'all' : String(pageSize)}
          onValueChange={(v: string | null) => {
            if (!v) return;
            const newSize = v === 'all' ? 'all' as const : Number(v);
            onPageSizeChange(newSize);
            onPageChange(1);
          }}
        >
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {totalItems > 0 ? `${startItem}-${endItem} / ${totalItems}건` : '0건'}
        </span>
      </div>

      {pageSize !== 'all' && totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
