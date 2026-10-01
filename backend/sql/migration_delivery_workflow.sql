USE beam;

CREATE TABLE IF NOT EXISTS deliverable_submissions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id  INT UNSIGNED NOT NULL,
  status          ENUM('submitted','changes_requested','approved') NOT NULL DEFAULT 'submitted',
  note            TEXT NOT NULL,
  submitted_at   BIGINT UNSIGNED NOT NULL,
  reviewed_at     BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_submission_application (application_id),
  CONSTRAINT fk_submission_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
