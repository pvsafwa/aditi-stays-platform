package models

import "time"

type Property struct {
	ID             string    `json:"id"`
	PublicTitle    string    `json:"public_title"`
	Location       string    `json:"location"`
	NightlyPrice   float64   `json:"nightly_price"`
	FamilyFriendly bool      `json:"family_friendly"`
	Amenities      []string  `json:"amenities"`
	HeroImage      string    `json:"hero_image"`
	Media          []string  `json:"media"`
	Description    string    `json:"description"`
	CreatedAt      time.Time `json:"created_at"`
}

type AdminProperty struct {
	ID             string    `json:"id"`
	PublicTitle    string    `json:"public_title"`
	Location       string    `json:"location"`
	NightlyPrice   float64   `json:"nightly_price"`
	FamilyFriendly bool      `json:"family_friendly"`
	Amenities      []string  `json:"amenities"`
	HeroImage      string    `json:"hero_image"`
	Media          []string  `json:"media"`
	Description    string    `json:"description"`
	Active         bool      `json:"active"`
	CreatedAt      time.Time `json:"created_at"`
}

type PropertyCreateInput struct {
	ID             string   `json:"id"`
	Location       string   `json:"location"`
	NightlyPrice   float64  `json:"nightly_price"`
	FamilyFriendly bool     `json:"family_friendly"`
	Amenities      []string `json:"amenities"`
	HeroImage      string   `json:"hero_image"`
	Media          []string `json:"media"`
	Description    string   `json:"description"`
}

type BrowsingHistoryItem struct {
	PropertyID string    `json:"property_id"`
	ViewedAt   time.Time `json:"viewed_at"`
}

type WishlistItem struct {
	PropertyID string    `json:"property_id"`
	AddedAt    time.Time `json:"added_at"`
}

type Lead struct {
	ID                 int64     `json:"id"`
	VisitorID          string    `json:"visitor_id"`
	PropertyID         string    `json:"property_id"`
	CustomerName       string    `json:"customer_name"`
	MobileNumber       string    `json:"mobile_number"`
	Status             string    `json:"status"`
	DisclaimerAccepted bool      `json:"disclaimer_accepted"`
	InventoryChecked   bool      `json:"inventory_checked"`
	AdminNotes         *string   `json:"admin_notes,omitempty"`
	LastMessage        string    `json:"last_message,omitempty"`
	LastSenderRole     string    `json:"last_sender_role,omitempty"`
	LastMessageAt      time.Time `json:"last_message_at,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type Payment struct {
	ID          int64     `json:"id"`
	LeadID      int64     `json:"lead_id"`
	Amount      float64   `json:"amount"`
	PaymentType string    `json:"payment_type"`
	Source      string    `json:"source"`
	CreatedAt   time.Time `json:"created_at"`
}

type DailyAnalytics struct {
	Date       string  `json:"date"`
	Inquiries  int64   `json:"inquiries"`
	Bookings   int64   `json:"bookings"`
	AdvanceSum float64 `json:"advance_sum"`
	FullSum    float64 `json:"full_sum"`
}

type SummaryAnalytics struct {
	TotalInquiries  int64   `json:"total_inquiries"`
	TotalBookings   int64   `json:"total_bookings"`
	TotalAdvanceSum float64 `json:"total_advance_sum"`
	TotalFullSum    float64 `json:"total_full_sum"`
}

type Comparison struct {
	Properties []Property `json:"properties"`
}

type PropertyFeedback struct {
	ID         int64     `json:"id"`
	PropertyID string    `json:"property_id"`
	VisitorID  string    `json:"visitor_id"`
	Rating     int       `json:"rating"`
	Comment    string    `json:"comment"`
	CreatedAt  time.Time `json:"created_at"`
}

type PropertyFeedbackSummary struct {
	PropertyID  string  `json:"property_id"`
	AvgRating   float64 `json:"avg_rating"`
	ReviewCount int64   `json:"review_count"`
}

type PropertyReview struct {
	ID         int64     `json:"id"`
	PropertyID string    `json:"property_id"`
	VisitorID  string    `json:"visitor_id"`
	Rating     int       `json:"rating"`
	Comment    string    `json:"comment"`
	CreatedAt  time.Time `json:"created_at"`
}

type CampaignBanner struct {
	ID        int64          `json:"id"`
	Title     string         `json:"title"`
	URL       string         `json:"url"`
	Platform  string         `json:"platform"`
	CoverURL  string         `json:"cover_url"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	Active    bool           `json:"active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}
