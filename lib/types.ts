export type Region = 'egypt' | 'international';
export type Currency = 'EGP' | 'USD';

export interface Tier {
  id: string;
  slug: 'foundation' | 'freelance_ready' | 'production_partner' | string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  price_egp: number | null;
  price_usd: number | null;
  installments_available: boolean;
  installment_count: number;
  installment_price_egp: number | null;
  installment_price_usd: number | null;
  is_self_checkout: boolean;
  max_seats: number | null;
  current_seats_taken: number;
  features: { ar: string[]; en: string[] } | null;
  order_index: number;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  region: Region;
  tier_id: string | null;
  has_access: boolean;
  role: 'user' | 'admin';
  created_at: string;
}

export interface CourseModule {
  id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  video_link: string | null;
  checklist_file_url: string | null;
  thumbnail_url: string | null;
  block: string | null;
  status: 'available' | 'coming' | null;
  duration_minutes: number | null;
  is_free_preview: boolean;
  video_source: 'drive' | 'bunny' | null;
  bunny_video_id: string | null;
  video_duration_seconds: number | null;
  order_index: number;
}

export interface CaseFileSubmission {
  id: string;
  user_id: string;
  module_id: string | null;
  file_url: string;
  file_name: string | null;
  status: 'pending' | 'reviewed';
  reviewer_notes: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface LiveSession {
  id: string;
  title_ar: string;
  title_en: string;
  scheduled_at: string;
  join_link: string | null;
  recording_link: string | null;
  min_tier_order: number;
}

export interface PromoCode {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  applicable_tiers: string[] | null;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
}

export interface ProductionPartnerRequest {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: 'pending' | 'contacted' | 'approved' | 'rejected';
  agreed_price: number | null;
  agreed_currency: Currency | null;
  admin_notes: string | null;
  created_at: string;
}
