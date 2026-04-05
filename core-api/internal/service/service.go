package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"aditi-stays/core-api/internal/models"
	"aditi-stays/core-api/internal/repository"
	"github.com/redis/go-redis/v9"
)

type Service struct {
	repo                *repository.Repository
	redis               *redis.Client
	notifyTopic         string
	userChatTokenSecret []byte
	userChatTokenTTL    time.Duration
}

var bannedTerms = []string{
	"alcohol", "beer", "wine", "gambling", "casino", "dj", "music party", "nightclub", "riba", "interest", "bank",
}

func New(repo *repository.Repository, redisClient *redis.Client, notifyTopic string, userChatTokenSecret string) *Service {
	return &Service{
		repo:                repo,
		redis:               redisClient,
		notifyTopic:         notifyTopic,
		userChatTokenSecret: []byte(userChatTokenSecret),
		userChatTokenTTL:    365 * 24 * time.Hour,
	}
}

func (s *Service) ListProperties(ctx context.Context) ([]models.Property, error) {
	properties, err := s.repo.ListProperties(ctx)
	if err != nil {
		return nil, err
	}

	clean := make([]models.Property, 0, len(properties))
	for _, p := range properties {
		if isPropertyHalalCompliant(p) {
			p.PublicTitle = p.ID // hard shield: always expose masked id
			clean = append(clean, p)
		}
	}
	return clean, nil
}

func (s *Service) GetPropertyByID(ctx context.Context, id string) (*models.Property, error) {
	p, err := s.repo.GetPropertyByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !isPropertyHalalCompliant(*p) {
		return nil, fmt.Errorf("property violates halal policy")
	}
	p.PublicTitle = p.ID
	return p, nil
}

func (s *Service) CreateProperty(ctx context.Context, in models.PropertyCreateInput) (*models.Property, error) {
	if !in.FamilyFriendly {
		return nil, fmt.Errorf("family_friendly must be true")
	}

	candidate := models.Property{
		ID:             strings.TrimSpace(in.ID),
		PublicTitle:    strings.TrimSpace(in.ID),
		Location:       strings.TrimSpace(in.Location),
		NightlyPrice:   in.NightlyPrice,
		FamilyFriendly: in.FamilyFriendly,
		Amenities:      in.Amenities,
		HeroImage:      strings.TrimSpace(in.HeroImage),
		Media:          in.Media,
		Description:    strings.TrimSpace(in.Description),
	}
	if !isPropertyHalalCompliant(candidate) {
		return nil, fmt.Errorf("property violates family policy")
	}

	row, err := s.repo.CreateProperty(ctx, in)
	if err != nil {
		return nil, err
	}
	row.PublicTitle = row.ID
	return row, nil
}

func (s *Service) UpdateProperty(ctx context.Context, id string, in models.PropertyCreateInput) (*models.Property, error) {
	if !in.FamilyFriendly {
		return nil, fmt.Errorf("family_friendly must be true")
	}

	candidate := models.Property{
		ID:             strings.TrimSpace(id),
		PublicTitle:    strings.TrimSpace(id),
		Location:       strings.TrimSpace(in.Location),
		NightlyPrice:   in.NightlyPrice,
		FamilyFriendly: in.FamilyFriendly,
		Amenities:      in.Amenities,
		HeroImage:      strings.TrimSpace(in.HeroImage),
		Media:          in.Media,
		Description:    strings.TrimSpace(in.Description),
	}
	if !isPropertyHalalCompliant(candidate) {
		return nil, fmt.Errorf("property violates family policy")
	}

	row, err := s.repo.UpdateProperty(ctx, id, in)
	if err != nil {
		return nil, err
	}
	row.PublicTitle = row.ID
	return row, nil
}

func (s *Service) CompareProperties(ctx context.Context, ids []string, visitorID string) ([]models.Property, error) {
	props, err := s.repo.GetPropertiesByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	if err := s.repo.RecordComparison(ctx, visitorID, ids); err != nil {
		return nil, err
	}
	result := make([]models.Property, 0, len(props))
	for _, p := range props {
		if !isPropertyHalalCompliant(p) {
			continue
		}
		p.PublicTitle = p.ID
		result = append(result, p)
	}
	return result, nil
}

func (s *Service) CreateOrReuseLead(
	ctx context.Context,
	visitorID,
	propertyID,
	customerName,
	mobile string,
	disclaimerAccepted bool,
) (*models.Lead, bool, error) {
	if err := repository.ValidateLeadInput(visitorID, propertyID, customerName, mobile, disclaimerAccepted); err != nil {
		return nil, false, err
	}

	existing, err := s.repo.GetExistingLeadForCustomer(ctx, propertyID, customerName, mobile)
	if err == nil {
		_ = s.repo.TouchLead(ctx, existing.ID, visitorID)
		existing.VisitorID = visitorID
		existing.UpdatedAt = time.Now().UTC()
		_ = s.publishEvent(ctx, map[string]any{
			"event":         "lead_resumed",
			"lead_id":       existing.ID,
			"visitor_id":    existing.VisitorID,
			"property_id":   existing.PropertyID,
			"customer_name": existing.CustomerName,
			"mobile_number": existing.MobileNumber,
			"created_at":    existing.UpdatedAt,
		})
		return existing, true, nil
	}
	if err != nil && !repository.IsNotFound(err) {
		return nil, false, err
	}

	lead, err := s.repo.CreateLead(ctx, visitorID, propertyID, customerName, mobile, disclaimerAccepted)
	if err != nil {
		return nil, false, err
	}

	event := map[string]any{
		"event":         "lead_created",
		"lead_id":       lead.ID,
		"visitor_id":    lead.VisitorID,
		"property_id":   lead.PropertyID,
		"customer_name": lead.CustomerName,
		"mobile_number": lead.MobileNumber,
		"created_at":    lead.CreatedAt,
	}
	_ = s.publishEvent(ctx, event)

	return lead, false, nil
}

func (s *Service) UpdateInventoryStatus(ctx context.Context, leadID int64, available bool, note string) error {
	if err := s.repo.UpdateInventoryStatus(ctx, leadID, available, note); err != nil {
		return err
	}

	status := "UNAVAILABLE"
	if available {
		status = "AVAILABLE"
	}
	return s.publishEvent(ctx, map[string]any{
		"event":      "inventory_status",
		"lead_id":    leadID,
		"status":     status,
		"admin_note": note,
		"created_at": time.Now().UTC(),
	})
}

func (s *Service) AddPayment(ctx context.Context, leadID int64, amount float64, paymentType string) (*models.Payment, error) {
	if amount <= 0 {
		return nil, fmt.Errorf("amount should be > 0")
	}
	upper := strings.ToUpper(paymentType)
	if upper != "ADVANCE" && upper != "FULL" {
		return nil, fmt.Errorf("payment_type must be ADVANCE or FULL")
	}
	payment, err := s.repo.AddPayment(ctx, leadID, amount, upper)
	if err != nil {
		return nil, err
	}

	_ = s.publishEvent(ctx, map[string]any{
		"event":        "payment_received",
		"lead_id":      leadID,
		"payment_type": upper,
		"amount":       amount,
		"created_at":   payment.CreatedAt,
	})

	return payment, nil
}

func (s *Service) DeletePayment(ctx context.Context, leadID, paymentID int64) (*models.Payment, string, error) {
	deleted, nextStatus, err := s.repo.DeletePayment(ctx, leadID, paymentID)
	if err != nil {
		return nil, "", err
	}

	_ = s.publishEvent(ctx, map[string]any{
		"event":        "payment_deleted",
		"lead_id":      leadID,
		"payment_id":   paymentID,
		"payment_type": deleted.PaymentType,
		"amount":       deleted.Amount,
		"next_status":  nextStatus,
		"created_at":   time.Now().UTC(),
	})

	return deleted, nextStatus, nil
}

func (s *Service) GenerateUserChatToken(leadID int64) (string, error) {
	if leadID <= 0 {
		return "", fmt.Errorf("invalid lead id")
	}
	if len(s.userChatTokenSecret) == 0 {
		return "", fmt.Errorf("chat token secret is not configured")
	}

	expiryUnix := time.Now().UTC().Add(s.userChatTokenTTL).Unix()
	payload := fmt.Sprintf("%d.%d", leadID, expiryUnix)
	mac := hmac.New(sha256.New, s.userChatTokenSecret)
	if _, err := mac.Write([]byte(payload)); err != nil {
		return "", err
	}
	signature := hex.EncodeToString(mac.Sum(nil))
	return payload + "." + signature, nil
}

func (s *Service) ConfirmLead(ctx context.Context, leadID int64, details string) error {
	if strings.TrimSpace(details) == "" {
		details = "Confirmed by admin"
	}
	if err := s.repo.ConfirmLead(ctx, leadID, details); err != nil {
		return err
	}
	return s.publishEvent(ctx, map[string]any{
		"event":      "lead_confirmed",
		"lead_id":    leadID,
		"details":    details,
		"created_at": time.Now().UTC(),
	})
}

func (s *Service) publishEvent(ctx context.Context, payload map[string]any) error {
	if s.redis == nil {
		return nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return s.redis.Publish(ctx, s.notifyTopic, body).Err()
}

func isPropertyHalalCompliant(p models.Property) bool {
	for _, term := range bannedTerms {
		needle := strings.ToLower(term)
		if strings.Contains(strings.ToLower(p.Description), needle) {
			return false
		}
		for _, amenity := range p.Amenities {
			if strings.Contains(strings.ToLower(amenity), needle) {
				return false
			}
		}
	}
	return p.FamilyFriendly
}
