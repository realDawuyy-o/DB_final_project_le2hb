-- ============================================================
-- Slot Sprint -- Live Scheduling Game
-- Database Setup Script (Schema + Seed Data)
-- Target: SQLite 3, executed automatically by server.js on boot
-- via Node's built-in node:sqlite module.
-- ============================================================
-- This script is re-run every time the server starts, so the
-- database always begins from a fresh, predictable state.
-- ============================================================

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS slots;
DROP TABLE IF EXISTS app_state;

-- ------------------------------------------------------------
-- 1. APP_STATE -- single key/value table for game-wide state
--    (e.g. which slot is currently held before scheduling)
-- ------------------------------------------------------------
CREATE TABLE app_state (
    key     TEXT PRIMARY KEY,
    value   TEXT
);

INSERT INTO app_state (key, value) VALUES ('selected_slot_id', NULL);

-- ------------------------------------------------------------
-- 2. SLOTS -- 7 days x 8 times-of-day = 56 tiles in the matrix
-- ------------------------------------------------------------
CREATE TABLE slots (
    id      TEXT PRIMARY KEY,   -- '<Day>-<Time>', e.g. 'Mon-12:00'
    day     TEXT NOT NULL
        CHECK (day IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
    time    TEXT NOT NULL
        CHECK (time IN ('12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00')),
    state   TEXT NOT NULL DEFAULT 'available'
        CHECK (state IN ('available', 'unavailable', 'scheduled'))
);

-- Seed all 7 x 8 = 56 day/time combinations as available; the
-- running app randomizes availability every 2 seconds after boot.
INSERT INTO slots (id, day, time, state)
SELECT day_list.day || '-' || time_list.time, day_list.day, time_list.time, 'available'
FROM (
    SELECT 'Mon' AS day UNION ALL SELECT 'Tue' UNION ALL SELECT 'Wed' UNION ALL SELECT 'Thu'
    UNION ALL SELECT 'Fri' UNION ALL SELECT 'Sat' UNION ALL SELECT 'Sun'
) AS day_list
CROSS JOIN (
    SELECT '12:00' AS time UNION ALL SELECT '13:00' UNION ALL SELECT '14:00' UNION ALL SELECT '15:00'
    UNION ALL SELECT '16:00' UNION ALL SELECT '17:00' UNION ALL SELECT '18:00' UNION ALL SELECT '19:00'
) AS time_list;

-- ------------------------------------------------------------
-- 3. MENU_ITEMS -- fixed menu per day of the week
-- ------------------------------------------------------------
CREATE TABLE menu_items (
    id      TEXT PRIMARY KEY,
    day     TEXT NOT NULL
        CHECK (day IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
    name    TEXT NOT NULL,
    price   REAL NOT NULL
);

INSERT INTO menu_items (id, day, name, price) VALUES
('mon-pizza',        'Mon', 'Margherita Pizza',      12),
('mon-salad',        'Mon', 'Caesar Salad',           8),
('mon-chicken',      'Mon', 'Grilled Chicken',       14),
('mon-tiramisu',     'Mon', 'Tiramisu',               6),

('tue-tacos',        'Tue', 'Beef Tacos',            11),
('tue-stirfry',      'Tue', 'Veggie Stir Fry',       10),
('tue-miso',         'Tue', 'Miso Soup',              5),
('tue-sorbet',       'Tue', 'Mango Sorbet',           6),

('wed-carbonara',    'Wed', 'Spaghetti Carbonara',   13),
('wed-garlic-bread', 'Wed', 'Garlic Bread',           4),
('wed-minestrone',   'Wed', 'Minestrone Soup',        7),
('wed-pannacotta',   'Wed', 'Panna Cotta',            6),

('thu-ribs',         'Thu', 'BBQ Ribs',              16),
('thu-cornbread',    'Thu', 'Cornbread',              5),
('thu-coleslaw',     'Thu', 'Coleslaw',               4),
('thu-applepie',     'Thu', 'Apple Pie',              6),

('fri-fishchips',    'Fri', 'Fish and Chips',        13),
('fri-chowder',      'Fri', 'Clam Chowder',           7),
('fri-sidesalad',    'Fri', 'Side Salad',             4),
('fri-keylime',      'Fri', 'Key Lime Pie',           6),

('sat-sushi',        'Sat', 'Sushi Platter',         18),
('sat-edamame',      'Sat', 'Edamame',                5),
('sat-ramen',        'Sat', 'Miso Ramen',            12),
('sat-mochi',        'Sat', 'Mochi Ice Cream',        5),

('sun-roast',        'Sun', 'Sunday Roast',          17),
('sun-yorkshire',    'Sun', 'Yorkshire Pudding',      4),
('sun-veg',          'Sun', 'Roasted Vegetables',     5),
('sun-pudding',      'Sun', 'Sticky Toffee Pudding',  6);

-- ------------------------------------------------------------
-- 4. ORDER_ITEMS -- checklist quantities per scheduled slot
-- ------------------------------------------------------------
CREATE TABLE order_items (
    slot_id     TEXT NOT NULL,
    dish_id     TEXT NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 0
        CHECK (quantity BETWEEN 0 AND 9),
    PRIMARY KEY (slot_id, dish_id),
    FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE,
    FOREIGN KEY (dish_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 5. PAYMENTS -- demo "Pay" button confirmations
-- ------------------------------------------------------------
CREATE TABLE payments (
    payment_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id     TEXT NOT NULL,
    amount      REAL NOT NULL,
    paid_at     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
);
