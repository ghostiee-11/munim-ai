-- ============================================
-- MunimAI Database Schema
-- Supabase PostgreSQL
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- MERCHANTS
-- ============================================
CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    business_type TEXT NOT NULL,
    location JSONB DEFAULT '{}',
    employee_count INTEGER DEFAULT 1,
    monthly_rent DECIMAL(12,2),
    paytm_merchant_id TEXT,
    payscore INTEGER DEFAULT 50,
    payscore_grade TEXT DEFAULT 'C',
    preferred_language TEXT DEFAULT 'hi',
    morning_briefing_time TIME DEFAULT '09:00',
    onboarding_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TRANSACTIONS (unified income + expense)
-- ============================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    subcategory TEXT,
    description TEXT,
    source TEXT NOT NULL DEFAULT 'voice',
    payment_mode TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    supplier_name TEXT,
    hsn_code TEXT,
    gst_rate DECIMAL(4,2),
    gst_eligible BOOLEAN DEFAULT FALSE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_frequency TEXT,
    voice_transcript TEXT,
    intent_confidence DECIMAL(4,3),
    metadata JSONB DEFAULT '{}',
    recorded_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- UDHARI (Informal Credit/Receivables)
-- ============================================
CREATE TABLE udhari (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    debtor_name TEXT NOT NULL,
    debtor_phone TEXT,
    debtor_paytm_id TEXT,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    amount_paid DECIMAL(12,2) DEFAULT 0,
    remaining DECIMAL(12,2) GENERATED ALWAYS AS (amount - amount_paid) STORED,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'settled', 'overdue', 'written_off')),
    risk_score DECIMAL(4,3),
    optimal_channel TEXT,
    optimal_timing TEXT,
    optimal_tone TEXT,
    reminder_count INTEGER DEFAULT 0,
    last_reminder_at TIMESTAMPTZ,
    last_reminder_response TEXT,
    payment_link TEXT,
    payment_link_clicks INTEGER DEFAULT 0,
    escalation_level INTEGER DEFAULT 0,
    max_escalation INTEGER DEFAULT 3,
    source TEXT DEFAULT 'voice',
    notes TEXT,
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    settled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- CUSTOMERS (Auto-built from transactions)
-- ============================================
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    paytm_id TEXT,
    total_visits INTEGER DEFAULT 1,
    total_spent DECIMAL(12,2) DEFAULT 0,
    average_order_value DECIMAL(12,2),
    first_visit TIMESTAMPTZ DEFAULT now(),
    last_visit TIMESTAMPTZ DEFAULT now(),
    visit_frequency_days DECIMAL(6,1),
    expected_next_visit DATE,
    rfm_recency_score INTEGER,
    rfm_frequency_score INTEGER,
    rfm_monetary_score INTEGER,
    rfm_segment TEXT,
    churn_risk TEXT DEFAULT 'low' CHECK (churn_risk IN ('low', 'medium', 'high', 'churned')),
    churn_probability DECIMAL(4,3),
    churn_detected_at TIMESTAMPTZ,
    days_since_last_visit INTEGER,
    winback_sent BOOLEAN DEFAULT FALSE,
    winback_message TEXT,
    winback_response TEXT,
    winback_offer TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- EMPLOYEES
-- ============================================
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT,
    salary DECIMAL(12,2),
    payment_frequency TEXT DEFAULT 'monthly',
    last_paid_date DATE,
    last_paid_amount DECIMAL(12,2),
    bank_account TEXT,
    attendance_this_month INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- DAILY SUMMARY (Pre-aggregated)
-- ============================================
CREATE TABLE daily_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_income DECIMAL(12,2) DEFAULT 0,
    total_expense DECIMAL(12,2) DEFAULT 0,
    net_profit DECIMAL(12,2) DEFAULT 0,
    profit_margin DECIMAL(5,2),
    transaction_count INTEGER DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    digital_income DECIMAL(12,2) DEFAULT 0,
    cash_income DECIMAL(12,2) DEFAULT 0,
    udhari_created DECIMAL(12,2) DEFAULT 0,
    udhari_collected DECIMAL(12,2) DEFAULT 0,
    top_expense_category TEXT,
    top_customer TEXT,
    anomaly_flag BOOLEAN DEFAULT FALSE,
    anomaly_description TEXT,
    UNIQUE(merchant_id, date)
);

-- ============================================
-- EVENTS (Real-time activity feed)
-- ============================================
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    title_hindi TEXT,
    description TEXT,
    severity TEXT DEFAULT 'info',
    related_entity_type TEXT,
    related_entity_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- GST STATUS
-- ============================================
CREATE TABLE gst_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    gstin TEXT,
    return_type TEXT NOT NULL,
    period TEXT NOT NULL,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'classifying', 'ready', 'approved', 'filed', 'late')),
    estimated_tax DECIMAL(12,2),
    itc_claimed DECIMAL(12,2),
    itc_matched DECIMAL(12,2),
    itc_mismatch DECIMAL(12,2),
    transactions_classified INTEGER DEFAULT 0,
    transactions_total INTEGER DEFAULT 0,
    classification_accuracy DECIMAL(4,3),
    filed_at TIMESTAMPTZ,
    penalty_amount DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- CASH FLOW FORECASTS
-- ============================================
CREATE TABLE forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    forecast_date DATE NOT NULL,
    predicted_income DECIMAL(12,2),
    predicted_expense DECIMAL(12,2),
    predicted_net DECIMAL(12,2),
    confidence_upper DECIMAL(12,2),
    confidence_lower DECIMAL(12,2),
    is_festival BOOLEAN DEFAULT FALSE,
    festival_name TEXT,
    is_crisis BOOLEAN DEFAULT FALSE,
    crisis_severity TEXT,
    model_version TEXT,
    generated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PAYSCORE HISTORY
-- ============================================
CREATE TABLE payscore_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    grade TEXT NOT NULL,
    feature_breakdown JSONB NOT NULL,
    improvement_tips JSONB,
    credit_eligibility JSONB,
    model_version TEXT,
    calculated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- COLLECTION ACTIONS (RL Agent Memory)
-- ============================================
CREATE TABLE collection_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    udhari_id UUID REFERENCES udhari(id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    tone TEXT NOT NULL,
    message_text TEXT NOT NULL,
    message_variant TEXT,
    sent_at TIMESTAMPTZ DEFAULT now(),
    delivered BOOLEAN DEFAULT FALSE,
    read_status BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    response TEXT,
    payment_received DECIMAL(12,2) DEFAULT 0,
    reward DECIMAL(6,3),
    state_features JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- GOVERNMENT SCHEME MATCHES
-- ============================================
CREATE TABLE scheme_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    scheme_name TEXT NOT NULL,
    scheme_code TEXT,
    description TEXT,
    eligible_amount DECIMAL(12,2),
    interest_rate DECIMAL(4,2),
    eligibility_score DECIMAL(4,3),
    status TEXT DEFAULT 'matched',
    application_url TEXT,
    matched_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- WHATSAPP MESSAGES
-- ============================================
CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    recipient_type TEXT NOT NULL,
    recipient_phone TEXT,
    recipient_name TEXT,
    message_type TEXT NOT NULL,
    content TEXT NOT NULL,
    template_name TEXT,
    media_url TEXT,
    payment_link TEXT,
    status TEXT DEFAULT 'sent',
    metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PAYSCORES (cached current score)
-- ============================================
CREATE TABLE IF NOT EXISTS payscores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 50,
    grade TEXT DEFAULT 'C',
    factors JSONB DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(merchant_id)
);

-- ============================================
-- BRIEFINGS (daily AI-generated summaries)
-- ============================================
CREATE TABLE IF NOT EXISTS briefings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    content JSONB DEFAULT '{}',
    audio_url TEXT,
    sent_via TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(merchant_id, date)
);

-- ============================================
-- GST FILINGS (prepared/filed returns)
-- ============================================
CREATE TABLE IF NOT EXISTS gst_filings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    return_type TEXT DEFAULT 'GSTR-3B',
    status TEXT DEFAULT 'prepared',
    total_sales DECIMAL(12,2) DEFAULT 0,
    total_purchases DECIMAL(12,2) DEFAULT 0,
    gst_collected DECIMAL(12,2) DEFAULT 0,
    gst_paid DECIMAL(12,2) DEFAULT 0,
    net_liability DECIMAL(12,2) DEFAULT 0,
    filing_data JSONB DEFAULT '{}',
    filed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(merchant_id, period)
);

-- ============================================
-- CUSTOMER OUTREACH
-- ============================================
CREATE TABLE IF NOT EXISTS customer_outreach (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID,
    customer_name TEXT,
    channel TEXT DEFAULT 'whatsapp',
    message TEXT,
    offer TEXT,
    status TEXT DEFAULT 'sent',
    response TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- SCHEME APPLICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS scheme_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    scheme_code TEXT NOT NULL,
    scheme_name TEXT,
    status TEXT DEFAULT 'initiated',
    application_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_transactions_merchant_date ON transactions(merchant_id, recorded_at DESC);
CREATE INDEX idx_transactions_type ON transactions(merchant_id, type, recorded_at DESC);
CREATE INDEX idx_transactions_category ON transactions(merchant_id, category);
CREATE INDEX idx_udhari_merchant_status ON udhari(merchant_id, status);
CREATE INDEX idx_udhari_overdue ON udhari(merchant_id, status, created_at) WHERE status IN ('pending', 'overdue');
CREATE INDEX idx_customers_merchant_churn ON customers(merchant_id, churn_risk);
CREATE INDEX idx_customers_last_visit ON customers(merchant_id, last_visit DESC);
CREATE INDEX idx_events_merchant_time ON events(merchant_id, created_at DESC);
CREATE INDEX idx_daily_summary_merchant ON daily_summary(merchant_id, date DESC);
CREATE INDEX idx_forecasts_merchant ON forecasts(merchant_id, forecast_date);
CREATE INDEX idx_collection_actions_udhari ON collection_actions(udhari_id, sent_at DESC);
CREATE INDEX idx_whatsapp_merchant ON whatsapp_messages(merchant_id, sent_at DESC);
CREATE INDEX idx_payscore_history ON payscore_history(merchant_id, calculated_at DESC);

-- ============================================
-- TRIGGER: Auto-update daily_summary on new transaction
-- ============================================
CREATE OR REPLACE FUNCTION update_daily_summary()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO daily_summary (merchant_id, date, total_income, total_expense, net_profit, transaction_count)
    VALUES (
        NEW.merchant_id,
        DATE(NEW.recorded_at),
        CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE 0 END,
        CASE WHEN NEW.type = 'expense' THEN NEW.amount ELSE 0 END,
        CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE -NEW.amount END,
        1
    )
    ON CONFLICT (merchant_id, date) DO UPDATE SET
        total_income = daily_summary.total_income + CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE 0 END,
        total_expense = daily_summary.total_expense + CASE WHEN NEW.type = 'expense' THEN NEW.amount ELSE 0 END,
        net_profit = daily_summary.net_profit + CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE -NEW.amount END,
        transaction_count = daily_summary.transaction_count + 1,
        profit_margin = CASE
            WHEN (daily_summary.total_income + CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE 0 END) > 0
            THEN ((daily_summary.net_profit + CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE -NEW.amount END) /
                  (daily_summary.total_income + CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE 0 END)) * 100
            ELSE 0
        END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_daily_summary
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_summary();

-- ============================================
-- TRIGGER: Auto-update merchant updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_merchant_updated
    BEFORE UPDATE ON merchants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_udhari_updated
    BEFORE UPDATE ON udhari
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_customer_updated
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
