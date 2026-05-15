import { Card, CardContent } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

export default function InterpreterGlossaryPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-rose-500" />
          무역 용어집
        </h2>
        <p className="text-sm text-slate-500 mt-1">상담회에 자주 쓰이는 용어 다국어 사전</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-12 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">준비중입니다</p>
          <p className="text-sm text-slate-500">
            한국어 / 영어 / 중국어 / 일본어 무역 용어 사전을 곧 제공할 예정입니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
