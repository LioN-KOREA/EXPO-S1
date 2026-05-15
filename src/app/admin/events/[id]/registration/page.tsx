'use client';

import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Upload, Users, UserPlus, FileText, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { TimetableRegistration } from '@/components/admin/registration/TimetableRegistration';
import { BuyerSellerRegistration } from '@/components/admin/registration/BuyerSellerRegistration';
import { InterpreterRegistration } from '@/components/admin/registration/InterpreterRegistration';
import { TemplateRegistration } from '@/components/admin/registration/TemplateRegistration';
import { UserBulkRegistration } from '@/components/admin/registration/UserBulkRegistration';

export default function RegistrationPage() {
  const params = useParams();
  const eventId = params.id as string;

  return (
    <div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">데이터 업로드</h2>
        <p className="text-slate-500 text-sm mt-1">
          엑셀로 타임테이블·참가자·통역사·양식을 일괄 등록합니다. 등록 후 관리는 좌측 메뉴
          (타임테이블 / 통역사 배정 / 상담일지 양식)에서 진행하세요.
        </p>
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
          <TabsTrigger value="bulk-users" className="gap-1.5">
            <UsersRound className="w-3.5 h-3.5" />
            사용자 통합등록
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
        <TabsContent value="bulk-users">
          <UserBulkRegistration />
        </TabsContent>
      </Tabs>
    </div>
  );
}
