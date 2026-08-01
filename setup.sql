-- ============================================================
-- Live Restaurant Scheduling System
-- Database Setup Script (Schema + Sample Data)
-- Target: SQLite 3
-- ============================================================
-- Run this whole file against your .db file (e.g. practice.db)
-- to build a fresh sample database for testing.
--
-- In VS Code (SQLite extension): open this file, make sure the
-- active connection is your .db file, then "Run on active
-- connection" or run the whole file.
--
-- From the command line:  sqlite3 practice.db < setup_sqlite.sql
-- ============================================================

PRAGMA foreign_keys = ON;

-- Drop tables if they already exist, so this script is re-runnable
DROP TABLE IF EXISTS Review;
DROP TABLE IF EXISTS Payment;
DROP TABLE IF EXISTS ReservationItem;
DROP TABLE IF EXISTS MenuItem;
DROP TABLE IF EXISTS Menu;
DROP TABLE IF EXISTS Reservation;
DROP TABLE IF EXISTS Slot;
DROP TABLE IF EXISTS RestaurantTable;
DROP TABLE IF EXISTS Customer;

-- ------------------------------------------------------------
-- 1. CUSTOMER
-- ------------------------------------------------------------
CREATE TABLE Customer (
    customer_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name      TEXT    NOT NULL,
    last_name       TEXT    NOT NULL,
    phone           TEXT,
    email           TEXT    UNIQUE,
    created_at      TEXT    DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 2. TABLE  (named `RestaurantTable` -- "Table" is a reserved word)
-- ------------------------------------------------------------
CREATE TABLE RestaurantTable (
    table_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number    INTEGER NOT NULL,
    capacity        INTEGER NOT NULL,
    section         TEXT    NOT NULL
        CHECK (section IN ('patio', 'main floor', 'bar'))
);

-- ------------------------------------------------------------
-- 3. SLOT  (weak entity -- depends on RestaurantTable)
-- ------------------------------------------------------------
CREATE TABLE Slot (
    table_id        INTEGER NOT NULL,
    slot_date       TEXT    NOT NULL,   -- 'YYYY-MM-DD'
    start_time      TEXT    NOT NULL,   -- 'HH:MM'
    end_time        TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'held', 'booked')),
    PRIMARY KEY (table_id, slot_date, start_time),
    FOREIGN KEY (table_id) REFERENCES RestaurantTable(table_id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 4. RESERVATION
--    Connects to Slot only (composite FK). Table is reached
--    indirectly through Slot -- no separate FK to RestaurantTable.
-- ------------------------------------------------------------
CREATE TABLE Reservation (
    reservation_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER NOT NULL,
    table_id        INTEGER NOT NULL,
    slot_date       TEXT    NOT NULL,
    start_time      TEXT    NOT NULL,
    size            INTEGER NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at      TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)
        ON DELETE CASCADE,
    FOREIGN KEY (table_id, slot_date, start_time)
        REFERENCES Slot(table_id, slot_date, start_time)
        ON DELETE CASCADE,
    UNIQUE (table_id, slot_date, start_time)  -- enforces 1:1 with Slot
);

-- ------------------------------------------------------------
-- 5. MENU
-- ------------------------------------------------------------
CREATE TABLE Menu (
    menu_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_date       TEXT NOT NULL,
    meal_period     TEXT NOT NULL
        CHECK (meal_period IN ('lunch', 'dinner')),
    UNIQUE (menu_date, meal_period)
);

-- ------------------------------------------------------------
-- 6. MENU ITEM
-- ------------------------------------------------------------
CREATE TABLE MenuItem (
    item_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_id         INTEGER NOT NULL,
    name            TEXT    NOT NULL,
    description     TEXT,
    price           REAL    NOT NULL,
    category        TEXT    NOT NULL
        CHECK (category IN ('appetizer', 'entree', 'dessert', 'drink')),
    FOREIGN KEY (menu_id) REFERENCES Menu(menu_id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 7. RESERVATION ITEM (junction: Reservation <-> MenuItem)
-- ------------------------------------------------------------
CREATE TABLE ReservationItem (
    reservation_id  INTEGER NOT NULL,
    item_id         INTEGER NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (reservation_id, item_id),
    FOREIGN KEY (reservation_id) REFERENCES Reservation(reservation_id)
        ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES MenuItem(item_id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 8. PAYMENT (1:1 with Reservation)
-- ------------------------------------------------------------
CREATE TABLE Payment (
    payment_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id  INTEGER NOT NULL UNIQUE,
    amount          REAL    NOT NULL,
    method          TEXT    NOT NULL
        CHECK (method IN ('cash', 'visa', 'mastercard')),
    status          TEXT    NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'refunded')),
    timestamp       TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (reservation_id) REFERENCES Reservation(reservation_id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 9. REVIEW (1:1 with Reservation, partial participation)
-- ------------------------------------------------------------
CREATE TABLE Review (
    review_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id  INTEGER NOT NULL UNIQUE,
    rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (reservation_id) REFERENCES Reservation(reservation_id)
        ON DELETE CASCADE
);

-- ============================================================
-- SAMPLE DATA
-- ============================================================

-- Customers
INSERT INTO Customer (first_name, last_name, phone, email) VALUES
('Ava',    'Nguyen',  '513-555-0101', 'ava.nguyen@email.com'),
('Liam',   'Carter',  '513-555-0102', 'liam.carter@email.com'),
('Sofia',  'Martinez','513-555-0103', 'sofia.martinez@email.com'),
('Noah',   'Kim',     '513-555-0104', 'noah.kim@email.com');

-- Tables
INSERT INTO RestaurantTable (table_number, capacity, section) VALUES
(1, 2, 'patio'),
(2, 4, 'main floor'),
(3, 4, 'main floor'),
(4, 6, 'bar'),
(5, 2, 'patio');

-- Slots (two days: today and tomorrow, a few time windows each)
INSERT INTO Slot (table_id, slot_date, start_time, end_time, status) VALUES
(1, date('now'), '18:00', '19:30', 'booked'),
(1, date('now'), '19:30', '21:00', 'available'),
(2, date('now'), '18:00', '19:30', 'booked'),
(2, date('now'), '19:30', '21:00', 'available'),
(3, date('now'), '18:00', '19:30', 'available'),
(4, date('now'), '19:00', '21:00', 'held'),
(5, date('now'), '18:00', '19:00', 'available'),

(1, date('now', '+1 day'), '18:00', '19:30', 'available'),
(2, date('now', '+1 day'), '18:00', '19:30', 'booked'),
(3, date('now', '+1 day'), '19:00', '20:30', 'available');

-- Menus (one dinner menu per day)
INSERT INTO Menu (menu_date, meal_period) VALUES
(date('now'), 'dinner'),
(date('now', '+1 day'), 'dinner');

-- Menu items
INSERT INTO MenuItem (menu_id, name, description, price, category) VALUES
(1, 'Bruschetta',        'Grilled bread, tomato, basil',          8.50,  'appetizer'),
(1, 'Grilled Salmon',    'Served with roasted vegetables',        24.00, 'entree'),
(1, 'Margherita Pizza',  'San Marzano tomato, mozzarella, basil',  16.00, 'entree'),
(1, 'Tiramisu',          'Classic Italian dessert',                7.50,  'dessert'),
(1, 'House Red Wine',    'Glass',                                  9.00,  'drink'),

(2, 'Caesar Salad',      'Romaine, parmesan, house dressing',      9.00,  'appetizer'),
(2, 'Ribeye Steak',      '12oz, served with fries',                29.00, 'entree'),
(2, 'Mushroom Risotto',  'Arborio rice, wild mushrooms',           18.00, 'entree'),
(2, 'Chocolate Cake',    'Warm, with vanilla ice cream',           8.00,  'dessert');

-- Reservations
-- (must match an existing Slot's table_id/date/start_time exactly)
INSERT INTO Reservation (customer_id, table_id, slot_date, start_time, size, status) VALUES
(1, 1, date('now'), '18:00', 2, 'confirmed'),
(2, 2, date('now'), '18:00', 4, 'confirmed'),
(3, 2, date('now', '+1 day'), '18:00', 3, 'pending');

-- Reservation items (pre-orders)
INSERT INTO ReservationItem (reservation_id, item_id, quantity) VALUES
(1, 2, 1),   -- Ava: Grilled Salmon
(1, 5, 2),   -- Ava: 2x House Red Wine
(2, 7, 2),   -- Liam's party: 2x Ribeye Steak
(2, 4, 1);   -- Liam's party: Tiramisu

-- Payments (only for confirmed reservations)
INSERT INTO Payment (reservation_id, amount, method, status) VALUES
(1, 42.00, 'visa',      'completed'),
(2, 74.00, 'mastercard','completed');

-- Reviews (optional -- only one customer left one so far)
INSERT INTO Review (reservation_id, rating, comment) VALUES
(1, 5, 'Great service and the salmon was fantastic!');

-- ============================================================
-- Quick sanity checks (optional -- uncomment to run manually)
-- ============================================================
-- SELECT * FROM Customer;
-- SELECT * FROM RestaurantTable;
-- SELECT * FROM Slot;
-- SELECT * FROM Reservation;
-- SELECT * FROM Menu;
-- SELECT * FROM MenuItem;
-- SELECT * FROM ReservationItem;
-- SELECT * FROM Payment;
-- SELECT * FROM Review;