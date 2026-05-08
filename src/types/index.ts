// ============================================
// 수출상담회 웹사이트 타입 정의
// ============================================

export type UserRole = 'admin' | 'interpreter' | 'buyer' | 'seller';
export type EventStatus = 'active' | 'archived';
export type ConsultationStatus = 'scheduled' | 'in_progress' | 'completed';
export type ReportStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'revision_requested';
export type TradePossibility = '상' | '중' | '하';

// --- 사용자 ---
export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  language?: string;
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
  // 조인 데이터
  time_slot?: TimeSlot;
  buyer?: Buyer;
  seller?: Seller;
  interpreter?: Profile;
  report?: ConsultationReport;
}

// --- 상담일지 양식 필드 ---
export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'date';

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];   // select 타입일 때
  required: boolean;
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
