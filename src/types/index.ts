// ============================================
// 수출상담회 웹사이트 타입 정의
// ============================================

export type UserRole = 'admin' | 'interpreter' | 'buyer' | 'seller';
export type EventStatus = 'active' | 'archived';
export type ConsultationStatus = 'scheduled' | 'in_progress' | 'completed';
export type ReportStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'revision_requested' | 'rejected' | 'excellent';

// 통역사가 IP7 모달에서 변경하는 바이어 현장 상태 (NULL = 상태없음)
export type BuyerStatus =
  | 'MET_INTERPRETER'
  | 'BUS_BOARDED'
  | 'INDIVIDUAL_MOVE'
  | 'WAITING'
  | 'ABSENT'
  | 'ONSITE_MATCH_AVAILABLE'
  | 'ONSITE_MATCH_DONE';
export type TradePossibility = '상' | '중' | '하';

// --- 사용자 ---
export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  language?: string;
  company_name?: string;
  country?: string;
  extra_info?: Record<string, unknown>;
  linked_buyer_id?: string;
  linked_seller_id?: string;
  must_change_password?: boolean;
  created_at: string;
}

// --- 수출상담회 ---
export interface Event {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  status: EventStatus;
  created_at: string;
}

// --- 타임슬롯 ---
export interface TimeSlot {
  id: string;
  event_id: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_order: number;
}

// --- 바이어 ---
export interface Buyer {
  id: string;
  event_id: string;
  company_name: string;
  buyer_name: string;
  country: string;
  booth_number?: string;
  phone?: string;
  email?: string;
  extra_info: Record<string, unknown>;
}

// --- 셀러 (참가업체) ---
export interface Seller {
  id: string;
  event_id: string;
  company_name: string;
  company_name_kr?: string;
  representative?: string;
  contact_name?: string;
  contact_phone?: string;
  office_phone?: string;
  email?: string;
  extra_info: Record<string, unknown>;
}

// --- 상담 스케줄 ---
export interface Consultation {
  id: string;
  event_id: string;
  time_slot_id: string;
  buyer_id: string;
  seller_id: string;
  interpreter_id: string | null;
  status: ConsultationStatus;
  buyer_status?: BuyerStatus | null; // 통역사 IP7 모달에서 갱신, NULL=상태없음
  // 조인 데이터
  time_slot?: TimeSlot;
  buyer?: Buyer;
  seller?: Seller;
  interpreter?: Profile;
  report?: ConsultationReport;
}

// --- 상담일지 양식 필드 ---
export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'date';

// 작성 주체
// - interpreter (기본): 통역사가 폼에서 작성
// - auto: 시스템이 consultation/buyer/seller/time_slot에서 자동으로 채움 (autoSource 키 사용)
// - admin: 관리자만 일지 보기 화면에서 입력
export type FieldSource = 'interpreter' | 'auto' | 'admin';

// 자동 채움 매핑 키 (consultation 컨텍스트에서 추출)
export type AutoSourceKey =
  | 'time_slot.date'
  | 'time_slot.start_time'
  | 'time_slot.end_time'
  | 'buyer.company_name'
  | 'buyer.buyer_name'
  | 'buyer.country'
  | 'buyer.booth_number'
  | 'seller.company_name'
  | 'seller.company_name_kr'
  | 'seller.contact_name'
  | 'seller.contact_phone'
  | 'seller.email';

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];   // select 타입일 때
  required: boolean;
  // 분기 (앞 답이 특정 값일 때만 노출). equals 단일값 또는 in 다중값
  condition?: { field: string; equals?: unknown; in?: unknown[] };
  // 멀티스텝 폼 정렬
  order?: number;
  // 작성 주체. 미지정 시 'interpreter'로 fallback (기존 데이터 호환)
  source?: FieldSource;
  // source='auto'일 때 어디서 값을 끌어올지
  autoSource?: AutoSourceKey;
  // true면 라벨 변경 시 source 자동 추론을 건너뛴다 (사용자가 명시적으로 선택)
  sourceLocked?: boolean;
}

export interface ReportTemplate {
  id: string;
  event_id: string;
  fields: TemplateField[];
}

// --- 상담일지 데이터 ---
export interface ConsultationReport {
  id: string;
  consultation_id: string;
  interpreter_id: string;
  data: Record<string, unknown>;
  submitted: boolean;
  submitted_at?: string;
  report_status: ReportStatus;
  admin_comment?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// --- 상담회-통역사 매핑 ---
export interface EventInterpreter {
  id: string;
  event_id: string;
  interpreter_id: string;
  interpreter?: Profile;
}
