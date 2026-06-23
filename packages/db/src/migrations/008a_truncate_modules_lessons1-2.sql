-- =============================================================================
-- Training seed: 10 base modules + 8 service-specific modules
-- Interactive SCORM-style content. Lesson bodies are authored HTML rendered
-- via the .lesson-content CSS class in the cleaner app.
--
-- Safe to re-run: TRUNCATE then re-insert.
-- =============================================================================

TRUNCATE training_quiz_questions, training_lessons, training_modules CASCADE;

-- ─── Base Modules ─────────────────────────────────────────────────────────────

INSERT INTO training_modules (id, title, description, category, required_type, service_key, estimated_minutes, sort_order, passing_score, max_attempts) VALUES
('11111111-0001-0001-0001-000000000001', 'Welcome & Cleaner Expectations', 'What it means to work on the Sweepr platform as an independent cleaner, your responsibilities, and what customers expect.', 'onboarding', 'base', NULL, 18, 1, 80, 3),
('11111111-0001-0001-0001-000000000002', 'Using the Sweepr App', 'A complete walkthrough of the Sweepr Pro app — availability, accepting jobs, navigation, job status, and getting paid.', 'platform', 'base', NULL, 24, 2, 80, 3),
('11111111-0001-0001-0001-000000000003', 'Customer Privacy & Conduct', 'The standards of conduct expected inside a customer''s home, secure access handling, and your privacy obligations.', 'conduct', 'base', NULL, 26, 3, 80, 3),
('11111111-0001-0001-0001-000000000004', 'Legal & Compliance', 'Your obligations as an independent contractor, prohibited marketplace activities, insurance, and data privacy law.', 'legal', 'base', NULL, 28, 4, 80, 3),
('11111111-0001-0001-0001-000000000005', 'Safety & Chemicals', 'Safe use and storage of cleaning chemicals, PPE, ergonomic technique, and emergency procedures.', 'safety', 'base', NULL, 28, 5, 80, 3),
('11111111-0001-0001-0001-000000000006', 'Cleaning Quality Standards', 'The Sweepr quality benchmark — what every clean must meet, sequencing, common failures, and special surfaces.', 'quality', 'base', NULL, 32, 6, 80, 3),
('11111111-0001-0001-0001-000000000007', 'Customer Communication', 'Communicating professionally before, during, and after a job, and de-escalating difficult situations.', 'communication', 'base', NULL, 22, 7, 80, 3),
('11111111-0001-0001-0001-000000000008', 'Damage, Claims & Insurance', 'Preventing damage, what to do when it happens, how claims work, and protecting yourself with documentation.', 'compliance', 'base', NULL, 24, 8, 80, 3),
('11111111-0001-0001-0001-000000000009', 'Reliability & Ratings', 'How your reliability and quality scores are calculated, the tier system, and recovering your standing.', 'performance', 'base', NULL, 22, 9, 80, 3),
('11111111-0001-0001-0001-000000000010', 'Technical Support', 'Common app issues, navigation problems, payout discrepancies, and how to reach support effectively.', 'support', 'base', NULL, 20, 10, 80, 3);

-- ─── Service-Specific Modules ─────────────────────────────────────────────────

INSERT INTO training_modules (id, title, description, category, required_type, service_key, estimated_minutes, sort_order, passing_score, max_attempts) VALUES
('22222222-0002-0002-0002-000000000001', 'Standard Cleaning', 'Systematic approach for standard maintenance cleans — sequencing, efficiency, and consistency across repeat visits.', 'service', 'service_specific', 'standard_cleaning', 18, 20, 80, 3),
('22222222-0002-0002-0002-000000000002', 'Deep Cleaning', 'Thorough deep-clean techniques: appliances, grout, baseboards, and the areas missed in standard cleans.', 'service', 'service_specific', 'deep_cleaning', 20, 21, 80, 3),
('22222222-0002-0002-0002-000000000003', 'Move-In / Move-Out', 'The elevated standards for vacant-property cleans, checklist discipline, and documentation best practices.', 'service', 'service_specific', 'move_in_out', 20, 22, 80, 3),
('22222222-0002-0002-0002-000000000004', 'Homes With Pets', 'Managing pet hair, dander, and odors while staying safe and respecting the customer''s animals.', 'service', 'service_specific', 'pet_home', 16, 23, 80, 3),
('22222222-0002-0002-0002-000000000005', 'Laundry Add-On', 'Washing, drying, folding, and putting away laundry to platform standards and customer preferences.', 'service', 'service_specific', 'laundry_addon', 12, 24, 80, 3),
('22222222-0002-0002-0002-000000000006', 'Dishes Add-On', 'Proper dishwashing, breakage prevention, and putting items away correctly.', 'service', 'service_specific', 'dishes_addon', 12, 25, 80, 3),
('22222222-0002-0002-0002-000000000007', 'Interior Windows', 'Streak-free technique, tools, and safety when reaching high or hard-to-reach interior windows.', 'service', 'service_specific', 'interior_windows', 14, 26, 80, 3),
('22222222-0002-0002-0002-000000000008', 'Organization Add-On', 'Helping customers declutter and organize without moving valuables or making unsolicited decisions.', 'service', 'service_specific', 'organization', 14, 27, 80, 3);

-- =============================================================================
-- LESSONS (authored HTML, rendered via .lesson-content)
-- =============================================================================

-- ── Module 1: Welcome & Cleaner Expectations ─────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000001', 'What Is Sweepr?',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand how the Sweepr marketplace works and where you fit into it.</div>
<h2>A two-sided marketplace</h2>
<p>Sweepr connects homeowners and renters with vetted independent cleaning professionals. Unlike a traditional cleaning company, Sweepr does <strong>not</strong> employ cleaners. You work as an independent contractor: you set your own schedule and accept only the jobs you want.</p>
<p>The platform handles booking, payment processing, customer messaging, and dispute resolution. Your role is to deliver high-quality cleaning that meets our published standards. When you do, customers rebook, your rating rises, and you receive higher-priority job offers.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Think of Sweepr as your business-development partner. We bring the customers; you bring the expertise. Your success is tied directly to your reliability, quality, and professionalism.</div>
<h2>Why this model matters</h2>
<p>Because you are independent, your reputation is your business. Every clean either builds or erodes the trust that earns you repeat work. The platform rewards consistency far more than occasional brilliance.</p>
<ul><li>You choose when to work and which services to offer.</li><li>You keep your tips in full.</li><li>Your public rating follows you and drives your job offers.</li></ul>
<h2>Summary</h2>
<p>Sweepr is a marketplace, not an employer. You are a small business owner using our platform to find and serve customers — and your professionalism is what keeps that pipeline full.</p>', 1, 5),

('11111111-0001-0001-0001-000000000001', 'Your Role as an Independent Contractor',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know your core legal and financial responsibilities as a contractor.</div>
<h2>You run your own business</h2>
<p>As an independent contractor you are responsible for your own taxes, tools, and transportation. Sweepr does not withhold income tax, pay employer FICA, or provide benefits. You will receive a <strong>1099-NEC</strong> at year end for earnings over $600.</p>
<div class="callout callout-warning"><strong>Important:</strong> You are required to maintain your own liability insurance. Sweepr''s platform coverage is supplemental and only activates after your personal coverage is exhausted. A lapsed policy means suspension from new jobs.</div>
<h2>Flexibility and responsibility</h2>
<p>Independence gives you real freedom: decide when to be available, which services to offer, and how far to travel. It also means you must conduct yourself professionally at all times — your actions reflect on your own business, not just the platform.</p>
<ul><li>Set aside money for self-employment tax (15.3% of net earnings).</li><li>Consider quarterly estimated tax payments to avoid penalties.</li><li>Keep your insurance certificate current and on file.</li></ul>
<h2>Summary</h2>
<p>You are a business owner, not an employee. Taxes, insurance, and tools are yours to manage — and that ownership is what makes the flexibility possible.</p>', 2, 6),

('11111111-0001-0001-0001-000000000001', 'What Customers Expect',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will be able to describe the three expectations that drive every customer rating.</div>
<h2>Trust in their most personal space</h2>
<p>Customers book with high expectations. They are letting a stranger into their home and trusting them with their most personal space. Meeting and exceeding those expectations every time is what builds your reputation.</p>
<h2>The three core expectations</h2>
<ul><li><strong>Punctuality.</strong> Arrive within the agreed window, or message proactively if delayed. This is non-negotiable.</li><li><strong>Thoroughness.</strong> Every surface, corner, and item on the service checklist must be addressed.</li><li><strong>Respect.</strong> Treat the customer''s belongings and privacy as if a sharp-eyed owner is watching.</li></ul>
<div class="callout callout-info"><strong>Why ratings matter:</strong> A single 1-star review can lower your average meaningfully. A 4-star instead of 5-star clean reduces rebooking probability for that customer by over 60%. Consistency beats occasional excellence.</div>
<h2>Summary</h2>
<p>Punctual, thorough, and respectful — meet these three every time and your ratings, and your income, will take care of themselves.</p>', 3, 5);

-- ── Module 2: Using the Sweepr App ───────────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000002', 'Profile & Availability',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to set up a profile and availability that maximize job offers.</div>
<h2>Your profile is your storefront</h2>
<p>Complete profiles — clear professional photo, a well-written bio, accurate service offerings — receive more job offers than incomplete ones. Write a bio that highlights your experience and what sets you apart.</p>
<h2>Set availability accurately</h2>
<p>The matching engine only offers jobs during windows you mark available. If you mark yourself available but repeatedly decline or cancel, your reliability score drops. Update availability ahead of time when your schedule changes.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Tune your service radius. A smaller radius means fewer offers but less drive time; a larger radius means more offers but more fuel cost. Find the balance for your vehicle and schedule.</div>
<h2>Summary</h2>
<p>A complete profile and an honest, well-maintained availability calendar are the foundation of a steady stream of offers.</p>', 1, 6),

('11111111-0001-0001-0001-000000000002', 'Accepting & Managing Jobs',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how the offer window works and how to manage a job through completion.</div>
<h2>The 15-minute offer window</h2>
<p>When an offer arrives you typically have <strong>15 minutes</strong> to accept or decline. The offer screen shows job type, location, estimated duration, pay, and customer rating. Review everything before accepting.</p>
<div class="callout callout-warning"><strong>Important:</strong> Once you accept, the job is locked into your schedule. Canceling after acceptance damages your reliability score and may trigger a warning. Only accept jobs you are genuinely committed to.</div>
<h2>Managing the job</h2>
<p>Use the job management screen to view your schedule, navigate to the address, mark arrival, update status as you progress, and mark the job complete. Keeping statuses current keeps the customer informed and gives you a documented record if a dispute arises.</p>
<ul><li>Mark your arrival when you reach the property.</li><li>Update status as you complete checklist sections.</li><li>Mark complete only when the job is truly finished.</li></ul>
<h2>Summary</h2>
<p>Accept deliberately, then keep the app updated in real time — it protects both the customer experience and you.</p>', 2, 6),

('11111111-0001-0001-0001-000000000002', 'Navigation & Home Access',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to navigate to jobs and handle entry instructions securely.</div>
<h2>Getting there on time</h2>
<p>The app passes the address to your default maps app. Leave with enough time to arrive at the start of your window, accounting for traffic. If you''ll be late, message the customer through the in-app chat before the window closes.</p>
<h2>Entry instructions</h2>
<p>Keypad codes, lockbox combinations, building procedures, or doorman instructions appear in the job detail screen. Read them before you arrive so you''re not fumbling at the door.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Never photograph or share access codes outside Sweepr. All access is logged, and unauthorized sharing is grounds for immediate removal from the platform.</div>
<h2>Summary</h2>
<p>Plan your arrival, read entry instructions in advance, and treat every access code as sensitive information that stays inside the app.</p>', 3, 6),

('11111111-0001-0001-0001-000000000002', 'Getting Paid',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand how and when you get paid, and what to do about discrepancies.</div>
<h2>Payment flows through the platform</h2>
<p>You never collect payment directly from customers — all transactions happen through Sweepr. Earnings are deposited to your connected bank account via Stripe on a weekly rolling basis with a standard 7-day processing window.</p>
<h2>Your guaranteed pay and tips</h2>
<p>Your displayed pay is your guaranteed minimum. Tips are passed through in full and paid separately. If a job runs much longer than estimated through no fault of yours, document the extra work with photos and submit a time-adjustment request in the app.</p>
<div class="callout callout-warning"><strong>Important:</strong> Never discuss payment with customers directly. Payout issues go to support through the Help section.</div>
<h2>Summary</h2>
<p>Payments are automatic and weekly. Track them in the Earnings tab, download your 1099 each January, and route any payment problems through support — never the customer.</p>', 4, 6);
