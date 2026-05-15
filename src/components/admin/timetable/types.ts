export interface TimeSlot { id: string; start_time: string; end_time: string; slot_order: number; date: string; }
export interface BuyerData { id: string; company_name: string; country: string; booth_number: string; }
export interface SellerData { id: string; company_name: string; company_name_kr: string; contact_name: string; }
export interface ConsultationData { id: string; time_slot_id: string; buyer_id: string; seller_id: string; interpreter_id: string | null; memo: string | null; status?: string | null; buyer_status?: string | null; seller: { company_name: string; company_name_kr: string; contact_name: string } | null; }
export interface Interpreter { id: string; name: string; email: string; }
