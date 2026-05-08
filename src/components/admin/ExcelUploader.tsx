'use client';

import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExcelUploaderProps {
  onUpload: (file: File) => void;
  loading?: boolean;
  accept?: string;
  description?: string;
}

export function ExcelUploader({
  onUpload,
  loading = false,
  accept = '.xlsx,.xls',
  description = '엑셀 파일을 드래그하거나 클릭하여 업로드',
}: ExcelUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        setSelectedFile(file);
      }
    },
    []
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }, []);

  function handleUpload() {
    if (selectedFile) {
      onUpload(selectedFile);
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-border hover:border-slate-300 bg-card/[0.02]/50'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('excel-input')?.click()}
      >
        <input
          id="excel-input"
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileSelect}
        />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
            <div className="text-left">
              <p className="font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-xs text-slate-500">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              type="button"
              className="p-1 hover:bg-slate-200 rounded"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-slate-500">{description}</p>
            <p className="text-xs text-slate-400 mt-1">.xlsx, .xls 파일 지원</p>
          </>
        )}
      </div>

      {selectedFile && (
        <Button
          onClick={handleUpload}
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
        >
          {loading ? '업로드 중...' : '업로드 및 처리'}
        </Button>
      )}
    </div>
  );
}
