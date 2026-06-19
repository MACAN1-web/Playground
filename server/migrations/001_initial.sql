CREATE TABLE IF NOT EXISTS directions (
  id SERIAL PRIMARY KEY,
  specialty TEXT NOT NULL,
  specialty_search TEXT NOT NULL DEFAULT '',
  study_form TEXT NOT NULL CHECK(study_form IN ('Очная', 'Заочная')),
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
  UNIQUE(direction_id, snils_normalized)
);

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS priority_enrollment BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_applicants_snils ON applicants(snils_normalized);
CREATE INDEX IF NOT EXISTS idx_applicants_full_name_search ON applicants(full_name_search);
CREATE INDEX IF NOT EXISTS idx_applicants_original ON applicants(original_provided);
CREATE INDEX IF NOT EXISTS idx_applicants_priority ON applicants(priority_enrollment);
CREATE INDEX IF NOT EXISTS idx_directions_specialty_search ON directions(specialty_search);

ALTER TABLE directions ADD COLUMN IF NOT EXISTS paid_places INTEGER;
