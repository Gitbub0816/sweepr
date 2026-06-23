-- 008b: Lessons 6-10 (Quality, Communication, Damage, Reliability, Support) + Service Module Lessons
-- Run after 008a.


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
