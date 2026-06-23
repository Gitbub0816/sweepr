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

-- ── Module 6: Cleaning Quality Standards ─────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000006', 'The Sweepr Quality Standard',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand the quality benchmark every clean must meet.</div>
<h2>"Good enough" is not the standard</h2>
<p>Every clean must meet the published benchmark for its service type: thorough, consistent, and repeatable. Customers make repeat-booking decisions based on their first experience.</p>
<div class="callout callout-info"><strong>Why it matters:</strong> A 4-star instead of a 5-star review reduces rebooking probability for that customer by over 60%. Protecting your rating protects your income.</div>
<h2>The base standard</h2>
<p>Regardless of service type, every clean must leave: surfaces wiped, floors cleaned, trash emptied, fixtures shined, and the space smelling clean. These are minimum requirements, not optional extras.</p>
<h2>Summary</h2>
<p>Hit the benchmark every time. Consistency is what turns one job into a recurring customer.</p>', 1, 6),

('11111111-0001-0001-0001-000000000006', 'Room-by-Room Sequence',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will be able to clean a home in an efficient, non-redundant sequence.</div>
<h2>Direction within a room</h2>
<p>Work <strong>top to bottom</strong> (dust falls down), <strong>left to right</strong> (systematic coverage), and away from the door toward the exit so you''re not walking on freshly cleaned floors.</p>
<h2>Room order</h2>
<p>Standard sequence: bedrooms (time-intensive), bathrooms (sanitation priority), kitchen (appliance work), living areas, then entryways. Complete each room fully before moving on.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> If you''re falling behind, message the customer at the halfway point rather than rushing. A brief note that you''re taking extra time to do it right builds goodwill; rushed work causes damage and low ratings.</div>
<h2>Summary</h2>
<p>Top-to-bottom, left-to-right, away from the door, room by room. A consistent sequence makes you faster and more thorough.</p>', 2, 6),

('11111111-0001-0001-0001-000000000006', 'Common Quality Failures',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the most common reasons for sub-5-star reviews and how to prevent them.</div>
<h2>The usual suspects</h2>
<ul><li>Missed baseboards, behind toilets, under furniture edges.</li><li>Streaky glass and mirrors.</li><li>Soap scum left in showers and tubs.</li><li>Dusty ceiling-fan blades and smudged stainless steel.</li></ul>
<h2>Technique fixes</h2>
<p>Use a dedicated microfiber cloth for glass — never paper towels, which leave lint. Dry stainless steel in the direction of the grain. Give soap-scum remover dwell time before wiping. Run your finger along baseboards before leaving a room.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Use the in-app checklist <em>as you go</em>, then do a final walkthrough looking at the home from a customer''s perspective, not a cleaner''s.</div>
<h2>Summary</h2>
<p>Most quality failures are preventable with technique and checklist discipline. Catch them before the customer does.</p>', 3, 7),

('11111111-0001-0001-0001-000000000006', 'Supplies & Substitutions',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know what to bring and the rules around substituting products.</div>
<h2>Your standard kit</h2>
<p>Bring professional-grade supplies to every job unless the booking specifies otherwise:</p>
<ul><li>All-purpose cleaner, bathroom disinfectant, glass cleaner, toilet bowl cleaner.</li><li>Stainless polish, wood-safe surface cleaner.</li><li>Mop/bucket or spray-mop system, HEPA vacuum.</li><li>At least 12 microfiber cloths, scrubbing sponges, and assorted trash bags.</li></ul>
<div class="callout callout-warning"><strong>Important:</strong> Don''t use the customer''s household products without explicit written permission — they may damage surfaces and create liability questions. If you run out of a required product, message the customer before starting the affected area.</div>
<h2>Summary</h2>
<p>Come fully stocked with professional products, and never substitute or use customer supplies without approval.</p>', 4, 6),

('11111111-0001-0001-0001-000000000006', 'Special Surfaces & Delicate Items',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to clean delicate surfaces without causing damage.</div>
<h2>Surface rules</h2>
<ul><li><strong>Hardwood:</strong> never steam mop — use a wood-safe spray mop.</li><li><strong>Natural stone (marble, granite, travertine):</strong> only pH-neutral cleaners; acids etch the surface permanently.</li><li><strong>Stainless steel:</strong> clean with the grain direction.</li><li><strong>Painted surfaces:</strong> microfiber and mild cleaner only — no abrasives.</li></ul>
<h2>Delicate items</h2>
<p>Don''t move or clean artwork, sculptures, antiques, or electronics unless explicitly requested. If you must work near a delicate item, photograph it first. If you knock something over, report it immediately through the app — never hide damage.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> When in doubt, don''t touch it. A customer would rather you skip the shelf holding their grandmother''s china than risk breaking it.</div>
<h2>Summary</h2>
<p>Match the cleaner to the surface, leave delicate items alone unless asked, and err on the side of caution.</p>', 5, 7);

-- ── Module 7: Customer Communication ─────────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000007', 'Before the Job',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to set a professional tone before you arrive.</div>
<h2>Confirm and clarify</h2>
<p>When you accept a job more than 24 hours out, send a brief confirmation: your name, that you''ve reviewed the details, and any clarifying questions about access or special requests. On the morning of the job, send an ETA message — this reduces anxiety and prevents a late arrival being reported as a no-show.</p>
<div class="callout callout-warning"><strong>Important:</strong> Use the in-app messaging system exclusively. Never give out a personal phone number or other channel. In-app messages are timestamped and protect you in any dispute; off-platform messages have no evidentiary value to Sweepr.</div>
<h2>Summary</h2>
<p>A quick confirmation and an ETA message — both in-app — set a professional tone and protect you.</p>', 1, 6),

('11111111-0001-0001-0001-000000000007', 'During & After the Job',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to communicate during a job and close it out professionally.</div>
<h2>Communicate the unexpected</h2>
<p>Send brief, factual messages in real time about anything unexpected: a locked room, pre-existing damage, an aggressive pet, or a job running long. This documents your awareness and good faith.</p>
<h2>The wrap-up message</h2>
<p>When you finish, mark the job complete and send a short summary — confirmation it''s done, any extras you noticed and addressed, and a professional closing.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Never solicit tips, ask for 5-star reviews, or criticize other cleaners. All communications are monitored and solicitation results in a warning.</div>
<h2>Summary</h2>
<p>Narrate surprises as they happen and close with a professional summary — without ever soliciting reviews or tips.</p>', 2, 5),

('11111111-0001-0001-0001-000000000007', 'De-escalating Difficult Situations',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to respond to an unhappy customer effectively.</div>
<h2>Listen and acknowledge first</h2>
<p>Your instinct may be defensive, but the most effective response is to listen and acknowledge. "I understand you''re disappointed, and I want to make this right" is more powerful than any justification.</p>
<h2>Offer a path forward</h2>
<p>If a quick fix is feasible and the customer agrees, returning to address a missed area converts a complaint into a loyalty moment. If you can''t return, apologize clearly and direct them to submit a re-clean request through the app.</p>
<div class="callout callout-warning"><strong>Important:</strong> Never argue in writing or tell a customer they''re wrong. Even if you disagree, the platform takes documented, professional, responsive communication seriously in any dispute review.</div>
<h2>Summary</h2>
<p>Acknowledge, then solve. Calm professionalism in writing is your strongest asset.</p>', 3, 6),

('11111111-0001-0001-0001-000000000007', 'When to Escalate',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know which situations require Sweepr support rather than direct handling.</div>
<h2>Escalate when…</h2>
<ul><li>A customer is verbally abusive or harassing.</li><li>A customer requests work outside the booked scope.</li><li>The home can''t be cleaned safely or sanitarily.</li><li>A customer tries to change payment terms or pay in cash.</li><li>You discover something that makes you feel unsafe.</li></ul>
<h2>How to escalate</h2>
<p>Use the "Contact Support" button in the job detail screen. There''s an emergency line for active-job situations. Document with notes and photos when possible.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Escalating isn''t failing — it''s the professional response to a situation beyond what a contractor should handle alone.</div>
<h2>Summary</h2>
<p>Some situations exceed a contractor''s role. Keep yourself and the customer safe, document, and hand it to support.</p>', 4, 5);

-- ── Module 8: Damage, Claims & Insurance ─────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000008', 'Prevention First',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the habits that prevent most damage claims.</div>
<h2>The 60-second pre-clean scan</h2>
<p>Before cleaning any room, do a quick visual scan for pre-existing damage — chips, cracks, scuffs, broken items — and photograph anything disputable. These timestamped photos are your protection.</p>
<h2>Move carefully</h2>
<ul><li>Pick items up rather than sliding them.</li><li>If something is too heavy to move safely alone, work around it and note why.</li><li>Cover or carefully avoid electronics when using liquid products.</li></ul>
<div class="callout callout-warning"><strong>Important:</strong> Spills on electronics are among the most expensive claims. Use spray bottles pointed away from devices and damp-not-wet cloths nearby.</div>
<h2>Summary</h2>
<p>The cheapest claim is the one that never happens. Scan, photograph, and move deliberately.</p>', 1, 6),

('11111111-0001-0001-0001-000000000008', 'When Damage Happens',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the exact procedure when you cause damage.</div>
<h2>Stop, document, report</h2>
<p>If you damage something: stop, photograph it clearly from multiple angles, and note the time. Then message the customer with a clear, factual note, and file a damage report in the app within one hour.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Do not hide, repair, or minimize damage. Attempting to conceal damage when there is evidence results in immediate removal — regardless of the dollar amount.</div>
<h2>Why honesty wins</h2>
<p>Prompt, honest reporting is always the better outcome, ethically and practically. The claims team handles resolution; your job is to document and disclose.</p>
<h2>Summary</h2>
<p>Photograph, message the customer, file within an hour. Honesty protects your standing far more than concealment ever could.</p>', 2, 6),

('11111111-0001-0001-0001-000000000008', 'How Insurance Works',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand how your policy and Sweepr''s coverage interact during a claim.</div>
<h2>Your policy is primary</h2>
<p>Before a claim reaches Sweepr''s supplemental coverage, it goes through your insurer first. Keep your policy current and accessible.</p>
<h2>Platform coverage is secondary</h2>
<p>Sweepr''s supplemental coverage applies to verified incidents during active bookings when your own policy is insufficient. It does not cover gross negligence, intentional acts, or policy violations.</p>
<div class="callout callout-warning"><strong>Important:</strong> During an open claim, respond to requests for information within <strong>48 hours</strong>. Non-responsive cleaners may have their accounts suspended pending resolution.</div>
<h2>Summary</h2>
<p>Your insurance pays first; Sweepr''s is a backstop. Stay responsive during any claim review.</p>', 3, 6),

('11111111-0001-0001-0001-000000000008', 'Pre-Existing & False Claims',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to defend against claims for damage you didn''t cause.</div>
<h2>Your photos are your defense</h2>
<p>If a claim is filed for pre-existing damage, respond through the claims interface with your dated pre-job photos and a factual description. This is exactly why the pre-clean scan is not optional.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Don''t accuse the customer of fraud. Present your documentation and let the evidence and photo metadata speak. Sweepr reviews both accounts.</div>
<h2>Reporting suspected fraud</h2>
<p>If you believe a claim is false or exaggerated, submit it through the claims escalation process. Documented patterns of fraudulent claims trigger review on the customer side.</p>
<h2>Summary</h2>
<p>Documentation-first protects you. Present facts, stay professional, and let the process work.</p>', 4, 6);

-- ── Module 9: Reliability & Ratings ──────────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000009', 'How Scores Are Calculated',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand how your quality and reliability scores are computed.</div>
<h2>Two metrics</h2>
<p>Sweepr tracks a <strong>quality score</strong> (average of customer ratings, weighted toward recent reviews) and a <strong>reliability score</strong> (on-time arrivals, cancellation rate, completion rate). Both affect your tier and your position in offer queues.</p>
<h2>Recent reviews count double</h2>
<p>Your quality score is a rolling 90-day average. Reviews from the past 30 days are weighted 2x compared to older ones, so consistent recent quality recovers your score faster than waiting for old reviews to age out.</p>
<div class="callout callout-info"><strong>Reliability math:</strong> A cancellation within 24 hours costs 3 points; a no-call/no-show costs 10 points; being 15+ minutes late without notice costs 2 points. Consistency slowly raises your base score.</div>
<h2>Summary</h2>
<p>Recent performance matters most. Reliability is built and lost in points — protect it.</p>', 1, 6),

('11111111-0001-0001-0001-000000000009', 'The Tier System',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the three cleaner tiers and their requirements.</div>
<h2>Standard, Preferred, Elite</h2>
<p>Your tier determines offer priority, your customer-facing badge, and certain bonuses.</p>
<ul><li><strong>Standard:</strong> quality above 4.0 and reliability above 70.</li><li><strong>Preferred:</strong> quality above 4.5, reliability above 85, and 20+ completed jobs in 90 days.</li><li><strong>Elite:</strong> quality above 4.8, reliability above 95, and 40+ jobs in 90 days with no unresolved complaints.</li></ul>
<div class="callout callout-info"><strong>Good to know:</strong> Tier drops are automatic after two consecutive weeks below threshold; upgrades are reviewed monthly. Your tier reflects recent performance, not historical reputation.</div>
<h2>Summary</h2>
<p>Higher tiers mean earlier offers and bonuses. Sustained quality and reliability move you up.</p>', 2, 5),

('11111111-0001-0001-0001-000000000009', 'Recovering From a Bad Streak',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to recover your scores after a setback.</div>
<h2>Hardship provisions</h2>
<p>If a serious emergency causes cancellations or no-shows, contact support within 24 hours and document the situation. Sweepr reviews hardship claims case-by-case and may reduce or remove the reliability impact.</p>
<h2>Rebuilding quality</h2>
<p>Consistency is the fastest path back. Accept only jobs you can do excellently, take time to do each thoroughly, and let recent high ratings outweigh older bad ones.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> You can dispute a rating you believe is unfair within 7 days. Invalid ratings (e.g., "wrong person") are sometimes removed — but gaming the system by disputing legitimate reviews earns warnings.</div>
<h2>Summary</h2>
<p>Document hardships, focus on recent quality, and use rating disputes honestly.</p>', 3, 6),

('11111111-0001-0001-0001-000000000009', 'Suspension & Reinstatement',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know what triggers suspension and how reinstatement works.</div>
<h2>Temporary vs. permanent</h2>
<p>Temporary suspension (7–30 days) is typically triggered by reliability dropping below 50, an unresolved damage claim, or repeated violations. During it, your profile is hidden and you receive no offers.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Permanent removal results from confirmed off-platform booking, gross negligence causing serious damage or injury, harassment or theft, falsifying documents, or fake accounts/reviews.</div>
<h2>Getting reinstated</h2>
<p>For temporary suspensions you''ll receive conditions for reinstatement — often a refresher module, resolving outstanding claims, and a monitoring period. Engage constructively; the platform prefers to reinstate good cleaners.</p>
<h2>Summary</h2>
<p>Most suspensions are recoverable. Avoid the bright-line violations and engage with the reinstatement process.</p>', 4, 5);

-- ── Module 10: Technical Support ─────────────────────────────────────────────
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000010', 'Common App Issues',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will be able to resolve the most common app problems yourself.</div>
<h2>Connectivity</h2>
<p>Most issues are connectivity. Check your signal or ask for the property WiFi password. The app caches job details offline, so you can still see entry instructions and checklists, but status updates need a connection.</p>
<h2>Crashes and login</h2>
<ul><li>If the app freezes on a status update, close and reopen it — progress is saved server-side, so you won''t lose checklist items.</li><li>If it keeps misbehaving, clear the app cache in phone settings.</li><li>For login issues, log out and back in; a session token has likely expired.</li></ul>
<div class="callout callout-info"><strong>Good to know:</strong> If you''re locked out, use "Forgot Password" — never contact a customer to explain a technical issue.</div>
<h2>Summary</h2>
<p>Check connectivity, restart the app, and reset your session. Your job progress is safe on the server.</p>', 1, 5),

('11111111-0001-0001-0001-000000000010', 'Navigation Problems',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to handle mapping and navigation failures.</div>
<h2>Wrong location?</h2>
<p>Check the full address — apartment or unit numbers often cause routing errors. If you can''t locate the property, use the in-app call feature to reach the customer. Never guess.</p>
<h2>Poor GPS areas</h2>
<p>Downtown cores and underground parking degrade GPS. Trust the written address and your visual judgment over coordinates.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Screenshot the address before leaving as a backup, and keep a car charger handy. Job details are cached offline if your battery dies.</div>
<h2>Summary</h2>
<p>Verify the address, call the customer when lost, and keep an offline backup of where you''re going.</p>', 2, 5),

('11111111-0001-0001-0001-000000000010', 'Payout Discrepancies',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to handle earnings and payout questions.</div>
<h2>Check the job summary first</h2>
<p>If a payout seems wrong, review the job summary in the Earnings tab — it shows base pay, bonuses, and tips. If a job is missing, confirm it was fully marked complete; "in progress" jobs aren''t paid out.</p>
<h2>Timing</h2>
<p>Delays of 1–2 business days beyond the 7-day window are normal in high-volume periods. If a payout is more than 3 business days late beyond the window, contact support through the Help tab with the specific job IDs.</p>
<div class="callout callout-warning"><strong>Important:</strong> Never contact customers about payment. If your 1099 doesn''t match your records, raise it with support before filing taxes.</div>
<h2>Summary</h2>
<p>Verify the job summary, allow normal delays, and route real discrepancies to support with job IDs.</p>', 3, 5),

('11111111-0001-0001-0001-000000000010', 'Contacting Support Effectively',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know which support channel to use and how to get fast resolutions.</div>
<h2>The channels</h2>
<ul><li><strong>In-app chat:</strong> fastest, available 7am–9pm daily.</li><li><strong>Email:</strong> support@sweepr.com, 24–48 hour response.</li><li><strong>Phone line:</strong> active-job emergencies only.</li></ul>
<h2>Write a great first message</h2>
<p>Include the job ID, the exact issue, what you''ve already tried, and any screenshots. Vague requests like "my app isn''t working" cause back-and-forth that delays resolution.</p>
<div class="callout callout-danger"><strong>Critical:</strong> For active-job emergencies — you can''t access the property, a customer is hostile, you found damage — use the in-app emergency contact, which escalates to a senior agent immediately.</div>
<h2>Summary</h2>
<p>Match the channel to the urgency and front-load every detail so support can solve it on the first reply.</p>', 4, 5);

-- =============================================================================
-- SERVICE MODULE LESSONS
-- =============================================================================

-- Standard Cleaning
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000001', 'Scope & Expectations',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know exactly what a standard clean includes and excludes.</div>
<h2>It''s a maintenance clean</h2>
<p>A standard clean maintains a regularly cleaned home — thorough surface cleaning, not detailed scrubbing of built-up grime. Knowing this scope helps you manage time and expectations.</p>
<h2>Included vs. not included</h2>
<ul><li><strong>Included:</strong> surfaces dusted and wiped, kitchen counters and appliance exteriors, bathroom fixtures cleaned and disinfected, floors vacuumed and mopped, trash emptied, bedding changed if linens are provided.</li><li><strong>Not included:</strong> inside appliances, inside cabinets, walls, or windows unless added.</li></ul>
<div class="callout callout-tip"><strong>Pro Tip:</strong> If a customer''s expectations seem high, say so kindly: "I''ll be doing a standard maintenance clean today — if there''s anything specific you''d like prioritized, let me know before I start."</div>
<h2>Summary</h2>
<p>Standard means consistent surface maintenance. Communicate scope early to avoid mismatched expectations.</p>', 1, 6),

('22222222-0002-0002-0002-000000000001', 'Efficiency on Repeat Cleans',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to get faster and better at each repeat visit.</div>
<h2>Build a mental map</h2>
<p>Repeat customers'' homes are cleaner than new ones. After your first visit, note the quirks — the fan that collects dust, the shower door that needs extra attention. Customizing your sequence per home makes you faster and more thorough.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Aim to finish each task in one pass. Doing a surface twice wastes time without adding quality.</div>
<h2>Summary</h2>
<p>Learn each home, work in single passes, and let efficiency compound over repeat visits.</p>', 2, 6),

('22222222-0002-0002-0002-000000000001', 'Managing Time',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to handle finishing early or running late.</div>
<h2>Time estimates</h2>
<p>Estimates assume a maintained home — roughly 2–2.5 hours for a 2-bed apartment, 3.5–4 hours for a 4-bed house. If a home is much dirtier than expected, note it in the app at job start.</p>
<h2>Finishing early</h2>
<p>If you finish early without cutting corners, add a finishing touch (fan the towels, shine the chrome) that earns 5 stars. Never leave early just to pad your rate.</p>
<div class="callout callout-warning"><strong>Important:</strong> If you''re running over, tell the customer at the halfway point — not at the end. "I want to make sure everything is done right and may need 20 extra minutes" lands far better than a surprise.</div>
<h2>Summary</h2>
<p>Use spare time to delight, communicate overruns early, and never short the clean to save minutes.</p>', 3, 6);

-- Deep Cleaning
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000002', 'What Makes It Different',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know what a deep clean adds beyond a standard clean.</div>
<h2>The added scope</h2>
<p>A deep clean includes everything in a standard clean plus the areas that accumulate grime over months: inside the oven and microwave, behind the refrigerator, inside accessible cabinets, grout lines, baseboards, window tracks, blinds, switch covers, door frames, and inside shower doors.</p>
<div class="callout callout-info"><strong>Plan your time:</strong> Budget roughly 50–75% more time than a standard clean of the same size home. If a home is extremely neglected, raise it before starting.</div>
<h2>Summary</h2>
<p>Deep cleans target the months-of-buildup areas. Expect — and schedule for — significantly more time.</p>', 1, 6),

('22222222-0002-0002-0002-000000000002', 'Appliances & Built-Up Grime',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to deep-clean ovens and refrigerators efficiently.</div>
<h2>Dwell time is everything</h2>
<p>Apply product, let it dwell for the recommended time (often 5–10 minutes for grease or soap scum), then wipe. Scrubbing immediately wastes effort.</p>
<h2>Oven and fridge</h2>
<ul><li><strong>Oven:</strong> use an oven-safe cleaner, dwell 15–20 minutes, soak racks separately, wipe in sections, and rinse well to avoid burning odors.</li><li><strong>Refrigerator:</strong> remove shelves and drawers, wash them in the sink, wipe interior walls with a mild cleaner, dry thoroughly, replace. Pull the fridge out to clean behind it.</li></ul>
<div class="callout callout-warning"><strong>Important:</strong> Use only food-safe cleaners inside refrigerators — never strong disinfectants.</div>
<h2>Summary</h2>
<p>Let products do the work with dwell time, and fully detail appliances inside and behind.</p>', 2, 7),

('22222222-0002-0002-0002-000000000002', 'Grout, Tracks & Baseboards',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to clean the detail areas customers inspect closely.</div>
<h2>Grout</h2>
<p>Use a grout brush or old toothbrush with a grout cleaner, work in sections, and rinse well. Oxygen-based cleaners (OxiClean paste) are safe on most grout.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Never use bleach on colored grout — it fades permanently.</div>
<h2>Tracks and baseboards</h2>
<p>Vacuum debris from window and door tracks first, then scrub with a small brush. Wipe baseboards along their full length with a damp microfiber cloth — minimal moisture on painted ones, wood-safe cleaner on wood. Check from an angle; dust shows in raking light.</p>
<h2>Summary</h2>
<p>Detail areas are invisible until they''re dirty — and customers run their fingers along them. Clean them deliberately.</p>', 3, 7);

-- Move-In/Out
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000003', 'Move-In/Out Standards',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will understand the elevated standard for vacant-property cleans.</div>
<h2>Like-new condition</h2>
<p>Move-in/out cleans are performed on vacant properties and must return the home to like-new condition. This is the most demanding service type and is priced accordingly.</p>
<p>Clean everything: inside all appliances, all cabinet interiors, all closets, garage floors, and laundry areas. Spot-clean walls for scuffs, clean window interiors, and dust light fixtures.</p>
<div class="callout callout-warning"><strong>Important:</strong> These jobs occur at transition points where landlord-tenant disputes are common. Photograph every room from the doorway before and after — your photos may be requested as evidence.</div>
<h2>Summary</h2>
<p>Everything gets cleaned, and everything gets documented. Photos are your professional record.</p>', 1, 7),

('22222222-0002-0002-0002-000000000003', 'Checklist Discipline',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to manage the move-out checklist and out-of-scope conditions.</div>
<h2>Follow the order</h2>
<p>Use the full checklist in order — it''s sequenced to avoid re-dirtying completed areas. Check off items as you go, not at the end.</p>
<div class="callout callout-danger"><strong>Critical:</strong> If you find mold, structural damage, or hoarding-level debris, stop work on that area, photograph it, and message the customer. Do not attempt to clean mold or hazardous waste — that''s outside cleaning scope.</div>
<h2>Timing</h2>
<p>A standard apartment move-out may take 4–6 hours solo; a large neglected house can take all day. Confirm any deadline with the customer before starting.</p>
<h2>Summary</h2>
<p>Work the checklist in order, document the unexpected, and never take on remediation work.</p>', 2, 7),

('22222222-0002-0002-0002-000000000003', 'Landlords & Property Managers',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to work professionally when a landlord or manager provides access.</div>
<h2>Follow access instructions exactly</h2>
<p>You may get access from a property manager rather than the tenant. If the access method fails, contact the booking customer first; if unreachable, contact Sweepr support.</p>
<div class="callout callout-warning"><strong>Important:</strong> If a landlord is present and asks about the tenant''s deposit or the home''s condition, stay focused on your cleaning and avoid commenting. Your statements could be misrepresented in a dispute.</div>
<h2>Professional handoff</h2>
<p>Send a completion message summarizing the work and attach photos of challenging areas you addressed.</p>
<h2>Summary</h2>
<p>Clean, don''t testify. Follow access steps precisely and close with a documented handoff.</p>', 3, 6);

-- Pet Homes
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000004', 'Working Safely With Pets',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to stay safe and respectful around customers'' pets.</div>
<h2>Before you start</h2>
<p>Ask the customer to confine pets to a room you won''t clean, a crate, or outdoors. Loose pets can knock over your bag, eat products, or escape through an open door.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Aerosol sprays near bird cages can be fatal — use non-spray alternatives. If a dog is growling, snapping, or unresponsive to commands, stop work and contact the customer. Never restrain or discipline a customer''s pet.</div>
<h2>Allergies</h2>
<p>If you have pet allergies, disclose them when accepting the job. Cleaning a pet home with severe allergies without disclosure creates safety risks for you and disruption for the customer.</p>
<h2>Summary</h2>
<p>Confine pets, protect birds from sprays, never handle an aggressive animal, and disclose allergies up front.</p>', 1, 6),

('22222222-0002-0002-0002-000000000004', 'Hair, Dander & Odor',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the techniques that actually remove pet hair, dander, and odor.</div>
<h2>Hair and dander</h2>
<p>Use a HEPA vacuum with a pet-hair attachment and vacuum carpets in multiple directions. A rubber squeegee tool lifts embedded hair from upholstery before vacuuming. Wipe horizontal surfaces with microfiber before vacuuming so you don''t redistribute dander, and change cloths often.</p>
<h2>Odor</h2>
<p>Odor removal is not odor masking. Enzyme-based cleaners break down organic odor compounds; air fresheners just mask them. Use an enzyme cleaner with adequate dwell time on urine areas.</p>
<div class="callout callout-danger"><strong>Critical:</strong> Never use strong bleach products where a pet might walk — residual bleach is toxic to dogs and cats, who lick their paws.</div>
<h2>Summary</h2>
<p>HEPA + directional vacuuming for hair, microfiber-first for dander, and enzyme cleaners for odor — never bleach in pet areas.</p>', 2, 6);

-- Laundry
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000005', 'Laundry Standards',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to wash and dry laundry safely to platform standards.</div>
<h2>Read the preferences first</h2>
<p>Check the job notes for the customer''s preferences — delicate cycles, hang-dry items, specific folding. If none are provided, default to cold for darks, warm for lights, and gentle for anything that looks delicate.</p>
<div class="callout callout-warning"><strong>Important:</strong> Never machine-wash wool, silk, or dry-clean-only items. Set them aside and note them in your completion message.</div>
<h2>Timing</h2>
<p>Start laundry at the beginning of your visit so it runs while you clean. Transfer it to the dryer promptly to prevent mildew; if the dryer is in use, message the customer.</p>
<h2>Summary</h2>
<p>Follow preferences, default conservatively, protect delicates, and start early so cycles finish on time.</p>', 1, 6),

('22222222-0002-0002-0002-000000000005', 'Folding & Putting Away',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to fold and put away laundry in a way that earns 5 stars.</div>
<h2>Neat folding</h2>
<p>Fold uniformly — shirts consistent, pants with aligned creases, towels in thirds. Customers notice the difference between functional and excellent.</p>
<h2>Match their system</h2>
<p>Look at how shelves and drawers are already organized and match it. If you can''t tell where something goes, leave it in a visible, neat pile and note it in your completion message.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> If clean linens are provided and the bed is stripped, make it neatly and replace throw pillows in their original arrangement — a made bed dramatically lifts the perceived quality of the whole visit.</div>
<h2>Summary</h2>
<p>Fold neatly, match the existing system, and make the bed when you can.</p>', 2, 6);

-- Dishes
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000006', 'Dishes Standards',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the scope and proper technique for the dishes add-on.</div>
<h2>Scope</h2>
<p>The dishes add-on covers washing, drying, and putting away dishes in the sink or on the counter. It does not include emptying and reloading the dishwasher unless the booking says so — clarify if unclear.</p>
<h2>Technique</h2>
<p>Wash in hot water with dish soap using a clean brush or new sponge — never the customer''s old sponge, which harbors bacteria. Rinse thoroughly to remove soap residue.</p>
<div class="callout callout-warning"><strong>Important:</strong> Hand-wash crystal, cast iron, and hand-painted ceramics. Never put crystal or delicate ceramics in the dishwasher without explicit permission.</div>
<h2>Summary</h2>
<p>Wash hot and clean, hand-wash delicates, and confirm scope around the dishwasher.</p>', 1, 5),

('22222222-0002-0002-0002-000000000006', 'Breakage & Put-Away',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to prevent breakage and handle it if it happens.</div>
<h2>Prevent breakage</h2>
<ul><li>Carry only 2–3 pieces at a time.</li><li>Hold glasses by the body, not the rim.</li><li>Place items down gently and don''t stack heavily.</li></ul>
<h2>Put-away</h2>
<p>Match the customer''s cabinet organization. If you can''t tell where something goes, set it on the counter with a note rather than guessing.</p>
<div class="callout callout-warning"><strong>Important:</strong> If you break something, the standard damage procedure applies — photograph it, message the customer, file a report. Handled professionally, breakage won''t significantly hurt your rating.</div>
<h2>Summary</h2>
<p>Carry few, hold smart, match the system, and report any breakage immediately.</p>', 2, 5);

-- Interior Windows
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000007', 'Streak-Free Technique',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will be able to clean interior windows without streaks.</div>
<h2>Tools and application</h2>
<p>Use a squeegee for large windows and microfiber for small ones — never paper towels, which leave lint. Spray cleaner onto the cloth, not the glass, to avoid overspray on frames and sills.</p>
<h2>The squeegee method</h2>
<p>Spray the glass, work top to bottom in overlapping passes, wipe the blade after each pass, then finish edges with a dry microfiber cloth.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Check your work from an angle in natural light — the raking angle reveals streaks that direct viewing misses. On cloudy days, do an extra pass to be safe.</div>
<h2>Summary</h2>
<p>Cloth-applied cleaner, overlapping squeegee passes, dry edges, and an angled light check.</p>', 1, 6),

('22222222-0002-0002-0002-000000000007', 'Safety for High Windows',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know how to safely reach high or large windows.</div>
<h2>Use the right equipment</h2>
<p>For windows above standing height, use a step stool or extension wand. Never stand on furniture, counters, or improvised platforms.</p>
<div class="callout callout-danger"><strong>Critical:</strong> If a window can''t be safely reached with proper equipment, document it in your completion notes and offer to return with the right tools — never take a safety risk.</div>
<h2>Large glass</h2>
<p>For floor-to-ceiling glass, work in sections top to bottom: upper section with an extension squeegee, lower section at standing height. Check from several angles before moving on.</p>
<h2>Summary</h2>
<p>Stable equipment only. When you can''t reach safely, document and offer a return visit.</p>', 2, 6);

-- Organization
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000008', 'Scope & Limits',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the boundaries of the organization add-on.</div>
<h2>Designated areas only</h2>
<p>The organization add-on covers visible, accessible areas the customer specifically identified — a pantry, closet, or drawer. It does not mean rearranging the whole home.</p>
<div class="callout callout-warning"><strong>Important:</strong> Don''t organize areas that weren''t requested. Moving items in a bedroom closet when only the pantry was booked creates confusion and conflict. If areas aren''t listed, message the customer to clarify.</div>
<h2>Assist, don''t decide</h2>
<p>The customer''s preferred system is the right system. Offer options if asked, but implement what they choose. Never discard items — even apparent trash — without explicit permission.</p>
<h2>Summary</h2>
<p>Organize only what''s booked, follow the customer''s vision, and never throw anything away on your own judgment.</p>', 1, 6),

('22222222-0002-0002-0002-000000000008', 'Organizing Without Overstepping',
'<div class="lesson-objective"><strong>Objective:</strong> By the end of this lesson, you will know the line between helpful organizing and overstepping.</div>
<h2>Objects, not decisions</h2>
<p>You handle objects, not decisions. Grouping similar items, creating visible categories, using containers, and making a space more logical are in scope. Deciding what to keep, moving items to other rooms, and handling documents or valuables are not.</p>
<div class="callout callout-tip"><strong>Pro Tip:</strong> Leave items in the room you found them unless directed otherwise. If something clearly belongs elsewhere, note it rather than moving it.</div>
<h2>Pantry example</h2>
<p>Wipe shelves, group by category (canned goods, baking, snacks), face labels forward, and place taller items toward the back. These touches transform a pantry without requiring any decisions on your part.</p>
<h2>Summary</h2>
<p>Bring order to objects, leave decisions to the customer, and keep everything in its room.</p>', 2, 6);

-- =============================================================================
-- QUIZ QUESTIONS (scenario-based comprehension)
-- =============================================================================

-- Module 1
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000001', 'What is your employment relationship with Sweepr?', '["A part-time employee of Sweepr", "An independent contractor using the Sweepr marketplace", "A full-time employee with benefits", "A franchise owner"]', 'An independent contractor using the Sweepr marketplace', 'Sweepr is a marketplace. All cleaners operate as independent contractors — responsible for their own taxes, insurance, and tools.', 1),
('11111111-0001-0001-0001-000000000001', 'Who is responsible for your income taxes as a Sweepr cleaner?', '["Sweepr withholds and pays them automatically", "You are responsible for your own income and self-employment taxes", "They are included in the platform fee", "Only if you earn more than $50,000"]', 'You are responsible for your own income and self-employment taxes', 'As a contractor you pay your own income and self-employment tax (15.3%). Sweepr issues a 1099-NEC but does not withhold.', 2),
('11111111-0001-0001-0001-000000000001', 'A customer gives you a 4-star review instead of 5. Why does this matter more than it seems?', '["It has no real impact", "It reduces that customer''s rebooking probability by over 60%", "It only matters for Elite cleaners", "It only affects tips"]', 'It reduces that customer''s rebooking probability by over 60%', 'A 4-star vs 5-star clean cuts rebooking probability for that customer by more than 60%. Consistency protects your income.', 3),
('11111111-0001-0001-0001-000000000001', 'What insurance must you maintain to work on Sweepr?', '["None — Sweepr covers everything", "Your own general liability insurance with at least $1M coverage", "A home warranty", "Health insurance only"]', 'Your own general liability insurance with at least $1M coverage', 'You must carry a $1M-per-occurrence general liability policy. Platform coverage is supplemental, not primary.', 4),
('11111111-0001-0001-0001-000000000001', 'How does Sweepr support your business?', '["It assigns you jobs on a fixed schedule", "It connects you with customers and handles booking, payment, and messaging", "It guarantees an hourly wage", "It provides your cleaning supplies"]', 'It connects you with customers and handles booking, payment, and messaging', 'Sweepr is a business-development partner — it handles customer acquisition, booking, payment, and dispute resolution. You provide the expertise.', 5);

-- Module 2
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000002', 'A job offer arrives. Roughly how long do you have to accept or decline?', '["1 hour", "24 hours", "15 minutes", "Until the scheduled start time"]', '15 minutes', 'Offers have a ~15-minute window before expiring to the next cleaner. Review quickly and decide.', 1),
('11111111-0001-0001-0001-000000000002', 'Where should you look up a keypad code for a job?', '["Your personal notebook", "The job detail screen in the Sweepr app", "A text from the customer", "A sticky note on your dashboard"]', 'The job detail screen in the Sweepr app', 'All entry instructions are encrypted in the app. Never store codes outside the platform.', 2),
('11111111-0001-0001-0001-000000000002', 'You finished cleaning but the app still shows the job "in progress." What happens to your pay?', '["You''re paid automatically anyway", "Payout isn''t processed until you mark the job complete", "It pays at the end of the month regardless", "The customer pays you in cash"]', 'Payout isn''t processed until you mark the job complete', 'Payouts trigger on completion. Jobs left "in progress" are not paid. Always mark complete promptly.', 3),
('11111111-0001-0001-0001-000000000002', 'Traffic will make you 20 minutes late. What is the right move?', '["Show up late and apologize in person", "Message the customer in-app before your arrival window closes", "Cancel the job", "Call support first"]', 'Message the customer in-app before your arrival window closes', 'Proactive in-app notice is the professional standard and prevents a late arrival from being logged as a no-show.', 4),
('11111111-0001-0001-0001-000000000002', 'You cancel a job 12 hours before it starts. What is the typical reliability impact?', '["No impact", "A 3-point reduction", "Immediate suspension", "Loss of tier status instantly"]', 'A 3-point reduction', 'A cancellation within 24 hours costs 3 reliability points; a no-call/no-show costs 10.', 5);

-- Module 3
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000003', 'You''re cleaning a bedroom and see prescription medications on a nightstand. A friend later asks if you noticed anything interesting. You should:', '["Share general details", "Decline to discuss any details about the customer''s home", "Mention the medications", "Describe only the home layout"]', 'Decline to discuss any details about the customer''s home', 'What you see inside a home stays inside that home. Discussing any customer details — even seemingly harmless ones — violates privacy and trust.', 1),
('11111111-0001-0001-0001-000000000003', 'A customer gives you a physical house key. What is the correct handling?', '["Make a backup copy in case you lose it", "Store it safely and return it as instructed; never copy or share it", "Leave it under the doormat for next time", "Give it to a household member"]', 'Store it safely and return it as instructed; never copy or share it', 'Keys are never copied or shared. If a key is lost, contact support and the customer immediately.', 2),
('11111111-0001-0001-0001-000000000003', 'You arrive and the front door is already open. What should you do?', '["Walk in and start cleaning", "Contact the customer before entering and document the arrival time and door state", "Call the police immediately", "Leave and mark the job incomplete"]', 'Contact the customer before entering and document the arrival time and door state', 'An open door could signal a problem. Contact the customer first; if there are signs of a break-in or you feel unsafe, don''t enter and call emergency services.', 3),
('11111111-0001-0001-0001-000000000003', 'Which of these is actually allowed inside a customer''s home?', '["Photographing the decor for social media", "Listening to music through one earbud while working", "Eating food from the fridge when hungry", "Inviting a friend to help without telling the customer"]', 'Listening to music through one earbud while working', 'One earbud is fine — the other must stay free for awareness. Photography, eating their food, and unregistered guests are all prohibited.', 4),
('11111111-0001-0001-0001-000000000003', 'When may you photograph inside a customer''s home?', '["Whenever something looks interesting", "Only to document damage or an incident, shared via the Sweepr claims system", "Before every clean for social media", "After every clean for a portfolio"]', 'Only to document damage or an incident, shared via the Sweepr claims system', 'Photography is allowed only to document damage/incidents through the claims system — never for social media or personal use.', 5);

-- Module 4
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000004', 'What is the most common reason cleaners are permanently removed?', '["Too many 4-star reviews", "Off-platform bookings — accepting cash or directing customers to book outside Sweepr", "A reliability score below 80", "Using the customer''s WiFi"]', 'Off-platform bookings — accepting cash or directing customers to book outside Sweepr', 'Off-platform booking violates the ICA and is the most enforced rule, harming customer trust and the marketplace.', 1),
('11111111-0001-0001-0001-000000000004', 'Your liability insurance lapses. What happens and what should you do?', '["Nothing — platform insurance covers you", "You''re suspended from new offers until you upload a current certificate", "You verbally tell customers you''re uninsured", "You must cancel your account"]', 'You''re suspended from new offers until you upload a current certificate', 'Active insurance is required. A lapse suspends new offers until a valid certificate is on file.', 2),
('11111111-0001-0001-0001-000000000004', 'A customer asks for your personal number so they can book you directly next time. You should:', '["Give it — direct relationships are good business", "Politely decline and explain all communication must stay on the platform", "Give a fake number", "Report the customer to support"]', 'Politely decline and explain all communication must stay on the platform', 'Giving contact info for direct booking is prohibited off-platform solicitation. Decline politely and explain the platform requirement.', 3),
('11111111-0001-0001-0001-000000000004', 'Under the contractor model, who controls how you perform the cleaning?', '["Sweepr dictates every step", "You control your methods; Sweepr sets the quality standard and scope, not the process", "The customer dictates every step you must follow", "Your insurer"]', 'You control your methods; Sweepr sets the quality standard and scope, not the process', 'Contractor status means you decide how to achieve the required outcome. Sweepr defines what, not how.', 4),
('11111111-0001-0001-0001-000000000004', 'A customer asks you to delete their personal information from your records. You should:', '["Delete your own notes and contacts", "Direct them to Sweepr''s privacy team and not fulfill the request yourself", "Tell them you have no records", "Email them your records"]', 'Direct them to Sweepr''s privacy team and not fulfill the request yourself', 'CCPA/GDPR deletion requests must be handled by Sweepr''s privacy team, not individual contractors.', 5),
('11111111-0001-0001-0001-000000000004', 'When does Sweepr''s supplemental insurance apply?', '["To any damage during any job", "To verified incidents during booked jobs after your own insurance has paid out", "Only when you have no insurance", "To damage you cause intentionally"]', 'To verified incidents during booked jobs after your own insurance has paid out', 'Platform coverage is secondary — it activates only after your policy is exhausted, and never for negligence or intentional acts.', 6);

-- Module 5
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000005', 'Which combination produces toxic chloramine gas?', '["Bleach and dish soap", "Bleach and ammonia-based cleaners", "Vinegar and baking soda", "Hydrogen peroxide and water"]', 'Bleach and ammonia-based cleaners', 'Bleach + ammonia creates toxic chloramine gas — one of the most dangerous mixing errors. Never combine them.', 1),
('11111111-0001-0001-0001-000000000005', 'What is the minimum PPE for standard cleaning?', '["None required", "Nitrile or latex gloves and eye protection when using sprays", "A full hazmat suit", "Only a face mask"]', 'Nitrile or latex gloves and eye protection when using sprays', 'Minimum is nitrile/latex gloves (not vinyl) and eye protection for sprays or overhead work. Stronger chemicals require more.', 2),
('11111111-0001-0001-0001-000000000005', 'A tile bathroom has colored grout. Why avoid bleach?', '["It doesn''t clean grout", "Bleach fades colored grout; use oxygen-based cleaners instead", "Bleach is too expensive", "Grout doesn''t need cleaning"]', 'Bleach fades colored grout; use oxygen-based cleaners instead', 'Bleach permanently strips color from grout. Oxygen-based cleaners are safe and effective.', 3),
('11111111-0001-0001-0001-000000000005', 'You need to move a heavy sofa to clean under it. The safe technique is:', '["Bend at the waist and use your back", "Lift with your legs, keep the load close, avoid twisting", "Always ask the customer to help", "Never move any furniture"]', 'Lift with your legs, keep the load close, avoid twisting', 'Legs bent, back straight, load close, no twisting prevents the back and knee injuries common in cleaning.', 4),
('11111111-0001-0001-0001-000000000005', 'A fire breaks out while you''re cleaning. Your first action is:', '["Put it out with water", "Evacuate safely and call 911; leave your equipment", "Call Sweepr support before 911", "Finish your current task, then evacuate"]', 'Evacuate safely and call 911; leave your equipment', 'Life safety comes first. Evacuate, call 911, then notify Sweepr. Never fight a fire — your equipment is replaceable.', 5),
('11111111-0001-0001-0001-000000000005', 'What does "dwell time" mean?', '["Time spent in each room", "The time you let a product sit before wiping, which improves effectiveness", "Time between visits", "A product''s expiration date"]', 'The time you let a product sit before wiping, which improves effectiveness', 'Dwell time lets the product break down grime before you wipe. Skipping it means wiping, not cleaning.', 6);

-- Module 6
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000006', 'What is the recommended room sequence?', '["Entryway first, bedrooms last", "Bedrooms, bathrooms, kitchen, living areas, entryways", "Kitchen first, then everything else", "Whatever is fastest"]', 'Bedrooms, bathrooms, kitchen, living areas, entryways', 'This sequence prioritizes time-intensive and sanitation-critical rooms and prevents re-dirtying completed areas.', 1),
('11111111-0001-0001-0001-000000000006', 'Which direction should you work within a room?', '["Bottom to top, right to left", "Top to bottom, left to right, away from the door", "Biggest surfaces first", "Whatever feels comfortable"]', 'Top to bottom, left to right, away from the door', 'Top-to-bottom catches falling dust; left-to-right ensures coverage; away from the door avoids walking on clean floors.', 2),
('11111111-0001-0001-0001-000000000006', 'For streak-free mirrors and glass, you should use:', '["Paper towels with cleaner", "A dedicated microfiber cloth with cleaner applied to the cloth, not the glass", "Any rag with soap and water", "Newspaper"]', 'A dedicated microfiber cloth with cleaner applied to the cloth, not the glass', 'Paper towels leave lint. Apply cleaner to the cloth to avoid overspray, and use a dedicated glass cloth.', 3),
('11111111-0001-0001-0001-000000000006', 'A customer has a marble countertop. Which cleaner is safe?', '["All-purpose cleaner with bleach", "pH-neutral stone cleaner only", "Vinegar-based cleaner", "Abrasive scrubbing powder"]', 'pH-neutral stone cleaner only', 'Marble is acid-sensitive; acidic or abrasive products etch it permanently. Use only pH-neutral stone cleaners.', 4),
('11111111-0001-0001-0001-000000000006', 'When should you use the in-app checklist?', '["Only at the end to confirm", "As you go, checking items off when complete", "Once a week in a batch", "Only for deep cleans"]', 'As you go, checking items off when complete', 'Checking off as you go forces systematic coverage. Doing it from memory afterward is unreliable.', 5),
('11111111-0001-0001-0001-000000000006', 'The most effective way to prevent quality failures is:', '["Clean as fast as possible", "Use the checklist in real time and do a final customer-perspective walkthrough", "Ask the customer to point out spots", "Clean only what''s specifically requested"]', 'Use the checklist in real time and do a final customer-perspective walkthrough', 'Checklist discipline plus a customer''s-eye final walkthrough catches missed areas before the customer does.', 6);

-- Module 7
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000007', 'Why should all job communication stay in the Sweepr app?', '["It''s required and creates a documented, timestamped record", "It''s faster than texting", "So Sweepr can read your messages", "It''s optional"]', 'It''s required and creates a documented, timestamped record', 'In-app messages are timestamped and usable in disputes. Off-platform messages have no evidentiary value to Sweepr.', 1),
('11111111-0001-0001-0001-000000000007', 'You realize a job will run long. When should you tell the customer?', '["At the very end when you''re not done", "At the halfway point, proactively", "After you finish, in the wrap-up", "Never — just hurry"]', 'At the halfway point, proactively', 'Halfway notice gives maximum warning and frames the overrun as thoroughness rather than a surprise.', 2),
('11111111-0001-0001-0001-000000000007', 'A customer messages that they''re unhappy with the clean. Best first response?', '["Explain why you did everything correctly", "Listen, acknowledge their concern, and offer to make it right", "Offer a direct refund", "Ignore it"]', 'Listen, acknowledge their concern, and offer to make it right', 'Acknowledgment de-escalates. "I understand and want to make this right" beats justification. Then offer a solution.', 3),
('11111111-0001-0001-0001-000000000007', 'Which is allowed in your in-app messages?', '["Asking for a 5-star review", "A brief professional completion summary", "Negative comments about other cleaners", "Offering future work off-platform at a discount"]', 'A brief professional completion summary', 'A completion summary builds goodwill. Soliciting reviews, disparaging others, and off-platform offers are all prohibited.', 4),
('11111111-0001-0001-0001-000000000007', 'When should you escalate to Sweepr support instead of handling it yourself?', '["When you get a 4-star review", "When a customer is abusive, changes payment terms, or requests out-of-scope work", "Whenever you disagree", "Never"]', 'When a customer is abusive, changes payment terms, or requests out-of-scope work', 'Abuse, payment manipulation, unsafe conditions, and out-of-scope requests exceed a contractor''s role — escalate.', 5);

-- Module 8
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000008', 'The single most important preventive measure against damage claims is:', '["Work slowly", "Photograph pre-existing damage before cleaning each room", "Use only the customer''s products", "Never move furniture"]', 'Photograph pre-existing damage before cleaning each room', 'A timestamped pre-clean photo is your primary defense against false claims. Without it, you have no proof.', 1),
('11111111-0001-0001-0001-000000000008', 'You accidentally break a ceramic vase. What do you do first?', '["Clean up the pieces and hope it goes unnoticed", "Photograph it, message the customer in-app, and file a report within an hour", "Try to glue it", "Mention it verbally at the end"]', 'Photograph it, message the customer in-app, and file a report within an hour', 'Prompt, honest reporting is both ethical and practical. Hiding damage means removal when discovered.', 2),
('11111111-0001-0001-0001-000000000008', 'A customer claims you damaged something you know was already broken. You should:', '["Accept responsibility to keep them happy", "Respond through the claims interface with your dated pre-job photos and facts", "Accuse the customer of lying", "Ignore the claim"]', 'Respond through the claims interface with your dated pre-job photos and facts', 'Present documentation factually without accusation. The trust team reviews both accounts and photo metadata.', 3),
('11111111-0001-0001-0001-000000000008', 'During put-away, how many glasses should you carry at once?', '["As many as possible", "2–3 at a time, held by the body not the rim", "At least 10 to save time", "Stack them all in one trip"]', '2–3 at a time, held by the body not the rim', 'Breakage risk rises with overloaded carries. Extra trips are cheaper than a broken item.', 4),
('11111111-0001-0001-0001-000000000008', 'During an open damage claim, how quickly must you respond to information requests?', '["7 days", "1 month", "Within 48 hours", "You never need to respond"]', 'Within 48 hours', 'Respond within 48 hours during an active claim. Non-responsive cleaners may be suspended pending resolution.', 5);

-- Module 9
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000009', 'How are recent reviews weighted in your quality score?', '["All reviews count equally", "Reviews from the past 30 days count 2x vs. older ones", "Older reviews count more", "Only the last 5 matter"]', 'Reviews from the past 30 days count 2x vs. older ones', 'Recent performance is weighted double, so consistent recent quality recovers your score faster.', 1),
('11111111-0001-0001-0001-000000000009', 'What does Preferred tier require?', '["Quality above 4.0 and reliability above 70", "Quality above 4.5, reliability above 85, and 20+ jobs in 90 days", "Quality above 4.8 and 40+ jobs/month", "Just finishing training"]', 'Quality above 4.5, reliability above 85, and 20+ jobs in 90 days', 'Preferred needs 4.5+ quality, 85+ reliability, and 20+ completed jobs in 90 days. Elite is stricter.', 2),
('11111111-0001-0001-0001-000000000009', 'How much does a no-call/no-show reduce your reliability score?', '["1 point", "3 points", "10 points", "Immediate suspension"]', '10 points', 'A no-call/no-show costs 10 points — far more than a 24-hour cancellation (3 points).', 3),
('11111111-0001-0001-0001-000000000009', 'A family emergency causes you to miss a job. What should you do?', '["Nothing — emergencies are excused automatically", "Contact support within 24 hours, document it, and request a hardship review", "Enter a fake cancellation reason", "Delete your account"]', 'Contact support within 24 hours, document it, and request a hardship review', 'Hardship provisions exist for documented emergencies. Contact support within 24 hours; the impact may be reduced.', 4),
('11111111-0001-0001-0001-000000000009', 'You receive a rating you believe is unfair. What''s the rule on disputes?', '["Dispute anytime you disagree", "Dispute within 7 days when you believe a rating is unfair or inaccurate", "All ratings are final", "Only Elite cleaners can dispute"]', 'Dispute within 7 days when you believe a rating is unfair or inaccurate', 'You have 7 days to dispute. Valid errors may be removed; gaming the system with bad-faith disputes earns warnings.', 5);

-- Module 10
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000010', 'The app crashes mid-job. What most likely happened to your progress?', '["It''s lost permanently", "It''s saved server-side and reloads when you reopen the app", "You must restart the whole job", "You need to rebook with the customer"]', 'It''s saved server-side and reloads when you reopen the app', 'Progress is saved server-side in real time. A crash just disconnects the client; reopening reconnects your session.', 1),
('11111111-0001-0001-0001-000000000010', 'A payout is 3 business days late beyond the 7-day window. You should:', '["Wait another week", "Contact support through the Help tab with the specific job IDs", "Contact the customer for payment", "File a bank chargeback"]', 'Contact support through the Help tab with the specific job IDs', 'Small delays are normal; at 3+ days late, contact support with job IDs. Never involve the customer in payment issues.', 2),
('11111111-0001-0001-0001-000000000010', 'You can''t access the property and the customer won''t answer. Fastest help is:', '["Email support@sweepr.com", "Post on social media", "The in-app emergency contact, which escalates to a senior agent", "Conference the customer into a support call"]', 'The in-app emergency contact, which escalates to a senior agent', 'The in-app emergency option bypasses the queue for active-job situations and reaches a senior agent fast.', 3),
('11111111-0001-0001-0001-000000000010', 'How should you write a support request for the fastest resolution?', '["Describe it vaguely and let support figure it out", "Include the job ID, the exact issue, what you tried, and screenshots", "Just say the app isn''t working", "Submit several tickets for the same issue"]', 'Include the job ID, the exact issue, what you tried, and screenshots', 'Complete first-message detail eliminates back-and-forth and lets support resolve it immediately.', 4),
('11111111-0001-0001-0001-000000000010', 'Your battery is dying and you didn''t save the address. Best option?', '["Cancel the job", "Use the offline-cached job details in the app, or a screenshot taken before departing", "Call a friend to look it up", "Ring nearby doorbells"]', 'Use the offline-cached job details in the app, or a screenshot taken before departing', 'The app caches addresses offline. Screenshotting before leaving is the recommended backup.', 5);

-- Standard Cleaning quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000001', 'What does a standard clean guarantee that a deep clean is defined by going beyond?', '["Consistent, thorough surface maintenance every visit", "Cleaning inside appliances every visit", "Full cabinet-interior cleaning", "Wall and ceiling cleaning"]', 'Consistent, thorough surface maintenance every visit', 'Standard cleans are maintenance cleans — thorough surface work done consistently. Deep cleaning adds the intensive areas.', 1),
('22222222-0002-0002-0002-000000000001', 'You finish a standard clean well ahead of schedule. What should you do?', '["Leave early and mark complete", "Use the time for finishing touches that drive 5-star reviews", "Start a different job", "Bill for extra time anyway"]', 'Use the time for finishing touches that drive 5-star reviews', 'Spare time is an opportunity for details that earn 5 stars. Never leave early just to pad your rate.', 2),
('22222222-0002-0002-0002-000000000001', 'A customer expects inside-oven cleaning on a standard clean. You should:', '["Do it for free to avoid conflict", "Explain that''s a deep-clean item and offer to prioritize what''s in scope", "Refuse and end the job", "Ignore the request"]', 'Explain that''s a deep-clean item and offer to prioritize what''s in scope', 'Inside appliances are deep-clean scope. Kindly clarify scope and offer to prioritize in-scope work.', 3);

-- Deep Cleaning quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000002', 'How much extra time should you budget for a deep clean vs. a standard clean of the same home?', '["The same amount", "50–75% more", "Always twice as long", "It depends only on bathrooms"]', '50–75% more', 'Deep cleans need 50–75% more time; very neglected homes need even more. Flag scope concerns before starting.', 1),
('22222222-0002-0002-0002-000000000002', 'What should you do with refrigerator shelves and drawers during a deep clean?', '["Wipe them in place", "Remove them, wash in the sink, dry thoroughly, then replace", "Leave them and clean around", "Clean them with oven cleaner"]', 'Remove them, wash in the sink, dry thoroughly, then replace', 'Removing allows complete interior cleaning. Wash with dish soap, dry fully to prevent moisture, and replace.', 2),
('22222222-0002-0002-0002-000000000002', 'Which cleaner is safe for colored grout?', '["Chlorine bleach", "Oxygen-based cleaner like OxiClean", "Any all-purpose cleaner", "Acid-based tile cleaner"]', 'Oxygen-based cleaner like OxiClean', 'Bleach fades grout and acids damage it. Oxygen-based cleaners are safe and effective on most grout.', 3);

-- Move-In/Out quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000003', 'Why is documentation especially important for move-out cleans?', '["To show off your work", "They occur at transition points where landlord-tenant disputes are common and photos may be requested as evidence", "It''s legally required for move-outs", "To help the next cleaner"]', 'They occur at transition points where landlord-tenant disputes are common and photos may be requested as evidence', 'Deposits are at stake. Before/after photos protect you and may be requested in a dispute.', 1),
('22222222-0002-0002-0002-000000000003', 'You find suspected mold in a bathroom during a move-out clean. What should you do?', '["Clean it with bleach and continue", "Stop work on that area, photograph it, and message the customer", "Ignore it and clean around it", "Call the health department"]', 'Stop work on that area, photograph it, and message the customer', 'Mold remediation is outside cleaning scope. Stop, document, and notify the customer — don''t attempt to clean it.', 2),
('22222222-0002-0002-0002-000000000003', 'A landlord is present and asks your opinion on the tenant''s deposit. You should:', '["Share your honest opinion of the home''s condition", "Stay focused on cleaning and avoid discussing the dispute", "Tell them everything you noticed", "Ask the landlord to leave"]', 'Stay focused on cleaning and avoid discussing the dispute', 'Your role is to clean, not testify. Statements could be misrepresented in a landlord-tenant dispute.', 3);

-- Pet Homes quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000004', 'Which product actually eliminates pet odors rather than masking them?', '["Air freshener spray", "Scented candles", "Enzyme-based cleaner", "Baking soda only"]', 'Enzyme-based cleaner', 'Enzyme cleaners break down organic odor compounds. Fresheners and candles only mask odors temporarily.', 1),
('22222222-0002-0002-0002-000000000004', 'Why avoid strong bleach products where pets walk?', '["It damages flooring", "Residual bleach is toxic to dogs and cats", "It doesn''t clean pet areas", "It''s too expensive"]', 'Residual bleach is toxic to dogs and cats', 'Pets lick their paws after walking on treated surfaces; residual bleach can seriously harm them. Use pet-safe products.', 2),
('22222222-0002-0002-0002-000000000004', 'A dog is growling and snapping at you mid-job. What should you do?', '["Calm it with treats", "Stop work, contact the customer, and wait for guidance", "Continue in another room", "Leave without notifying anyone"]', 'Stop work, contact the customer, and wait for guidance', 'An aggressive pet is a safety hazard. Stop, don''t handle the animal, and contact the customer for guidance.', 3);

-- Laundry quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000005', 'When should you start the laundry during a visit?', '["After all cleaning is done", "At the beginning, so it runs while you clean", "Only when asked", "Order doesn''t matter"]', 'At the beginning, so it runs while you clean', 'Starting early maximizes efficiency — cycles run while you do other tasks and you finish put-away near the end.', 1),
('22222222-0002-0002-0002-000000000005', 'You find what looks like a silk blouse in the pile. What should you do?', '["Wash gentle/cold", "Set it aside and note it — it may need special handling or dry cleaning", "Wash normal/warm", "Dry on high heat"]', 'Set it aside and note it — it may need special handling or dry cleaning', 'Silk, wool, and delicates shouldn''t be washed without guidance. Set aside and communicate; damage is costly.', 2),
('22222222-0002-0002-0002-000000000005', 'No instructions are provided. What default water temperature for darks?', '["Hot", "Warm", "Cold — prevents color bleeding and shrinkage", "Any temperature"]', 'Cold — prevents color bleeding and shrinkage', 'Cold is the safe default for darks. When in doubt, cooler water is safer.', 3);

-- Dishes quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000006', 'There are crystal wine glasses in the dish pile. What should you do?', '["Dishwasher on gentle", "Hand-wash carefully and dry immediately with a clean cloth", "Skip them entirely", "Scrub hard with a sponge"]', 'Hand-wash carefully and dry immediately with a clean cloth', 'Crystal should always be hand-washed; dishwasher heat and detergent can cloud or crack it over time.', 1),
('22222222-0002-0002-0002-000000000006', 'You break a plate during the dishes add-on. Correct procedure?', '["Throw away the pieces quietly", "Photograph it, message the customer in-app, and file a damage report", "Buy a replacement yourself", "Mention it verbally at the end"]', 'Photograph it, message the customer in-app, and file a damage report', 'Damage reporting is the same for add-ons: document, notify in-app, and file a report.', 2),
('22222222-0002-0002-0002-000000000006', 'You can''t tell where a specific pot belongs. What should you do?', '["Guess the most logical cabinet", "Set it on the counter and note its location in your completion message", "Put it in a random drawer", "Leave it in the drying rack"]', 'Set it on the counter and note its location in your completion message', 'When unsure, leave it visible and communicate. Wrong placement is more disruptive than a noted counter item.', 3);

-- Interior Windows quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000007', 'How should glass cleaner be applied for streak-free results?', '["Sprayed directly on the glass", "Applied to the microfiber cloth, then to the glass", "Sprayed on the squeegee blade", "Applied to paper towels"]', 'Applied to the microfiber cloth, then to the glass', 'Spraying the cloth avoids overspray on frames, sills, and electronics and gives better product control.', 1),
('22222222-0002-0002-0002-000000000007', 'A floor-to-ceiling window needs cleaning but you didn''t bring an extension squeegee. What should you do?', '["Climb on the windowsill", "Document the inaccessible areas and offer to return with proper equipment", "Skip it without noting", "Stand on the customer''s chair"]', 'Document the inaccessible areas and offer to return with proper equipment', 'Never improvise unstable platforms. Document what couldn''t be safely reached and offer a return visit.', 2),
('22222222-0002-0002-0002-000000000007', 'How do you best check windows for streaks?', '["Wipe once more for safety", "View from an angle in natural light", "Run a finger along the glass", "Look head-on under overhead lighting"]', 'View from an angle in natural light', 'A raking angle in natural light reveals streaks that head-on viewing misses.', 3);

-- Organization quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000008', 'You booked a pantry organization, but the bedroom closet is also a mess. What should you do?', '["Organize the closet as a bonus", "Stick to the pantry; note the closet for a possible future booking", "Add the closet to the bill yourself", "Do the closet instead of the pantry"]', 'Stick to the pantry; note the closet for a possible future booking', 'Only organize what''s booked. Touching unrequested areas can hide items. Note opportunities for the future.', 1),
('22222222-0002-0002-0002-000000000008', 'While organizing a pantry you find what looks like trash. What should you do?', '["Throw it away", "Leave it; only discard with explicit customer permission", "Bag it by the front door", "Decide based on your judgment"]', 'Leave it; only discard with explicit customer permission', 'Never discard items without permission — apparent trash may matter to the customer. You organize, you don''t decide.', 2),
('22222222-0002-0002-0002-000000000008', 'A customer asks for organization suggestions. Your role is to:', '["Impose your own system", "Offer options and implement what the customer chooses", "Decline to suggest anything", "Follow a fixed method regardless"]', 'Offer options and implement what the customer chooses', 'You assist the customer''s vision. Offer professional options, then implement their decision — their system is the right one.', 3);
