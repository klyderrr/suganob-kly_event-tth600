-- =====================================================
-- kly — Event management
-- Schema + seed data (MySQL 8.0.16+ / MariaDB 10.2+)
-- Derived from: events.html, venues.html, attendees.html,
--               registrations.html
-- =====================================================

CREATE DATABASE IF NOT EXISTS kly
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE kly;

DROP VIEW  IF EXISTS event_registration_counts;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS attendees;
DROP TABLE IF EXISTS venues;

-- -----------------------------------------------------
-- 02 Venues  (city, capacity, contact)
-- -----------------------------------------------------
CREATE TABLE venues (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120)  NOT NULL,
  city          VARCHAR(80)   NOT NULL,
  capacity      INT UNSIGNED  NOT NULL,
  contact_email VARCHAR(255)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_venues_name (name),
  CONSTRAINT chk_venues_capacity CHECK (capacity > 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 03 Attendees  (name, email, organization)
-- -----------------------------------------------------
CREATE TABLE attendees (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  full_name    VARCHAR(120)  NOT NULL,
  email        VARCHAR(255)  NOT NULL,
  organization VARCHAR(120)  NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendees_email (email),
  KEY idx_attendees_name (full_name)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 01 Events  (title, category, status, date, venue)
-- -----------------------------------------------------
CREATE TABLE events (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  title      VARCHAR(160)  NOT NULL,
  category   ENUM('Conference','Concert','Workshop','Meetup') NOT NULL,
  status     ENUM('draft','open','sold_out')                  NOT NULL DEFAULT 'draft',
  event_date DATE          NOT NULL,
  venue_id   INT UNSIGNED  NOT NULL,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_date (event_date),
  KEY idx_events_venue (venue_id),
  -- Block deleting a venue that still has events
  CONSTRAINT fk_events_venue FOREIGN KEY (venue_id)
    REFERENCES venues (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 04 Registrations  (attendee + event, ticket type, status)
-- -----------------------------------------------------
CREATE TABLE registrations (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id      INT UNSIGNED NOT NULL,
  attendee_id   INT UNSIGNED NOT NULL,
  ticket_type   ENUM('General','VIP','Speaker')                NOT NULL DEFAULT 'General',
  status        ENUM('pending','confirmed','cancelled')        NOT NULL DEFAULT 'pending',
  registered_on DATE         NOT NULL,
  PRIMARY KEY (id),
  -- An attendee can only register once per event
  UNIQUE KEY uq_registration (event_id, attendee_id),
  KEY idx_reg_attendee (attendee_id),
  CONSTRAINT fk_reg_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reg_attendee FOREIGN KEY (attendee_id)
    REFERENCES attendees (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- View: powers the "N registration(s)" count in each
-- group header on the Registrations page
-- -----------------------------------------------------
CREATE VIEW event_registration_counts AS
SELECT e.id AS event_id,
       e.title,
       COUNT(r.id) AS registration_count
FROM events e
LEFT JOIN registrations r ON r.event_id = e.id
GROUP BY e.id, e.title;

-- =====================================================
-- Seed data (matches the mockup)
-- =====================================================

INSERT INTO venues (id, name, city, capacity, contact_email) VALUES
  (1, 'Harborlight Hall', 'Quezon City', 480, 'bookings@harborlight.ph'),
  (2, 'The Underline',    'Makati',      220, NULL),
  (3, 'Maple Studio',     'Pasig',        60, NULL);

INSERT INTO attendees (id, full_name, email, organization) VALUES
  (1, 'Diego Reyes',      'diego@freelance.dev',      'Freelance'),
  (2, 'Ken Ibarra',       'ken@studiobloc.com',       'Studio Bloc'),
  (3, 'Mara Villanueva',  'mara.v@northfield.co',     'Northfield Co.'),
  (4, 'Priya Santos',     'priya.santos@lumen.io',    'Lumen');

INSERT INTO events (id, title, category, status, event_date, venue_id) VALUES
  (1, 'Signal Conference',   'Conference', 'open',     '2026-10-14', 1),
  (2, 'Nightwave Sessions',  'Concert',    'sold_out', '2026-10-22', 2),
  (3, 'Founders Workshop',   'Workshop',   'draft',    '2026-11-02', 3),
  (4, 'City Makers Meetup',  'Meetup',     'open',     '2026-11-09', 2);

INSERT INTO registrations (id, event_id, attendee_id, ticket_type, status, registered_on) VALUES
  (1, 1, 3, 'VIP',     'confirmed', '2026-09-02'),  -- Mara    -> Signal Conference
  (2, 2, 2, 'General', 'confirmed', '2026-09-15'),  -- Ken     -> Nightwave Sessions
  (3, 3, 4, 'Speaker', 'pending',   '2026-09-20'),  -- Priya   -> Founders Workshop
  (4, 4, 1, 'General', 'cancelled', '2026-09-28');  -- Diego   -> City Makers Meetup

-- =====================================================
-- Example queries for each page
-- =====================================================

-- Events page (card grid)
-- SELECT e.title, e.category, e.status, e.event_date, v.name AS venue
-- FROM events e JOIN venues v ON v.id = e.venue_id
-- ORDER BY e.event_date;

-- Venues page (list + detail)
-- SELECT id, name, city, capacity, contact_email FROM venues ORDER BY name;

-- Attendees page (grouped A–Z directory)
-- SELECT UPPER(LEFT(full_name, 1)) AS letter, full_name, email, organization
-- FROM attendees ORDER BY full_name;

-- Registrations page (grouped by event)
-- SELECT e.title, a.full_name, r.ticket_type, r.registered_on, r.status
-- FROM registrations r
-- JOIN events e    ON e.id = r.event_id
-- JOIN attendees a ON a.id = r.attendee_id
-- ORDER BY e.event_date, r.registered_on;
