USE beam;

SET @now = UNIX_TIMESTAMP() * 1000;

-- =========================
-- BRANDS
-- =========================

INSERT INTO brands
(name, industry, location, color, about, created_at)
VALUES
('NovaTech', 'Technology', 'Bangalore', '#6C63FF',
 'Consumer technology company looking for creators to showcase innovative products.', @now),

('Urban Brew', 'Food & Beverage', 'Hyderabad', '#FF8A3D',
 'Modern coffee brand focused on young professionals and creators.', @now),

('FitFuel', 'Health & Fitness', 'Mumbai', '#27AE60',
 'Fitness and nutrition brand building a community around healthy lifestyles.', @now);

-- =========================
-- INFLUENCERS
-- =========================

INSERT INTO influencers
(handle, name, category, platforms, followers, engagement, location, rate, bio, color, completed_count, created_at)
VALUES
('@techwitharjun', 'Arjun Mehta', 'Technology',
 '["Instagram","YouTube"]', 125000, 5.80, 'Bangalore', 25000,
 'Tech reviewer creating practical gadget and software content.',
 '#6C63FF', 18, @now),

('@foodiepriya', 'Priya Sharma', 'Food',
 '["Instagram","YouTube"]', 87000, 7.20, 'Hyderabad', 18000,
 'Food creator covering cafes, restaurants and easy recipes.',
 '#FF8A3D', 27, @now),

('@fitwithrahul', 'Rahul Verma', 'Fitness',
 '["Instagram","YouTube"]', 210000, 4.90, 'Mumbai', 35000,
 'Fitness creator focused on workouts, nutrition and lifestyle.',
 '#27AE60', 31, @now),

('@stylebyneha', 'Neha Kapoor', 'Fashion',
 '["Instagram"]', 156000, 6.40, 'Delhi', 30000,
 'Fashion and lifestyle creator working with emerging brands.',
 '#E056FD', 22, @now),

('@gamingwithsam', 'Sam Roy', 'Gaming',
 '["YouTube","Instagram"]', 320000, 8.10, 'Kolkata', 45000,
 'Gaming creator covering competitive games, reviews and livestreams.',
 '#3498DB', 40, @now);

-- =========================
-- LINK YOUR EXISTING USERS
-- =========================

-- Your existing brand account -> NovaTech
UPDATE users
SET brand_id = (SELECT id FROM brands WHERE name = 'NovaTech' LIMIT 1)
WHERE email = 'pixelfoger@gmail.com';

-- Your existing influencer account -> Arjun
UPDATE users
SET influencer_id = (SELECT id FROM influencers WHERE handle = '@techwitharjun' LIMIT 1)
WHERE email = 'discordnsfw285@gmail.com';

-- =========================
-- CAMPAIGNS
-- =========================

INSERT INTO campaigns
(brand_id, title, category, platform, min_followers, min_engagement,
 budget, location, brief, deliverables, status, created_at)
VALUES

(
 (SELECT id FROM brands WHERE name = 'NovaTech' LIMIT 1),
 'Next-Gen Smartphone Launch',
 'Technology',
 'Instagram',
 50000, 4.00, 75000, 'Bangalore',
 'Create engaging content introducing our new smartphone to a young technology audience.',
 '["1 Reel","3 Stories","1 Product Photo"]',
 'open', @now
),

(
 (SELECT id FROM brands WHERE name = 'Urban Brew' LIMIT 1),
 'Summer Coffee Campaign',
 'Food & Beverage',
 'Instagram',
 30000, 5.00, 40000, 'Hyderabad',
 'Showcase our summer drinks and create authentic cafe-focused content.',
 '["1 Reel","2 Stories"]',
 'open', @now
),

(
 (SELECT id FROM brands WHERE name = 'FitFuel' LIMIT 1),
 '30 Day Fitness Challenge',
 'Fitness',
 'YouTube',
 100000, 4.00, 100000, 'Mumbai',
 'Document a fitness challenge while naturally incorporating FitFuel products.',
 '["2 YouTube Videos","4 Shorts","4 Instagram Stories"]',
 'open', @now
);

-- =========================
-- APPLICATIONS
-- =========================

INSERT INTO applications
(campaign_id, influencer_id, status, pitch, score, created_at)
VALUES

(
 (SELECT id FROM campaigns WHERE title = 'Next-Gen Smartphone Launch' LIMIT 1),
 (SELECT id FROM influencers WHERE handle = '@techwitharjun' LIMIT 1),
 'review',
 'I would create a hands-on smartphone review highlighting the camera, performance and everyday usability.',
 92, @now
),

(
 (SELECT id FROM campaigns WHERE title = 'Summer Coffee Campaign' LIMIT 1),
 (SELECT id FROM influencers WHERE handle = '@foodiepriya' LIMIT 1),
 'applied',
 'I can create a fun cafe experience Reel showing the new summer drinks and the atmosphere of Urban Brew.',
 88, @now
),

(
 (SELECT id FROM campaigns WHERE title = '30 Day Fitness Challenge' LIMIT 1),
 (SELECT id FROM influencers WHERE handle = '@fitwithrahul' LIMIT 1),
 'accepted',
 'I will document my 30-day fitness journey and integrate FitFuel naturally into my daily routine.',
 95, @now
),

(
 (SELECT id FROM campaigns WHERE title = 'Next-Gen Smartphone Launch' LIMIT 1),
 (SELECT id FROM influencers WHERE handle = '@gamingwithsam' LIMIT 1),
 'applied',
 'I can demonstrate the phone performance through mobile gaming benchmarks and gameplay.',
 84, @now
);

-- =========================
-- APPLICATION HISTORY
-- =========================

INSERT INTO application_history
(application_id, status, changed_at)
SELECT id, 'applied', @now
FROM applications
WHERE status IN ('review', 'accepted');

INSERT INTO application_history
(application_id, status, changed_at)
SELECT id, status, @now
FROM applications
WHERE status IN ('review', 'accepted');

-- =========================
-- NOTIFICATIONS
-- =========================

INSERT INTO notifications
(user_id, text, is_read, created_at)
VALUES
(
 (SELECT id FROM users WHERE email = 'pixelfoger@gmail.com' LIMIT 1),
 'New application received for your campaign "Next-Gen Smartphone Launch".',
 0, @now
),

(
 (SELECT id FROM users WHERE email = 'pixelfoger@gmail.com' LIMIT 1),
 'Your campaign "Next-Gen Smartphone Launch" is now live.',
 1, @now
),

(
 (SELECT id FROM users WHERE email = 'discordnsfw285@gmail.com' LIMIT 1),
 'Your application for "Next-Gen Smartphone Launch" is being reviewed.',
 0, @now
),

(
 (SELECT id FROM users WHERE email = 'discordnsfw285@gmail.com' LIMIT 1),
 'You have a new campaign that matches your technology profile.',
 0, @now
);