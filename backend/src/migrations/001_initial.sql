CREATE TABLE IF NOT EXISTS directions (
  id SERIAL PRIMARY KEY,
  specialty TEXT NOT NULL,
  specialty_search TEXT NOT NULL DEFAULT '',
  study_form TEXT NOT NULL CHECK(study_form IN ('Очная', 'Заочная', 'Очно-заочная')),
  funding TEXT NOT NULL DEFAULT 'Бюджет',
  budget_places INTEGER,
  updated_at TIMESTAMPTZ,
  UNIQUE(specialty, study_form, funding)
);

CREATE TABLE IF NOT EXISTS applicants (
  id SERIAL PRIMARY KEY,
  direction_id INTEGER NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  snils_normalized VARCHAR(11) NOT NULL,
  average_score TEXT NOT NULL,
  original_status TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  full_name_search TEXT NOT NULL DEFAULT '',
  original_provided BOOLEAN NOT NULL DEFAULT FALSE,
  priority_enrollment BOOLEAN NOT NULL DEFAULT FALSE,
  application_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  original_provided_at TIMESTAMPTZ,
  priority_enrollment_at TIMESTAMPTZ,
  funding_type TEXT NOT NULL DEFAULT 'Бюджет',
  education_base TEXT NOT NULL DEFAULT '9',
  UNIQUE(direction_id, snils_normalized, funding_type)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS priority_enrollment BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS application_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS original_provided_at TIMESTAMPTZ;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS priority_enrollment_at TIMESTAMPTZ;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS funding_type TEXT NOT NULL DEFAULT 'Бюджет';
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS education_base TEXT NOT NULL DEFAULT '9';
ALTER TABLE directions ADD COLUMN IF NOT EXISTS paid_places INTEGER;

ALTER TABLE directions DROP CONSTRAINT IF EXISTS directions_study_form_check;
ALTER TABLE directions ADD CONSTRAINT directions_study_form_check
  CHECK(study_form IN ('Очная', 'Заочная', 'Очно-заочная'));

CREATE INDEX IF NOT EXISTS idx_applicants_snils ON applicants(snils_normalized);
CREATE INDEX IF NOT EXISTS idx_applicants_full_name_search ON applicants(full_name_search);
CREATE INDEX IF NOT EXISTS idx_applicants_original ON applicants(original_provided);
CREATE INDEX IF NOT EXISTS idx_applicants_priority ON applicants(priority_enrollment);
CREATE INDEX IF NOT EXISTS idx_applicants_application_created_at ON applicants(application_created_at);
CREATE INDEX IF NOT EXISTS idx_applicants_original_provided_at ON applicants(original_provided_at);
CREATE INDEX IF NOT EXISTS idx_applicants_priority_enrollment_at ON applicants(priority_enrollment_at);
CREATE INDEX IF NOT EXISTS idx_applicants_funding_type ON applicants(funding_type);
CREATE INDEX IF NOT EXISTS idx_applicants_education_base ON applicants(education_base);
CREATE INDEX IF NOT EXISTS idx_directions_specialty_search ON directions(specialty_search);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);


ALTER TABLE applicants DROP CONSTRAINT IF EXISTS applicants_direction_id_snils_normalized_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_applicants_direction_snils_funding_unique
  ON applicants(direction_id, snils_normalized, funding_type);
