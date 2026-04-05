package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode"

	"aditi-stays/core-api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type catalogPropertySeed struct {
	ID           string
	Location     string
	NightlyPrice float64
	Amenities    []string
	HeroImage    string
	Media        []string
	Description  string
}

type catalogBannerSeed struct {
	Title    string
	URL      string
	Platform string
	CoverURL string
	Metadata map[string]any
}

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListProperties(ctx context.Context) ([]models.Property, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
		FROM properties
		WHERE active = true
		ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	properties := make([]models.Property, 0)
	for rows.Next() {
		var p models.Property
		var amenitiesBytes []byte
		var mediaBytes []byte
		if err := rows.Scan(&p.ID, &p.PublicTitle, &p.Location, &p.NightlyPrice, &p.FamilyFriendly, &amenitiesBytes, &p.HeroImage, &mediaBytes, &p.Description, &p.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(amenitiesBytes, &p.Amenities); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(mediaBytes, &p.Media); err != nil {
			return nil, err
		}
		properties = append(properties, p)
	}
	return properties, rows.Err()
}

func (r *Repository) GetPropertyByID(ctx context.Context, id string) (*models.Property, error) {
	var p models.Property
	var amenitiesBytes []byte
	var mediaBytes []byte

	err := r.db.QueryRow(ctx, `
		SELECT id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
		FROM properties
		WHERE id=$1 AND active=true`, id).Scan(
		&p.ID,
		&p.PublicTitle,
		&p.Location,
		&p.NightlyPrice,
		&p.FamilyFriendly,
		&amenitiesBytes,
		&p.HeroImage,
		&mediaBytes,
		&p.Description,
		&p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(amenitiesBytes, &p.Amenities); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(mediaBytes, &p.Media); err != nil {
		return nil, err
	}

	return &p, nil
}

func (r *Repository) CreateProperty(ctx context.Context, in models.PropertyCreateInput) (*models.Property, error) {
	in.ID = strings.TrimSpace(in.ID)
	in.Location = strings.TrimSpace(in.Location)
	in.HeroImage = strings.TrimSpace(in.HeroImage)
	in.Description = strings.TrimSpace(in.Description)
	if in.ID == "" {
		return nil, fmt.Errorf("id is required")
	}
	if in.Location == "" {
		return nil, fmt.Errorf("location is required")
	}
	if in.NightlyPrice <= 0 {
		return nil, fmt.Errorf("nightly_price must be greater than zero")
	}
	if in.HeroImage == "" {
		return nil, fmt.Errorf("hero_image is required")
	}
	if in.Description == "" {
		return nil, fmt.Errorf("description is required")
	}
	if len(in.Amenities) == 0 {
		return nil, fmt.Errorf("amenities must have at least one value")
	}
	if len(in.Media) == 0 {
		in.Media = []string{in.HeroImage}
	}

	normalizedAmenities := make([]string, 0, len(in.Amenities))
	for _, amenity := range in.Amenities {
		v := strings.TrimSpace(amenity)
		if v != "" {
			normalizedAmenities = append(normalizedAmenities, v)
		}
	}
	if len(normalizedAmenities) == 0 {
		return nil, fmt.Errorf("amenities must have at least one non-empty value")
	}

	normalizedMedia := make([]string, 0, len(in.Media))
	for _, media := range in.Media {
		v := strings.TrimSpace(media)
		if v != "" {
			normalizedMedia = append(normalizedMedia, v)
		}
	}
	if len(normalizedMedia) == 0 {
		normalizedMedia = []string{in.HeroImage}
	}

	amenitiesJSON, err := json.Marshal(normalizedAmenities)
	if err != nil {
		return nil, err
	}
	mediaJSON, err := json.Marshal(normalizedMedia)
	if err != nil {
		return nil, err
	}

	var row models.Property
	var amenitiesBytes []byte
	var mediaBytes []byte
	err = r.db.QueryRow(ctx, `
		INSERT INTO properties(id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, active)
		VALUES ($1, $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, true)
		RETURNING id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
	`,
		in.ID,
		in.Location,
		in.NightlyPrice,
		in.FamilyFriendly,
		string(amenitiesJSON),
		in.HeroImage,
		string(mediaJSON),
		in.Description,
	).Scan(
		&row.ID,
		&row.PublicTitle,
		&row.Location,
		&row.NightlyPrice,
		&row.FamilyFriendly,
		&amenitiesBytes,
		&row.HeroImage,
		&mediaBytes,
		&row.Description,
		&row.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(amenitiesBytes, &row.Amenities); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(mediaBytes, &row.Media); err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *Repository) ListAdminProperties(ctx context.Context) ([]models.AdminProperty, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, active, created_at
		FROM properties
		ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.AdminProperty, 0)
	for rows.Next() {
		var p models.AdminProperty
		var amenitiesBytes []byte
		var mediaBytes []byte
		if err := rows.Scan(&p.ID, &p.PublicTitle, &p.Location, &p.NightlyPrice, &p.FamilyFriendly, &amenitiesBytes, &p.HeroImage, &mediaBytes, &p.Description, &p.Active, &p.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(amenitiesBytes, &p.Amenities); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(mediaBytes, &p.Media); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

func (r *Repository) UpdateProperty(ctx context.Context, id string, in models.PropertyCreateInput) (*models.Property, error) {
	in.Location = strings.TrimSpace(in.Location)
	in.HeroImage = strings.TrimSpace(in.HeroImage)
	in.Description = strings.TrimSpace(in.Description)
	if in.Location == "" {
		return nil, fmt.Errorf("location is required")
	}
	if in.NightlyPrice <= 0 {
		return nil, fmt.Errorf("nightly_price must be greater than zero")
	}
	if in.HeroImage == "" {
		return nil, fmt.Errorf("hero_image is required")
	}
	if in.Description == "" {
		return nil, fmt.Errorf("description is required")
	}
	if len(in.Amenities) == 0 {
		return nil, fmt.Errorf("amenities must have at least one value")
	}
	if len(in.Media) == 0 {
		in.Media = []string{in.HeroImage}
	}

	normalizedAmenities := make([]string, 0, len(in.Amenities))
	for _, amenity := range in.Amenities {
		v := strings.TrimSpace(amenity)
		if v != "" {
			normalizedAmenities = append(normalizedAmenities, v)
		}
	}
	if len(normalizedAmenities) == 0 {
		return nil, fmt.Errorf("amenities must have at least one non-empty value")
	}

	normalizedMedia := make([]string, 0, len(in.Media))
	for _, media := range in.Media {
		v := strings.TrimSpace(media)
		if v != "" {
			normalizedMedia = append(normalizedMedia, v)
		}
	}
	if len(normalizedMedia) == 0 {
		normalizedMedia = []string{in.HeroImage}
	}

	amenitiesJSON, err := json.Marshal(normalizedAmenities)
	if err != nil {
		return nil, err
	}
	mediaJSON, err := json.Marshal(normalizedMedia)
	if err != nil {
		return nil, err
	}

	var row models.Property
	var amenitiesBytes []byte
	var mediaBytes []byte
	err = r.db.QueryRow(ctx, `
		UPDATE properties
		SET
			location=$2,
			nightly_price=$3,
			family_friendly=$4,
			amenities=$5::jsonb,
			hero_image=$6,
			media=$7::jsonb,
			description=$8,
			active=true
		WHERE id=$1
		RETURNING id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
	`,
		id,
		in.Location,
		in.NightlyPrice,
		in.FamilyFriendly,
		string(amenitiesJSON),
		in.HeroImage,
		string(mediaJSON),
		in.Description,
	).Scan(
		&row.ID,
		&row.PublicTitle,
		&row.Location,
		&row.NightlyPrice,
		&row.FamilyFriendly,
		&amenitiesBytes,
		&row.HeroImage,
		&mediaBytes,
		&row.Description,
		&row.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(amenitiesBytes, &row.Amenities); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(mediaBytes, &row.Media); err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *Repository) DeactivateProperty(ctx context.Context, id string) error {
	cmd, err := r.db.Exec(ctx, `
		UPDATE properties
		SET active=false
		WHERE id=$1
	`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *Repository) AddBrowsingHistory(ctx context.Context, visitorID, propertyID string) error {
	_, err := r.db.Exec(ctx, `INSERT INTO browsing_history(visitor_id, property_id) VALUES ($1, $2)`, visitorID, propertyID)
	return err
}

func (r *Repository) GetBrowsingHistory(ctx context.Context, visitorID string, limit int) ([]models.BrowsingHistoryItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT property_id, viewed_at
		FROM browsing_history
		WHERE visitor_id=$1
		ORDER BY viewed_at DESC
		LIMIT $2`, visitorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.BrowsingHistoryItem, 0)
	for rows.Next() {
		var item models.BrowsingHistoryItem
		if err := rows.Scan(&item.PropertyID, &item.ViewedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) AddWishlistItem(ctx context.Context, visitorID, propertyID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO wishlist_items(visitor_id, property_id)
		VALUES ($1, $2)
		ON CONFLICT(visitor_id, property_id) DO NOTHING`, visitorID, propertyID)
	return err
}

func (r *Repository) RemoveWishlistItem(ctx context.Context, visitorID, propertyID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM wishlist_items WHERE visitor_id=$1 AND property_id=$2`, visitorID, propertyID)
	return err
}

func (r *Repository) GetWishlist(ctx context.Context, visitorID string) ([]models.Property, error) {
	rows, err := r.db.Query(ctx, `
		SELECT p.id, p.public_title, p.location, p.nightly_price, p.family_friendly, p.amenities, p.hero_image, p.media, p.description, p.created_at
		FROM wishlist_items w
		JOIN properties p ON p.id = w.property_id
		WHERE w.visitor_id=$1
		ORDER BY w.created_at DESC`, visitorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.Property, 0)
	for rows.Next() {
		var p models.Property
		var amenitiesBytes, mediaBytes []byte
		if err := rows.Scan(&p.ID, &p.PublicTitle, &p.Location, &p.NightlyPrice, &p.FamilyFriendly, &amenitiesBytes, &p.HeroImage, &mediaBytes, &p.Description, &p.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(amenitiesBytes, &p.Amenities); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(mediaBytes, &p.Media); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

func (r *Repository) GetPropertiesByIDs(ctx context.Context, ids []string) ([]models.Property, error) {
	if len(ids) == 0 {
		return []models.Property{}, nil
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
		FROM properties
		WHERE id = ANY($1::text[])
		ORDER BY created_at DESC`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]models.Property, 0)
	for rows.Next() {
		var p models.Property
		var amenitiesBytes, mediaBytes []byte
		if err := rows.Scan(&p.ID, &p.PublicTitle, &p.Location, &p.NightlyPrice, &p.FamilyFriendly, &amenitiesBytes, &p.HeroImage, &mediaBytes, &p.Description, &p.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(amenitiesBytes, &p.Amenities); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(mediaBytes, &p.Media); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func (r *Repository) RecordComparison(ctx context.Context, visitorID string, propertyIDs []string) error {
	visitorID = strings.TrimSpace(visitorID)
	if visitorID == "" || len(propertyIDs) < 2 {
		return nil
	}

	seen := map[string]struct{}{}
	clean := make([]string, 0, len(propertyIDs))
	for _, propertyID := range propertyIDs {
		trimmed := strings.TrimSpace(propertyID)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		clean = append(clean, trimmed)
	}
	if len(clean) < 2 {
		return nil
	}

	for i, propertyID := range clean {
		for j, comparedWith := range clean {
			if i == j {
				continue
			}
			if _, err := r.db.Exec(ctx, `
				INSERT INTO comparison_history(visitor_id, property_id, compared_with_property_id)
				VALUES ($1, $2, $3)
			`, visitorID, propertyID, comparedWith); err != nil {
				return err
			}
		}
	}
	return nil
}

func (r *Repository) GetComparedProperties(ctx context.Context, visitorID string, limit int) ([]models.Property, error) {
	visitorID = strings.TrimSpace(visitorID)
	if visitorID == "" {
		return []models.Property{}, nil
	}
	if limit <= 0 {
		limit = 12
	}

	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			p.public_title,
			p.location,
			p.nightly_price,
			p.family_friendly,
			p.amenities,
			p.hero_image,
			p.media,
			p.description,
			p.created_at
		FROM (
			SELECT property_id, MAX(created_at) AS last_compared_at
			FROM comparison_history
			WHERE visitor_id=$1
			GROUP BY property_id
			ORDER BY MAX(created_at) DESC
			LIMIT $2
		) recent
		JOIN properties p ON p.id = recent.property_id
		ORDER BY recent.last_compared_at DESC
	`, visitorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.Property, 0, limit)
	for rows.Next() {
		var p models.Property
		var amenitiesBytes []byte
		var mediaBytes []byte
		if err := rows.Scan(&p.ID, &p.PublicTitle, &p.Location, &p.NightlyPrice, &p.FamilyFriendly, &amenitiesBytes, &p.HeroImage, &mediaBytes, &p.Description, &p.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(amenitiesBytes, &p.Amenities); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(mediaBytes, &p.Media); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

func (r *Repository) GetTripRequirement(ctx context.Context, leadID int64) (map[string]any, error) {
	var content string
	var metadataBytes []byte
	var createdAt time.Time
	err := r.db.QueryRow(ctx, `
		SELECT content, metadata, created_at
		FROM chat_messages
		WHERE lead_id=$1 AND message_type='TRIP_REQUIREMENT'
		ORDER BY created_at DESC
		LIMIT 1
	`, leadID).Scan(&content, &metadataBytes, &createdAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	out := map[string]any{
		"content":    content,
		"created_at": createdAt,
	}
	if len(metadataBytes) > 0 {
		var metadata map[string]any
		if err := json.Unmarshal(metadataBytes, &metadata); err == nil {
			for _, key := range []string{"property_id", "from_date", "to_date", "members"} {
				if value, ok := metadata[key]; ok {
					out[key] = value
				}
			}
		}
	}
	return out, nil
}

func (r *Repository) GetPlatformSetting(ctx context.Context, key string) (map[string]any, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return map[string]any{}, nil
	}

	var valueBytes []byte
	err := r.db.QueryRow(ctx, `
		SELECT value
		FROM platform_settings
		WHERE key=$1
	`, key).Scan(&valueBytes)
	if err != nil {
		if err == pgx.ErrNoRows {
			return map[string]any{}, nil
		}
		return nil, err
	}

	out := map[string]any{}
	if len(valueBytes) > 0 {
		if err := json.Unmarshal(valueBytes, &out); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (r *Repository) UpsertPlatformSetting(ctx context.Context, key string, value map[string]any) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return fmt.Errorf("setting key is required")
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `
		INSERT INTO platform_settings(key, value, updated_at)
		VALUES ($1, $2::jsonb, NOW())
		ON CONFLICT(key)
		DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
	`, key, string(payload))
	return err
}

func normalizeCatalogToken(input string) string {
	var b strings.Builder
	for _, r := range input {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "Stay"
	}
	return b.String()
}

func buildDefaultPropertySeeds() []catalogPropertySeed {
	seeds := []catalogPropertySeed{
		{
			ID:           "AD-Munnar-01",
			Location:     "Munnar",
			NightlyPrice: 5400,
			Amenities:    []string{"Mountain View", "Family Suite", "Prayer Area", "Kids Zone", "Breakfast"},
			HeroImage:    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
			Media: []string{
				"https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
				"https://images.unsplash.com/photo-1469474968028-56623f02e42e",
				"https://images.unsplash.com/photo-1464822759023-fed622ff2c3b",
			},
			Description: "Calm hillside stay focused on family comfort and privacy.",
		},
		{
			ID:           "AD-Ooty-02",
			Location:     "Ooty",
			NightlyPrice: 6200,
			Amenities:    []string{"Lake Access", "2 Bedroom Unit", "Private Parking", "Family Dining"},
			HeroImage:    "https://images.unsplash.com/photo-1519817650390-64a93db511aa",
			Media: []string{
				"https://images.unsplash.com/photo-1470246973918-29a93221c455",
				"https://images.unsplash.com/photo-1464822759023-fed622ff2c3b",
				"https://images.unsplash.com/photo-1501785888041-af3ef285b470",
			},
			Description: "Scenic climate retreat with spacious units for families.",
		},
		{
			ID:           "AD-Wayanad-03",
			Location:     "Wayanad",
			NightlyPrice: 4800,
			Amenities:    []string{"Forest Edge", "Multi-bed Family Rooms", "Garden", "Campfire (No Music)"},
			HeroImage:    "https://images.unsplash.com/photo-1433086966358-54859d0ed716",
			Media: []string{
				"https://images.unsplash.com/photo-1470770903676-69b98201ea1c",
				"https://images.unsplash.com/photo-1501785888041-af3ef285b470",
				"https://images.unsplash.com/photo-1493558103817-58b2924bce98",
			},
			Description: "Nature-focused stay with quiet evenings and safe kids spaces.",
		},
	}

	locations := []string{
		"Coorg", "Kodaikanal", "Thekkady", "Vagamon", "Kovalam", "Alleppey", "Varkala",
		"Idukki", "Yercaud", "Pondicherry", "Mahabaleshwar", "Lonavala", "Panchgani",
		"North Goa", "South Goa", "Mysore", "Chikmagalur", "Udupi", "Gokarna", "Rishikesh",
		"Mussoorie", "Nainital", "Shimla", "Manali", "Dharamshala", "Jaipur", "Udaipur",
		"Pushkar", "Matheran", "Kasauli", "Kullu", "Bir Billing", "Auli", "Jodhpur",
	}
	amenitySets := [][]string{
		{"Breakfast", "Parking", "WiFi", "Family Lounge", "24x7 Support"},
		{"Mountain View", "Bonfire Zone", "Kids Play Area", "Dining Hall"},
		{"Lake Access", "Multi-bed Rooms", "Veg Kitchen", "Prayer Space"},
		{"Private Balcony", "Hot Water", "Room Service", "Security"},
		{"Garden", "Campfire", "Indoor Games", "Family Dining"},
		{"Hill Facing", "Guided Local Trips", "Car Parking", "Airport Pickup"},
	}
	images := []string{
		"https://images.unsplash.com/photo-1470246973918-29a93221c455",
		"https://images.unsplash.com/photo-1469474968028-56623f02e42e",
		"https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
		"https://images.unsplash.com/photo-1501785888041-af3ef285b470",
		"https://images.unsplash.com/photo-1493558103817-58b2924bce98",
		"https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
		"https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
		"https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd",
		"https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
		"https://images.unsplash.com/photo-1445019980597-93fa8acb246c",
		"https://images.unsplash.com/photo-1506744038136-46273834b3fb",
		"https://images.unsplash.com/photo-1494526585095-c41746248156",
		"https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1",
		"https://images.unsplash.com/photo-1455587734955-081b22074882",
	}

	for serial := len(seeds) + 1; serial <= 50; serial++ {
		location := locations[(serial-1)%len(locations)]
		locationToken := normalizeCatalogToken(location)
		amenities := amenitySets[(serial-1)%len(amenitySets)]
		hero := images[(serial-1)%len(images)]
		media := []string{
			images[serial%len(images)],
			images[(serial+3)%len(images)],
			images[(serial+7)%len(images)],
		}

		seeds = append(seeds, catalogPropertySeed{
			ID:           fmt.Sprintf("AD-%s-%02d", locationToken, serial),
			Location:     location,
			NightlyPrice: float64(4300 + ((serial * 275) % 3900)),
			Amenities:    amenities,
			HeroImage:    hero,
			Media:        media,
			Description:  fmt.Sprintf("Premium %s stay curated for family and group travel with concierge-backed support.", location),
		})
	}

	return seeds
}

func buildDefaultBannerSeeds() []catalogBannerSeed {
	return []catalogBannerSeed{
		{
			Title:    "Flower Hero Loop",
			URL:      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
			Platform: "LOCAL_VIDEO",
			CoverURL: "https://images.unsplash.com/photo-1527631746610-bca00a040d60",
			Metadata: map[string]any{"source": "seed_default", "mime_type": "video/mp4"},
		},
		{
			Title:    "Big Buck Bunny",
			URL:      "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
			Platform: "LOCAL_VIDEO",
			CoverURL: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
			Metadata: map[string]any{"source": "seed_default", "mime_type": "video/mp4"},
		},
		{
			Title:    "Elephants Dream",
			URL:      "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
			Platform: "LOCAL_VIDEO",
			CoverURL: "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
			Metadata: map[string]any{"source": "seed_default", "mime_type": "video/mp4"},
		},
		{
			Title:    "For Bigger Escapes",
			URL:      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
			Platform: "LOCAL_VIDEO",
			CoverURL: "https://images.unsplash.com/photo-1470246973918-29a93221c455",
			Metadata: map[string]any{"source": "seed_default", "mime_type": "video/mp4"},
		},
		{
			Title:    "For Bigger Fun",
			URL:      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
			Platform: "LOCAL_VIDEO",
			CoverURL: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
			Metadata: map[string]any{"source": "seed_default", "mime_type": "video/mp4"},
		},
	}
}

func (r *Repository) ensureDefaultCatalog(ctx context.Context) error {
	for _, seed := range buildDefaultPropertySeeds() {
		amenitiesBytes, err := json.Marshal(seed.Amenities)
		if err != nil {
			return err
		}
		mediaBytes, err := json.Marshal(seed.Media)
		if err != nil {
			return err
		}

		_, err = r.db.Exec(ctx, `
			INSERT INTO properties(id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, active)
			VALUES ($1, $2, $3, $4, true, $5::jsonb, $6, $7::jsonb, $8, true)
			ON CONFLICT (id) DO NOTHING
		`,
			seed.ID,
			seed.ID,
			seed.Location,
			seed.NightlyPrice,
			string(amenitiesBytes),
			seed.HeroImage,
			string(mediaBytes),
			seed.Description,
		)
		if err != nil {
			return err
		}
	}

	for _, seed := range buildDefaultBannerSeeds() {
		metadataBytes, err := json.Marshal(seed.Metadata)
		if err != nil {
			return err
		}
		_, err = r.db.Exec(ctx, `
			INSERT INTO campaign_banners(title, url, platform, cover_url, metadata, active)
			SELECT $1, $2, $3, $4, $5::jsonb, true
			WHERE NOT EXISTS (
				SELECT 1 FROM campaign_banners WHERE url = $2
			)
		`,
			seed.Title,
			seed.URL,
			seed.Platform,
			seed.CoverURL,
			string(metadataBytes),
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func (r *Repository) EnsureSchema(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS property_feedback (
			id BIGSERIAL PRIMARY KEY,
			property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
			visitor_id TEXT NOT NULL,
			rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
			comment TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		DELETE FROM property_feedback a
		USING property_feedback b
		WHERE a.property_id = b.property_id
		  AND a.visitor_id = b.visitor_id
		  AND a.id > b.id;
		CREATE UNIQUE INDEX IF NOT EXISTS uq_property_feedback_property_visitor
			ON property_feedback(property_id, visitor_id);
		CREATE INDEX IF NOT EXISTS idx_property_feedback_property ON property_feedback(property_id, created_at DESC);
		CREATE TABLE IF NOT EXISTS campaign_banners (
			id BIGSERIAL PRIMARY KEY,
			title TEXT NOT NULL,
			url TEXT NOT NULL,
			platform TEXT NOT NULL DEFAULT 'OTHER',
			cover_url TEXT NOT NULL DEFAULT '',
			metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
			active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		ALTER TABLE campaign_banners
			ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
		CREATE INDEX IF NOT EXISTS idx_campaign_banners_active_created
			ON campaign_banners(active, created_at DESC);
		UPDATE campaign_banners
		SET active=false, updated_at=NOW()
		WHERE active=true
		  AND (
			platform IN ('INSTAGRAM', 'YOUTUBE')
			OR lower(url) LIKE '%instagram.com/%'
			OR lower(url) LIKE '%youtube.com/%'
			OR lower(url) LIKE '%youtu.be/%'
		  );
		INSERT INTO campaign_banners (title, url, platform, cover_url, metadata, active)
		SELECT
			'Flower Hero Loop',
			'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
			'LOCAL_VIDEO',
			'https://images.unsplash.com/photo-1527631746610-bca00a040d60',
			'{"source":"seed_default"}'::jsonb,
			true
		WHERE NOT EXISTS (
			SELECT 1
			FROM campaign_banners
			WHERE active=true
			  AND (
				platform='LOCAL_VIDEO'
				OR coalesce(metadata->>'mime_type', '') LIKE 'video/%'
				OR url ~* '\\.(mp4|webm|mov|m4v|ogv)(\\?.*)?$'
			  )
		);
		CREATE TABLE IF NOT EXISTS comparison_history (
			id BIGSERIAL PRIMARY KEY,
			visitor_id TEXT NOT NULL,
			property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
			compared_with_property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_comparison_history_visitor_created
			ON comparison_history(visitor_id, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_comparison_history_property
			ON comparison_history(property_id, created_at DESC);
		CREATE TABLE IF NOT EXISTS platform_settings (
			key TEXT PRIMARY KEY,
			value JSONB NOT NULL DEFAULT '{}'::jsonb,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`)
	if err != nil {
		return err
	}
	return r.ensureDefaultCatalog(ctx)
}

func (r *Repository) AddPropertyFeedback(
	ctx context.Context,
	propertyID string,
	visitorID string,
	rating int,
	comment string,
) (*models.PropertyFeedback, error) {
	comment = strings.TrimSpace(comment)
	if len(comment) > 1000 {
		return nil, fmt.Errorf("comment must be at most 1000 characters")
	}
	var existingID int64
	err := r.db.QueryRow(ctx, `
		SELECT id
		FROM property_feedback
		WHERE property_id = $1 AND visitor_id = $2
		LIMIT 1
	`, propertyID, visitorID).Scan(&existingID)
	if err == nil {
		return nil, fmt.Errorf("feedback already submitted for this property")
	}
	if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}

	var row models.PropertyFeedback
	err = r.db.QueryRow(ctx, `
		INSERT INTO property_feedback(property_id, visitor_id, rating, comment)
		VALUES ($1, $2, $3, $4)
		RETURNING id, property_id, visitor_id, rating, comment, created_at
	`, propertyID, visitorID, rating, comment).Scan(
		&row.ID,
		&row.PropertyID,
		&row.VisitorID,
		&row.Rating,
		&row.Comment,
		&row.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *Repository) ListPropertyReviews(ctx context.Context, propertyID string, limit int) ([]models.PropertyReview, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, property_id, visitor_id, rating, comment, created_at
		FROM property_feedback
		WHERE property_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, propertyID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.PropertyReview, 0, limit)
	for rows.Next() {
		var item models.PropertyReview
		if err := rows.Scan(&item.ID, &item.PropertyID, &item.VisitorID, &item.Rating, &item.Comment, &item.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repository) GetPropertyFeedbackSummary(ctx context.Context) ([]models.PropertyFeedbackSummary, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			COALESCE(ROUND(AVG(f.rating)::numeric, 2), 0) AS avg_rating,
			COALESCE(COUNT(f.id), 0) AS review_count
		FROM properties p
		LEFT JOIN property_feedback f ON f.property_id = p.id
		WHERE p.active = true
		GROUP BY p.id
		ORDER BY p.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.PropertyFeedbackSummary, 0)
	for rows.Next() {
		var item models.PropertyFeedbackSummary
		if err := rows.Scan(&item.PropertyID, &item.AvgRating, &item.ReviewCount); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repository) GetPropertyFeedbackSummaryByID(ctx context.Context, propertyID string) (*models.PropertyFeedbackSummary, error) {
	var item models.PropertyFeedbackSummary
	err := r.db.QueryRow(ctx, `
		SELECT
			p.id,
			COALESCE(ROUND(AVG(f.rating)::numeric, 2), 0) AS avg_rating,
			COALESCE(COUNT(f.id), 0) AS review_count
		FROM properties p
		LEFT JOIN property_feedback f ON f.property_id = p.id
		WHERE p.id = $1 AND p.active = true
		GROUP BY p.id
	`, propertyID).Scan(&item.PropertyID, &item.AvgRating, &item.ReviewCount)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) GetExistingLeadForCustomer(ctx context.Context, propertyID, customerName, mobile string) (*models.Lead, error) {
	customerName = strings.TrimSpace(customerName)
	mobile = strings.TrimSpace(mobile)

	var lead models.Lead
	err := r.db.QueryRow(ctx, `
		SELECT id, visitor_id, property_id, customer_name, mobile_number, status, disclaimer_accepted, inventory_checked, admin_notes, created_at, updated_at
		FROM leads
		WHERE property_id=$1
		  AND lower(customer_name)=lower($2)
		  AND mobile_number=$3
		  AND status IN ('NEW_INQUIRY', 'AVAILABLE', 'PAYMENT_PENDING', 'CONFIRMED')
		ORDER BY updated_at DESC
		LIMIT 1
	`, propertyID, customerName, mobile).Scan(
		&lead.ID,
		&lead.VisitorID,
		&lead.PropertyID,
		&lead.CustomerName,
		&lead.MobileNumber,
		&lead.Status,
		&lead.DisclaimerAccepted,
		&lead.InventoryChecked,
		&lead.AdminNotes,
		&lead.CreatedAt,
		&lead.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &lead, nil
}

func (r *Repository) TouchLead(ctx context.Context, leadID int64, visitorID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE leads
		SET visitor_id=$2, updated_at=NOW(), disclaimer_accepted=true
		WHERE id=$1
	`, leadID, visitorID)
	return err
}

func (r *Repository) ListActiveBanners(ctx context.Context) ([]models.CampaignBanner, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, title, url, platform, cover_url, metadata, active, created_at, updated_at
		FROM campaign_banners
		WHERE active=true
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.CampaignBanner, 0)
	for rows.Next() {
		var b models.CampaignBanner
		var metadataBytes []byte
		if err := rows.Scan(&b.ID, &b.Title, &b.URL, &b.Platform, &b.CoverURL, &metadataBytes, &b.Active, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		if len(metadataBytes) > 0 {
			_ = json.Unmarshal(metadataBytes, &b.Metadata)
		}
		if b.Metadata == nil {
			b.Metadata = map[string]any{}
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *Repository) AddBanner(ctx context.Context, title, url, platform, coverURL string, metadata map[string]any) (*models.CampaignBanner, error) {
	title = strings.TrimSpace(title)
	url = strings.TrimSpace(url)
	platform = strings.ToUpper(strings.TrimSpace(platform))
	coverURL = strings.TrimSpace(coverURL)

	if title == "" {
		return nil, fmt.Errorf("title is required")
	}
	if url == "" {
		return nil, fmt.Errorf("url is required")
	}
	if platform == "" {
		platform = "OTHER"
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadataBytes, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}

	var row models.CampaignBanner
	var rowMetadata []byte
	err = r.db.QueryRow(ctx, `
		INSERT INTO campaign_banners(title, url, platform, cover_url, metadata, active)
		VALUES ($1, $2, $3, $4, $5::jsonb, true)
		RETURNING id, title, url, platform, cover_url, metadata, active, created_at, updated_at
	`, title, url, platform, coverURL, string(metadataBytes)).Scan(
		&row.ID,
		&row.Title,
		&row.URL,
		&row.Platform,
		&row.CoverURL,
		&rowMetadata,
		&row.Active,
		&row.CreatedAt,
		&row.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(rowMetadata) > 0 {
		_ = json.Unmarshal(rowMetadata, &row.Metadata)
	}
	if row.Metadata == nil {
		row.Metadata = map[string]any{}
	}
	return &row, nil
}

func (r *Repository) DeleteBanner(ctx context.Context, bannerID int64) error {
	_, err := r.db.Exec(ctx, `
		UPDATE campaign_banners
		SET active=false, updated_at=NOW()
		WHERE id=$1
	`, bannerID)
	return err
}

func (r *Repository) UpdateBanner(ctx context.Context, bannerID int64, title, url, platform, coverURL string, metadata map[string]any) (*models.CampaignBanner, error) {
	title = strings.TrimSpace(title)
	url = strings.TrimSpace(url)
	platform = strings.ToUpper(strings.TrimSpace(platform))
	coverURL = strings.TrimSpace(coverURL)

	if title == "" {
		return nil, fmt.Errorf("title is required")
	}
	if url == "" {
		return nil, fmt.Errorf("url is required")
	}
	if platform == "" {
		platform = "OTHER"
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadataBytes, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}

	var row models.CampaignBanner
	var rowMetadata []byte
	err = r.db.QueryRow(ctx, `
		UPDATE campaign_banners
		SET title=$2, url=$3, platform=$4, cover_url=$5, metadata=$6::jsonb, updated_at=NOW()
		WHERE id=$1 AND active=true
		RETURNING id, title, url, platform, cover_url, metadata, active, created_at, updated_at
	`, bannerID, title, url, platform, coverURL, string(metadataBytes)).Scan(
		&row.ID,
		&row.Title,
		&row.URL,
		&row.Platform,
		&row.CoverURL,
		&rowMetadata,
		&row.Active,
		&row.CreatedAt,
		&row.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(rowMetadata) > 0 {
		_ = json.Unmarshal(rowMetadata, &row.Metadata)
	}
	if row.Metadata == nil {
		row.Metadata = map[string]any{}
	}
	return &row, nil
}

func (r *Repository) CreateLead(ctx context.Context, visitorID, propertyID, customerName, mobile string, disclaimerAccepted bool) (*models.Lead, error) {
	var lead models.Lead
	err := r.db.QueryRow(ctx, `
		INSERT INTO leads(visitor_id, property_id, customer_name, mobile_number, disclaimer_accepted)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, visitor_id, property_id, customer_name, mobile_number, status, disclaimer_accepted, inventory_checked, admin_notes, created_at, updated_at`,
		visitorID, propertyID, customerName, mobile, disclaimerAccepted,
	).Scan(
		&lead.ID,
		&lead.VisitorID,
		&lead.PropertyID,
		&lead.CustomerName,
		&lead.MobileNumber,
		&lead.Status,
		&lead.DisclaimerAccepted,
		&lead.InventoryChecked,
		&lead.AdminNotes,
		&lead.CreatedAt,
		&lead.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &lead, nil
}

func (r *Repository) GetLeadByID(ctx context.Context, leadID int64) (*models.Lead, error) {
	var lead models.Lead
	err := r.db.QueryRow(ctx, `
		SELECT id, visitor_id, property_id, customer_name, mobile_number, status, disclaimer_accepted, inventory_checked, admin_notes, created_at, updated_at
		FROM leads
		WHERE id=$1`, leadID).Scan(
		&lead.ID,
		&lead.VisitorID,
		&lead.PropertyID,
		&lead.CustomerName,
		&lead.MobileNumber,
		&lead.Status,
		&lead.DisclaimerAccepted,
		&lead.InventoryChecked,
		&lead.AdminNotes,
		&lead.CreatedAt,
		&lead.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &lead, nil
}

func (r *Repository) ListActiveLeads(ctx context.Context) ([]models.Lead, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, visitor_id, property_id, customer_name, mobile_number, status, disclaimer_accepted, inventory_checked, admin_notes, created_at, updated_at
		FROM leads
		WHERE status IN ('NEW_INQUIRY', 'AVAILABLE', 'PAYMENT_PENDING')
		ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	leads := make([]models.Lead, 0)
	for rows.Next() {
		var lead models.Lead
		if err := rows.Scan(&lead.ID, &lead.VisitorID, &lead.PropertyID, &lead.CustomerName, &lead.MobileNumber, &lead.Status, &lead.DisclaimerAccepted, &lead.InventoryChecked, &lead.AdminNotes, &lead.CreatedAt, &lead.UpdatedAt); err != nil {
			return nil, err
		}
		leads = append(leads, lead)
	}
	return leads, rows.Err()
}

func (r *Repository) ListLeads(ctx context.Context, limit int) ([]models.Lead, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := r.db.Query(ctx, `
		SELECT
			l.id,
			l.visitor_id,
			l.property_id,
			l.customer_name,
			l.mobile_number,
			l.status,
			l.disclaimer_accepted,
			l.inventory_checked,
			l.admin_notes,
			COALESCE(cm.content, '') AS last_message,
			COALESCE(cm.sender_role, '') AS last_sender_role,
			COALESCE(cm.created_at, l.updated_at) AS last_message_at,
			l.created_at,
			l.updated_at
		FROM leads l
		LEFT JOIN LATERAL (
			SELECT content, sender_role, created_at
			FROM chat_messages
			WHERE lead_id = l.id
			ORDER BY created_at DESC
			LIMIT 1
		) cm ON true
		ORDER BY COALESCE(cm.created_at, l.updated_at) DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	leads := make([]models.Lead, 0)
	for rows.Next() {
		var lead models.Lead
		if err := rows.Scan(
			&lead.ID,
			&lead.VisitorID,
			&lead.PropertyID,
			&lead.CustomerName,
			&lead.MobileNumber,
			&lead.Status,
			&lead.DisclaimerAccepted,
			&lead.InventoryChecked,
			&lead.AdminNotes,
			&lead.LastMessage,
			&lead.LastSenderRole,
			&lead.LastMessageAt,
			&lead.CreatedAt,
			&lead.UpdatedAt,
		); err != nil {
			return nil, err
		}
		leads = append(leads, lead)
	}
	return leads, rows.Err()
}

func (r *Repository) UpdateInventoryStatus(ctx context.Context, leadID int64, available bool, note string) error {
	status := "UNAVAILABLE"
	if available {
		status = "AVAILABLE"
	}
	_, err := r.db.Exec(ctx, `
		UPDATE leads
		SET inventory_checked=true, status=$2, admin_notes=$3, updated_at=NOW()
		WHERE id=$1`, leadID, status, note)
	return err
}

func (r *Repository) AddPayment(ctx context.Context, leadID int64, amount float64, paymentType string) (*models.Payment, error) {
	var p models.Payment
	err := r.db.QueryRow(ctx, `
		INSERT INTO payments(lead_id, amount, payment_type, source)
		VALUES ($1, $2, $3, 'GPAY')
		RETURNING id, lead_id, amount, payment_type, source, created_at`, leadID, amount, strings.ToUpper(paymentType)).Scan(
		&p.ID, &p.LeadID, &p.Amount, &p.PaymentType, &p.Source, &p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	newStatus := "PAYMENT_PENDING"
	if strings.ToUpper(paymentType) == "FULL" {
		newStatus = "CONFIRMED"
	}
	_, err = r.db.Exec(ctx, `UPDATE leads SET status=$2, updated_at=NOW() WHERE id=$1`, leadID, newStatus)
	if err != nil {
		return nil, err
	}

	return &p, nil
}

func (r *Repository) DeletePayment(ctx context.Context, leadID, paymentID int64) (*models.Payment, string, error) {
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, "", err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	var deleted models.Payment
	err = tx.QueryRow(ctx, `
		DELETE FROM payments
		WHERE id=$1 AND lead_id=$2
		RETURNING id, lead_id, amount, payment_type, source, created_at
	`, paymentID, leadID).Scan(
		&deleted.ID,
		&deleted.LeadID,
		&deleted.Amount,
		&deleted.PaymentType,
		&deleted.Source,
		&deleted.CreatedAt,
	)
	if err != nil {
		return nil, "", err
	}

	var inventoryChecked bool
	var currentStatus string
	if err := tx.QueryRow(ctx, `SELECT inventory_checked, status FROM leads WHERE id=$1`, leadID).Scan(&inventoryChecked, &currentStatus); err != nil {
		return nil, "", err
	}

	var advanceCount int64
	var fullCount int64
	if err := tx.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN payment_type='ADVANCE' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN payment_type='FULL' THEN 1 ELSE 0 END), 0)
		FROM payments
		WHERE lead_id=$1
	`, leadID).Scan(&advanceCount, &fullCount); err != nil {
		return nil, "", err
	}

	nextStatus := "NEW_INQUIRY"
	switch {
	case fullCount > 0:
		nextStatus = "CONFIRMED"
	case advanceCount > 0:
		nextStatus = "PAYMENT_PENDING"
	case strings.EqualFold(currentStatus, "UNAVAILABLE"):
		nextStatus = "UNAVAILABLE"
	case inventoryChecked:
		nextStatus = "AVAILABLE"
	}

	if _, err := tx.Exec(ctx, `UPDATE leads SET status=$2, updated_at=NOW() WHERE id=$1`, leadID, nextStatus); err != nil {
		return nil, "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, "", err
	}
	return &deleted, nextStatus, nil
}

func (r *Repository) ListPayments(ctx context.Context, limit int) ([]map[string]any, error) {
	if limit <= 0 {
		limit = 200
	}

	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			p.lead_id,
			l.customer_name,
			l.property_id,
			p.amount,
			p.payment_type,
			p.source,
			p.created_at
		FROM payments p
		JOIN leads l ON l.id = p.lead_id
		ORDER BY p.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]map[string]any, 0, limit)
	for rows.Next() {
		var paymentID int64
		var leadID int64
		var customerName string
		var propertyID string
		var amount float64
		var paymentType string
		var source string
		var createdAt time.Time
		if err := rows.Scan(&paymentID, &leadID, &customerName, &propertyID, &amount, &paymentType, &source, &createdAt); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{
			"id":            paymentID,
			"lead_id":       leadID,
			"customer_name": customerName,
			"property_id":   propertyID,
			"amount":        amount,
			"payment_type":  paymentType,
			"source":        source,
			"created_at":    createdAt,
		})
	}
	return items, rows.Err()
}

func (r *Repository) ConfirmLead(ctx context.Context, leadID int64, details string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE leads
		SET status='CONFIRMED', admin_notes=$2, updated_at=NOW()
		WHERE id=$1`, leadID, details)
	return err
}

func (r *Repository) DailyAnalytics(ctx context.Context, day string) (*models.DailyAnalytics, error) {
	var result models.DailyAnalytics
	result.Date = day

	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM leads WHERE DATE(created_at)=DATE($1)`, day).Scan(&result.Inquiries); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM leads WHERE DATE(updated_at)=DATE($1) AND status='CONFIRMED'`, day).Scan(&result.Bookings); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM payments WHERE DATE(created_at)=DATE($1) AND payment_type='ADVANCE'`, day).Scan(&result.AdvanceSum); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM payments WHERE DATE(created_at)=DATE($1) AND payment_type='FULL'`, day).Scan(&result.FullSum); err != nil {
		return nil, err
	}

	return &result, nil
}

func (r *Repository) SummaryAnalytics(ctx context.Context) (*models.SummaryAnalytics, error) {
	var s models.SummaryAnalytics
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM leads`).Scan(&s.TotalInquiries); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM leads WHERE status='CONFIRMED'`).Scan(&s.TotalBookings); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_type='ADVANCE'`).Scan(&s.TotalAdvanceSum); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_type='FULL'`).Scan(&s.TotalFullSum); err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) GetLeadMessages(ctx context.Context, leadID int64) ([]map[string]any, error) {
	rows, err := r.db.Query(ctx, `
		SELECT sender_role, sender_label, message_type, content, metadata, created_at
		FROM chat_messages
		WHERE lead_id=$1
		ORDER BY created_at ASC`, leadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]map[string]any, 0)
	for rows.Next() {
		var senderRole, senderLabel, messageType, content string
		var metadataBytes []byte
		var createdAt time.Time
		if err := rows.Scan(&senderRole, &senderLabel, &messageType, &content, &metadataBytes, &createdAt); err != nil {
			return nil, err
		}

		metadata := map[string]any{}
		if len(metadataBytes) > 0 {
			_ = json.Unmarshal(metadataBytes, &metadata)
		}
		messages = append(messages, map[string]any{
			"sender_role":  senderRole,
			"sender_label": senderLabel,
			"message_type": messageType,
			"content":      content,
			"metadata":     metadata,
			"created_at":   createdAt,
		})
	}
	return messages, rows.Err()
}

func (r *Repository) LeadContext(ctx context.Context, leadID int64) (map[string]any, error) {
	lead, err := r.GetLeadByID(ctx, leadID)
	if err != nil {
		return nil, err
	}
	history, err := r.GetBrowsingHistory(ctx, lead.VisitorID, 25)
	if err != nil {
		return nil, err
	}
	wishlist, err := r.GetWishlist(ctx, lead.VisitorID)
	if err != nil {
		return nil, err
	}
	comparedProperties, err := r.GetComparedProperties(ctx, lead.VisitorID, 12)
	if err != nil {
		return nil, err
	}
	tripRequest, err := r.GetTripRequirement(ctx, leadID)
	if err != nil {
		return nil, err
	}

	var advanceSum float64
	var fullSum float64
	var totalSum float64
	var paymentCount int64
	if err := r.db.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN payment_type='ADVANCE' THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN payment_type='FULL' THEN amount ELSE 0 END), 0),
			COALESCE(SUM(amount), 0),
			COUNT(*)
		FROM payments
		WHERE lead_id=$1
	`, leadID).Scan(&advanceSum, &fullSum, &totalSum, &paymentCount); err != nil {
		return nil, err
	}

	payments := make([]map[string]any, 0)
	paymentRows, err := r.db.Query(ctx, `
		SELECT id, amount, payment_type, created_at
		FROM payments
		WHERE lead_id=$1
		ORDER BY created_at DESC
		LIMIT 100
	`, leadID)
	if err != nil {
		return nil, err
	}
	defer paymentRows.Close()

	for paymentRows.Next() {
		var id int64
		var amount float64
		var paymentType string
		var createdAt time.Time
		if err := paymentRows.Scan(&id, &amount, &paymentType, &createdAt); err != nil {
			return nil, err
		}
		payments = append(payments, map[string]any{
			"id":           id,
			"amount":       amount,
			"payment_type": paymentType,
			"created_at":   createdAt,
		})
	}
	if err := paymentRows.Err(); err != nil {
		return nil, err
	}

	return map[string]any{
		"lead":                lead,
		"trip_request":        tripRequest,
		"browsing_history":    history,
		"wishlist":            wishlist,
		"compared_properties": comparedProperties,
		"payment_summary": map[string]any{
			"advance_total": advanceSum,
			"full_total":    fullSum,
			"total":         totalSum,
			"count":         paymentCount,
		},
		"payments": payments,
	}, nil
}

func (r *Repository) CreateAuditLog(
	ctx context.Context,
	actor string,
	actorRole string,
	action string,
	resourceType string,
	resourceID string,
	requestID string,
	ipAddress string,
	userAgent string,
	payload map[string]any,
) error {
	if actor == "" {
		actor = "admin"
	}
	if actorRole == "" {
		actorRole = "admin"
	}
	if payload == nil {
		payload = map[string]any{}
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	_, err = r.db.Exec(ctx, `
		INSERT INTO audit_logs(
			actor, actor_role, action, resource_type, resource_id, request_id, ip_address, user_agent, payload
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
		actor,
		actorRole,
		action,
		resourceType,
		resourceID,
		requestID,
		ipAddress,
		userAgent,
		string(payloadBytes),
	)
	return err
}

func IsNotFound(err error) bool {
	return err == pgx.ErrNoRows
}

func IsDuplicate(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(err.Error()), "duplicate key")
}

func ValidateLeadInput(visitorID, propertyID, customerName, mobile string, disclaimerAccepted bool) error {
	if visitorID == "" || propertyID == "" || customerName == "" || mobile == "" {
		return fmt.Errorf("visitor_id, property_id, customer_name and mobile_number are required")
	}
	if !disclaimerAccepted {
		return fmt.Errorf("compliance disclaimer must be accepted")
	}
	return nil
}
