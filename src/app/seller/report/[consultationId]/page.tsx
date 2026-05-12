import { redirect } from 'next/navigation';

export default async function SellerReportViewPage() {
  // 셀러는 상담일지를 볼 수 없음
  redirect('/seller');
}