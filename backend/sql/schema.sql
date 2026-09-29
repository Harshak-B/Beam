-- =====================================================================
--  Beam — MySQL schema
--  Works on MySQL 5.7+ / 8.x and MariaDB 10.4+.
--
--  HOW TO RUN (pick one):
--    mysql -u YOUR_USER -p < sql/schema.sql
--    or paste this file into MySQL Workbench / phpMyAdmin and execute it.
--
--  ▶ If you want a database name other than `beam`, change it in the two
--    lines below AND set the same name as DB_NAME in backend/.env.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `beam`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `beam`;

-- Timestamps are stored as BIGINT milliseconds since the Unix epoch. That is
-- what the frontend already uses, and it avoids time-zone surprises between
-- Node and MySQL.

-- ---------------------------------------------------------------- brands
CREATE TABLE IF NOT EXISTS brands (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  industry    VARCHAR(60)  NOT NULL,
  location    VARCHAR(60)  NOT NULL,
  color       VARCHAR(9)   NOT NULL DEFAULT '#FFC245',
  about       TEXT NULL,
  created_at  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------- influencers
CREATE TABLE IF NOT EXISTS influencers (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  handle           VARCHAR(60)  NOT NULL,
  name             VARCHAR(120) NOT NULL,
  category         VARCHAR(60)  NOT NULL,
  platforms        JSON NOT NULL,                       -- e.g. ["Instagram","YouTube"]
  followers        INT UNSIGNED NOT NULL DEFAULT 0,
  engagement       DECIMAL(5,2) NOT NULL DEFAULT 0,     -- percent
  location         VARCHAR(60)  NOT NULL,
  rate             INT UNSIGNED NOT NULL DEFAULT 0,     -- expected rate, INR
  bio              TEXT NULL,
  color            VARCHAR(9)   NOT NULL DEFAULT '#FFC245',
  completed_count  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_influencers_handle (handle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------- users
-- One login per brand or creator profile. Passwords are stored as bcrypt hashes.
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(190) NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,
  name           VARCHAR(120) NOT NULL,
  role           ENUM('brand','influencer') NOT NULL,
  brand_id       INT UNSIGNED NULL,
  influencer_id  INT UNSIGNED NULL,
  created_at     BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_brand (brand_id),
  KEY idx_users_influencer (influencer_id),
  CONSTRAINT fk_users_brand      FOREIGN KEY (brand_id)      REFERENCES brands(id)      ON DELETE CASCADE,
  CONSTRAINT fk_users_influencer FOREIGN KEY (influencer_id) REFERENCES influencers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------- campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  brand_id        INT UNSIGNED NOT NULL,
  title           VARCHAR(150) NOT NULL,
  category        VARCHAR(60)  NOT NULL,
  platform        VARCHAR(30)  NOT NULL,
  min_followers   INT UNSIGNED NOT NULL DEFAULT 0,
  min_engagement  DECIMAL(5,2) NOT NULL DEFAULT 0,
  budget          INT UNSIGNED NOT NULL,                -- INR
  location        VARCHAR(60)  NOT NULL,
  brief           TEXT NOT NULL,
  deliverables    JSON NOT NULL,                        -- e.g. ["1 reel","3 stories"]
  status          ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_at      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_campaigns_brand (brand_id),
  KEY idx_campaigns_status (status),
  CONSTRAINT fk_campaigns_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------- applications
CREATE TABLE IF NOT EXISTS applications (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id    INT UNSIGNED NOT NULL,
  influencer_id  INT UNSIGNED NOT NULL,
  status         ENUM('applied','review','accepted','progress','completed','rejected') NOT NULL DEFAULT 'applied',
  pitch          TEXT NOT NULL,
  score          TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- match score, 0-100
  created_at     BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_application_once (campaign_id, influencer_id),   -- one pitch per creator per campaign
  KEY idx_applications_influencer (influencer_id),
  CONSTRAINT fk_applications_campaign   FOREIGN KEY (campaign_id)   REFERENCES campaigns(id)   ON DELETE CASCADE,
  CONSTRAINT fk_applications_influencer FOREIGN KEY (influencer_id) REFERENCES influencers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail of every status change on an application.
CREATE TABLE IF NOT EXISTS application_history (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id  INT UNSIGNED NOT NULL,
  status          VARCHAR(20) NOT NULL,
  changed_at      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_history_application (application_id),
  CONSTRAINT fk_history_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  text        VARCHAR(500) NOT NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, is_read),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
