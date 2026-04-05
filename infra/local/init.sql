CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    public_title TEXT NOT NULL,
    location TEXT NOT NULL,
    nightly_price NUMERIC(10,2) NOT NULL,
    family_friendly BOOLEAN NOT NULL DEFAULT true,
    amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
    hero_image TEXT NOT NULL,
    media JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS browsing_history (
    id BIGSERIAL PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    property_id TEXT NOT NULL REFERENCES properties(id),
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlist_items (
    id BIGSERIAL PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    property_id TEXT NOT NULL REFERENCES properties(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(visitor_id, property_id)
);

CREATE TABLE IF NOT EXISTS comparison_history (
    id BIGSERIAL PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    compared_with_property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    property_id TEXT NOT NULL REFERENCES properties(id),
    customer_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEW_INQUIRY',
    disclaimer_accepted BOOLEAN NOT NULL DEFAULT false,
    inventory_checked BOOLEAN NOT NULL DEFAULT false,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id),
    amount NUMERIC(10,2) NOT NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('ADVANCE', 'FULL')),
    source TEXT NOT NULL DEFAULT 'GPAY',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id),
    sender_role TEXT NOT NULL,
    sender_label TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'TEXT',
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_proofs (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id),
    file_url TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_feedback (
    id BIGSERIAL PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_feedback_property_visitor
    ON property_feedback(property_id, visitor_id);

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

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    request_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_browsing_history_visitor ON browsing_history(visitor_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_visitor ON wishlist_items(visitor_id);
CREATE INDEX IF NOT EXISTS idx_comparison_history_visitor_created ON comparison_history(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_visitor ON leads(visitor_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_lead ON chat_messages(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_property_feedback_property ON property_feedback(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_banners_active_created ON campaign_banners(active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

INSERT INTO properties (id, public_title, location, nightly_price, amenities, hero_image, media, description)
VALUES
    (
        'AD-Munnar-01',
        'AD-Munnar-01',
        'Munnar',
        5400,
        '["Mountain View", "Family Suite", "Prayer Area", "Kids Zone", "Breakfast"]'::jsonb,
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4',
        '["https://images.unsplash.com/photo-1441974231531-c6227db76b6e", "https://images.unsplash.com/photo-1469474968028-56623f02e42e"]'::jsonb,
        'Calm hillside stay focused on family comfort and privacy.'
    ),
    (
        'AD-Ooty-02',
        'AD-Ooty-02',
        'Ooty',
        6200,
        '["Lake Access", "2 Bedroom Unit", "Private Parking", "Family Dining"]'::jsonb,
        'https://images.unsplash.com/photo-1519817650390-64a93db511aa',
        '["https://images.unsplash.com/photo-1470246973918-29a93221c455", "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b"]'::jsonb,
        'Scenic climate retreat with spacious units for families.'
    ),
    (
        'AD-Wayanad-03',
        'AD-Wayanad-03',
        'Wayanad',
        4800,
        '["Forest Edge", "Multi-bed Family Rooms", "Garden", "Campfire (No Music)"]'::jsonb,
        'https://images.unsplash.com/photo-1433086966358-54859d0ed716',
        '["https://images.unsplash.com/photo-1470770903676-69b98201ea1c", "https://images.unsplash.com/photo-1501785888041-af3ef285b470"]'::jsonb,
        'Nature-focused stay with quiet evenings and safe kids spaces.'
    )
ON CONFLICT (id) DO NOTHING;
