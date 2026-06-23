
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
