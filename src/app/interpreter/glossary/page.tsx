import { Card, CardContent } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';
import { getServerDictionary } from '@/lib/i18n/server';

export default async function InterpreterGlossaryPage() {
  const t = await getServerDictionary();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-rose-500" />
          {t.interpreter.glossaryTitle}
        </h2>
        <p className="text-sm text-slate-500 mt-1">{t.interpreter.glossaryDesc}</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-12 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">{t.interpreter.glossaryComingSoon}</p>
          <p className="text-sm text-slate-500">
            {t.interpreter.glossaryComingDesc}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
