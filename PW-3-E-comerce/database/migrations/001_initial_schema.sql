CREATE TABLE products (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{2,40}$'),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    kind TEXT NOT NULL CHECK (char_length(kind) BETWEEN 1 AND 40),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_code TEXT NOT NULL CHECK (char_length(variant_code) BETWEEN 1 AND 80),
    display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
    price_cents BIGINT NOT NULL CHECK (price_cents > 0),
    currency CHAR(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
    available_quantity INTEGER CHECK (available_quantity IS NULL OR available_quantity >= 0),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, variant_code)
);

CREATE INDEX product_variants_catalog_idx
    ON product_variants (product_id, is_active, is_available);

CREATE TABLE restricted_numbers (
    number INTEGER PRIMARY KEY CHECK (number >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE restricted_name_patterns (
    id UUID PRIMARY KEY,
    category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 80),
    normalized_pattern TEXT NOT NULL CHECK (char_length(normalized_pattern) BETWEEN 2 AND 120),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category, normalized_pattern)
);

CREATE TABLE checkout_options (
    id UUID PRIMARY KEY,
    option_type TEXT NOT NULL CHECK (option_type IN ('class', 'modality')),
    value TEXT NOT NULL CHECK (char_length(value) BETWEEN 1 AND 80),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (option_type, value)
);

CREATE TABLE checkout_sessions (
    id UUID PRIMARY KEY,
    secret_hash BYTEA NOT NULL UNIQUE,
    csrf_hash BYTEA NOT NULL,
    active_order_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX checkout_sessions_expiration_idx ON checkout_sessions (expires_at);

CREATE TABLE customers (
    id UUID PRIMARY KEY,
    full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 3 AND 120),
    cpf_ciphertext BYTEA NOT NULL,
    rg_ciphertext BYTEA NOT NULL,
    encryption_key_version SMALLINT NOT NULL DEFAULT 1 CHECK (encryption_key_version > 0),
    birth_date DATE NOT NULL,
    phone_e164 TEXT NOT NULL CHECK (phone_e164 ~ '^[+]55[0-9]{10,11}$'),
    email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
    class_name TEXT NOT NULL CHECK (char_length(class_name) BETWEEN 1 AND 80),
    modality TEXT NOT NULL CHECK (char_length(modality) BETWEEN 1 AND 80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE CHECK (public_id ~ '^[A-Za-z0-9_-]{32,64}$'),
    checkout_session_id UUID NOT NULL REFERENCES checkout_sessions(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
    status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT'
        CHECK (status IN ('AWAITING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED')),
    currency CHAR(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
    subtotal_cents BIGINT NOT NULL CHECK (subtotal_cents >= 0),
    total_cents BIGINT NOT NULL CHECK (total_cents >= 0),
    inventory_state TEXT NOT NULL DEFAULT 'RELEASED'
        CHECK (inventory_state IN ('RESERVED', 'SOLD', 'RELEASED')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ,
    UNIQUE (checkout_session_id, idempotency_key)
);

ALTER TABLE checkout_sessions
    ADD CONSTRAINT checkout_sessions_active_order_fk
    FOREIGN KEY (active_order_id) REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX orders_session_status_idx ON orders (checkout_session_id, status);
CREATE INDEX orders_created_at_idx ON orders (created_at DESC);

CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    product_code_snapshot TEXT NOT NULL,
    product_name_snapshot TEXT NOT NULL,
    variant_code_snapshot TEXT NOT NULL,
    variant_name_snapshot TEXT NOT NULL,
    variant_attributes_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    customization JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(customization) = 'object'),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0),
    line_total_cents BIGINT NOT NULL CHECK (line_total_cents > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE payments (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    provider TEXT NOT NULL DEFAULT 'mercadopago' CHECK (provider = 'mercadopago'),
    status TEXT NOT NULL DEFAULT 'SUBMITTING'
        CHECK (status IN ('SUBMITTING', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'RECONCILING', 'ERROR', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEDBACK')),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency CHAR(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
    installments INTEGER NOT NULL CHECK (installments > 0),
    payment_method_id TEXT,
    external_reference TEXT NOT NULL UNIQUE,
    client_idempotency_key TEXT NOT NULL UNIQUE,
    provider_idempotency_key TEXT NOT NULL UNIQUE,
    provider_order_id TEXT UNIQUE,
    provider_payment_id TEXT UNIQUE,
    provider_status TEXT,
    provider_status_detail TEXT,
    installment_amount_cents BIGINT CHECK (installment_amount_cents IS NULL OR installment_amount_cents >= 0),
    total_paid_amount_cents BIGINT CHECK (total_paid_amount_cents IS NULL OR total_paid_amount_cents >= 0),
    action_url_ciphertext BYTEA,
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    last_reconciled_at TIMESTAMPTZ
);

CREATE INDEX payments_order_created_idx ON payments (order_id, created_at DESC);
CREATE INDEX payments_status_idx ON payments (status, updated_at);

CREATE TABLE payment_events (
    id UUID PRIMARY KEY,
    payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
    provider TEXT NOT NULL DEFAULT 'mercadopago' CHECK (provider = 'mercadopago'),
    event_id TEXT,
    resource_id TEXT NOT NULL,
    action TEXT,
    event_type TEXT NOT NULL,
    payload_digest BYTEA NOT NULL,
    safe_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    processing_error_code TEXT
);

CREATE UNIQUE INDEX payment_events_provider_event_unique
    ON payment_events (provider, event_id)
    WHERE event_id IS NOT NULL;
CREATE INDEX payment_events_resource_idx ON payment_events (provider, resource_id, received_at DESC);
