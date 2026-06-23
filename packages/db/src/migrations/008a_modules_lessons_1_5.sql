-- 008a: Modules + Lessons 1-5 (Welcome, App, Privacy, Legal, Safety)
-- Run this first.

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

-- ── Module 3: Customer Privacy & Conduct ─────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000003', 'The Trust Standard',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand why privacy matters legally and professionally, and the firm rules that protect both you and the customer.</div>
<h2>Why privacy is everything</h2>
<p>When you enter a customer''s home you are in one of the most intimate spaces in their life. They are trusting you with valuables, private documents, medications, and the safety of their family. This trust is the foundation of every successful cleaning business — and violating it, even in small ways, destroys the relationship permanently.</p>
<h2>Real examples of violations</h2>
<p>These are not hypothetical. Cleaners have been removed from platforms and faced civil liability for:</p>
<ul><li>Opening a medicine cabinet or nightstand out of curiosity.</li><li>Photographing a customer''s belongings or home layout.</li><li>Discussing what they saw in a customer''s home with friends or on social media.</li><li>Reading mail or financial documents left on a counter.</li></ul>
<div class="callout callout-danger"><strong>Critical:</strong> Never open drawers, closets, or cabinets not required for the service. Never handle personal items, mail, medications, or financial documents. If you see something illegal or dangerous, exit, lock up as instructed, and contact Sweepr support immediately.</div>
<h2>The discretion rule</h2>
<p>If a friend later asks whether you noticed anything interesting in a customer''s home, the only correct answer is to decline to discuss any details about the customer or their home. What you see inside a home stays inside that home.</p>
<h2>Summary</h2>
<p>Treat every item as belonging to someone who will immediately notice if it''s moved. Curiosity is not worth your business — discretion is non-negotiable.</p>', 1, 7),

('11111111-0001-0001-0001-000000000003', 'Secure Access & Key Handling',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to handle keys and access codes securely and what to do if access is compromised.</div>
<h2>Treat access like a master key to someone''s life</h2>
<p>You may receive physical keys, key codes, or smart-lock access. Never share credentials with anyone. Never copy a physical key. If a key is lost or a code is compromised, contact Sweepr support and the customer immediately.</p>
<div class="callout callout-warning"><strong>Important:</strong> Digital codes must never be stored in personal notes apps, text messages, or shared with household members or subcontractors. Reference all access instructions inside the encrypted Sweepr app.</div>
<h2>When something feels wrong</h2>
<p>If you arrive and the home is already open, contact the customer before entering and document your arrival time and the door state. If you see signs of a break-in or something feels unsafe, do not enter — call the customer, and if you can''t reach them, call local emergency services.</p>
<h2>Summary</h2>
<p>Keys and codes get the highest level of care. Never copy, never share, always reference inside the app, and never enter a home that looks compromised.</p>', 2, 6),

('11111111-0001-0001-0001-000000000003', 'Professional Conduct',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know what behavior is and is not acceptable inside a customer''s home.</div>
<h2>Inside the home</h2>
<ul><li>Do not eat or drink the customer''s food without explicit written permission.</li><li>Do not use the customer''s bathroom beyond what is necessary.</li><li>Do not watch TV, use the customer''s devices, or make personal calls while working.</li><li>Do not bring guests or other workers unless registered on the platform and approved by the customer.</li></ul>
<div class="callout callout-tip"><strong>Pro Tip:</strong> You may listen to music or a podcast — but use only one earbud so you stay aware of your surroundings.</div>
<h2>Presentation</h2>
<p>Maintain a smoke-free environment at all times — never smoke on the property or within sight of the home. Keep fragrance minimal; many customers have sensitivities. Dress in professional or Sweepr-branded attire.</p>
<h2>Summary</h2>
<p>Be a quiet, respectful, professional presence. The home is the customer''s, not a break room.</p>', 3, 7),

('11111111-0001-0001-0001-000000000003', 'Photography & Social Media',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the strict rules around photographing customer homes.</div>
<h2>When photos are allowed</h2>
<p>Photographing a customer''s home, belongings, or family is only permitted to document damage or an incident, and only when shared through the Sweepr claims system. "Before/after" content for social media is not allowed.</p>
<div class="callout callout-danger"><strong>Critical:</strong> You may not post photos of any customer''s home on social media, review sites, or personal websites. Violations are grounds for immediate, permanent removal and may expose you to civil liability.</div>
<h2>Location data</h2>
<p>Sweepr collects location data only during an active job, for ETA accuracy and dispute resolution. It is not shared with third parties and is retained for 90 days. You consent through the app.</p>
<h2>Summary</h2>
<p>Cameras stay holstered unless you''re documenting damage through the claims system. Customer homes never appear on your social media — period.</p>', 4, 6);

-- ── Module 4: Legal & Compliance ─────────────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000004', 'Contractor vs. Employee',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand your legal classification and its tax implications.</div>
<h2>You are not an employee</h2>
<p>Sweepr does not control <em>how</em> you perform your work — only the outcome (quality standard) and general scope (the service booked). You use your own tools, set your own schedule, and may work for other platforms.</p>
<h2>Tax responsibilities</h2>
<p>You owe self-employment tax of 15.3% of net earnings (Social Security and Medicare). Make quarterly estimated payments to avoid year-end penalties. Vehicle mileage, supplies, and equipment are commonly deductible — consult a tax professional.</p>
<div class="callout callout-info"><strong>Good to know:</strong> Your relationship is governed by the Independent Contractor Agreement (ICA) you signed at onboarding. Continued use of the platform after a policy update constitutes acceptance of the new terms.</div>
<h2>Summary</h2>
<p>Independence means you control your methods and your taxes. Set money aside, track deductions, and review the ICA annually.</p>', 1, 7),

('11111111-0001-0001-0001-000000000004', 'Prohibited Activities',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will recognize the marketplace rules that, if broken, lead to removal.</div>
<h2>Off-platform booking is the #1 cause of removal</h2>
<p>Soliciting customers to book outside the platform is strictly prohibited and the most enforced rule. This includes giving customers your personal contact info to book directly, accepting cash for Sweepr-referred work, or directing customers to competing platforms.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Enforcement monitors patterns in customer communication. Off-platform booking violates the ICA and results in permanent removal.</div>
<h2>Other prohibited activities</h2>
<ul><li>Creating fake reviews or manipulating ratings.</li><li>Accessing customer accounts through unofficial means.</li><li>Performing work beyond the booked scope without authorization.</li><li>Bringing unauthorized individuals onto a job site.</li></ul>
<p>If you believe another cleaner is violating these rules, report it to Sweepr compliance.</p>
<h2>Summary</h2>
<p>Keep every booking, payment, and conversation on the platform. The rules exist to protect customers, you, and the marketplace.</p>', 2, 7),

('11111111-0001-0001-0001-000000000004', 'Insurance Requirements',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the insurance you must carry and how platform coverage relates to it.</div>
<h2>Your primary coverage</h2>
<p>You must maintain general liability insurance with a minimum of <strong>$1 million per occurrence</strong>. Sweepr verifies this at onboarding and performs annual checks. Upload a current certificate through the platform.</p>
<div class="callout callout-warning"><strong>Important:</strong> If your policy lapses, you are suspended from new job offers until a valid certificate is on file. Upload renewals immediately.</div>
<h2>Platform coverage is secondary</h2>
<p>Sweepr''s supplemental coverage applies to verified incidents during booked jobs — but only after your own policy has paid out. It does not cover gross negligence, intentional acts, or policy violations.</p>
<h2>Summary</h2>
<p>Carry your own $1M policy and keep it current. Platform coverage is a backstop, not a substitute.</p>', 3, 7),

('11111111-0001-0001-0001-000000000004', 'Data Privacy Law',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand your CCPA/GDPR obligations when handling customer data.</div>
<h2>Use data only for the job</h2>
<p>As a contractor accessing customer data, you must not retain, copy, or use it for any purpose other than completing the booked service.</p>
<ul><li>Do not log customer addresses in personal notebooks, spreadsheets, or contact lists.</li><li>Do not contact customers outside the platform.</li><li>Do not share customer information with third parties.</li></ul>
<div class="callout callout-warning"><strong>Important:</strong> If a customer asks you to delete their personal information, direct them to Sweepr''s privacy team — do not attempt to fulfill data-deletion requests yourself. Report any suspected data breach to Sweepr immediately; failing to report a known breach can create personal legal liability.</div>
<h2>Summary</h2>
<p>Customer data is for the job and nothing else. Route deletion requests and breaches to Sweepr''s privacy team.</p>', 4, 7);

-- ── Module 5: Safety & Chemicals ─────────────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000005', 'Chemical Safety',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the chemical safety rules that prevent dangerous exposures.</div>
<h2>Never mix chemicals</h2>
<p>The golden rule: never mix chemicals without explicit manufacturer guidance.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Bleach + ammonia produces toxic chloramine gas. Bleach + acid-based cleaners produces chlorine gas. Both can be lethal in enclosed spaces.</div>
<h2>Read the Safety Data Sheet (SDS)</h2>
<p>Manufacturers must provide an SDS for every chemical product. It lists hazards, required PPE, first aid for exposure, and disposal. Keep SDS sheets accessible on your phone or in your supply bag.</p>
<h2>Safe storage</h2>
<ul><li>Keep chemicals in original, labeled containers.</li><li>Never transfer chemicals to unlabeled bottles.</li><li>Store your bag where it can''t be knocked over or reached by children or pets.</li></ul>
<h2>Summary</h2>
<p>Don''t mix, read the SDS, and store products safely. Chemical discipline keeps you and the household safe.</p>', 1, 7),

('11111111-0001-0001-0001-000000000005', 'Personal Protective Equipment',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the minimum and enhanced PPE for cleaning work.</div>
<h2>Minimum PPE</h2>
<p>PPE is a professional and practical requirement. The minimum for standard work is nitrile or latex gloves (not vinyl, which resists chemicals poorly) and eye protection when using sprays or working overhead.</p>
<h2>Enhanced PPE</h2>
<p>For stronger chemicals — toilet bowl cleaners, oven degreasers, mold removers — add an N95 or respirator in enclosed, poorly ventilated spaces, plus knee pads for extended floor work.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Inspect PPE before each use, replace torn gloves immediately, and never reuse single-use masks. Keep spares in your kit — running out is not a reason to work without it.</div>
<h2>Summary</h2>
<p>Gloves and eye protection always; respirators and knee pads when the job calls for it. Keep PPE stocked and in good condition.</p>', 2, 7),

('11111111-0001-0001-0001-000000000005', 'Ergonomics & Injury Prevention',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to protect your body from the most common cleaning injuries.</div>
<h2>The big three injuries</h2>
<p>Repetitive strain, back injuries, and knee injuries are the most common occupational hazards for cleaners. Preventing them takes deliberate body mechanics every shift.</p>
<ul><li>Lift with your legs, not your back. Keep loads close to your body.</li><li>Avoid twisting while carrying weight.</li><li>Use extension wands and long-handled tools to reduce crouching.</li></ul>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Take a micro-break every 45 minutes and stretch your wrists, shoulders, and lower back.</div>
<h2>Listen to pain</h2>
<p>Sharp or sudden pain means stop, assess, and rest. Working through pain leads to serious injury. Document any on-the-job injury in the app and contact support.</p>
<h2>Summary</h2>
<p>Lift smart, use the right tools, take breaks, and never push through pain.</p>', 3, 7),

('11111111-0001-0001-0001-000000000005', 'Emergencies & Slips',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to handle wet-floor hazards and on-site emergencies.</div>
<h2>Wet floors</h2>
<p>When mopping, close off the area or use wet-floor signage. In homes with children or elderly residents, sequence your mopping to avoid exposing them to wet surfaces.</p>
<h2>Emergencies</h2>
<p>Identify exits when you arrive. In a fire, gas leak, or other emergency, evacuate and call emergency services — do not try to fight a fire or contain a leak. Leave your equipment and get out.</p>
<div class="callout callout-danger"><strong>Critical:</strong> If a fire breaks out, your first action is to evacuate safely and call 911. Notify Sweepr support only after the immediate emergency is handled. Your equipment is replaceable; you are not.</div>
<h2>If someone is injured</h2>
<p>Call 911 immediately. Do not give medical treatment beyond basic first aid unless trained. File a full incident report in the app within 24 hours.</p>
<h2>Summary</h2>
<p>Prevent slips with signage and smart sequencing; in any emergency, life safety comes first and documentation comes after.</p>', 4, 7);
