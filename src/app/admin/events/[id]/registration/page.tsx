'use client';

import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Upload, Users, UserPlus, FileText } from 'lucide-react';
import Link from 'next/link';
import { TimetableRegistration } from '@/components/admin/registration/TimetableRegistration';
import { BuyerSellerRegistration } from '@/components/admin/registration/BuyerSellerRegistration';
import { InterpreterRegistration } from '@/components/admin/registration/InterpreterRegistration';
import { TemplateRegistration } from '@/components/admin/registration/TemplateRegistration';

export default function RegistrationPage() {
  const params = useParams();
  const eventId = params.id as string;

  return (
    <div>
      <Link href={`/admin/events/${eventId}`} className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        상담회 상세로
      </Link>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">관리 / 등록</h2>
        <p className="text-slate-500 text-sm mt-1">타임테이블, 참가자, 통역사, 양식을 등록합니다</p>
      </div>

      <Tabs defaultValue="timetable">
        <TabsList className="mb-6">
          <TabsTrigger value="timetable" className="gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            타임테이블
          </TabsTrigger>
          <TabsTrigger value="participants" className="gap-1.5">
            <Users className="w-3.5 h-3.5" />
            바이어 / 셀러
          </TabsTrigger>
          <TabsTrigger value="interpreters" className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            통역사
          </TabsTrigger>
          <TabsTrigger value="template" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            상담일지 양식
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timetable">
          <TimetableRegistration eventId={eventId} />
        </TabsContent>
        <TabsContent value="participants">
          <BuyerSellerRegistration eventId={eventId} />
        </TabsContent>
        <TabsContent value="interpreters">
          <InterpreterRegistration eventId={eventId} />
        </TabsContent>
        <TabsContent value="template">
          <TemplateRegistration eventId={eventId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
