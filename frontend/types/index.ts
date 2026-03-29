export type Property = {
  id: string;
  public_title: string;
  location: string;
  nightly_price: number;
  family_friendly: boolean;
  amenities: string[];
  hero_image: string;
  media: string[];
  description: string;
};

export type AdminProperty = Property & {
  active: boolean;
  created_at: string;
};

export type Lead = {
  id: number;
  visitor_id: string;
  property_id: string;
  customer_name: string;
  mobile_number: string;
  status: string;
  disclaimer_accepted: boolean;
  inventory_checked: boolean;
  admin_notes?: string;
  last_message?: string;
  last_sender_role?: string;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
};

export type ChatEvent = {
  event: string;
  lead_id: number;
  sender_role?: string;
  sender_label?: string;
  message_type?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type PropertyFeedbackSummary = {
  property_id: string;
  avg_rating: number;
  review_count: number;
};

export type PropertyReview = {
  id: number;
  property_id: string;
  visitor_id: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type CampaignBanner = {
  id: number;
  title: string;
  url: string;
  platform: string;
  cover_url: string;
  metadata?: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
};
