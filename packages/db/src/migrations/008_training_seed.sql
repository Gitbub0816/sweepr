-- =============================================================================
-- Training seed: 10 base modules + 8 service-specific modules
-- =============================================================================

-- ─── Base Modules ─────────────────────────────────────────────────────────────

INSERT INTO training_modules (id, title, description, category, required_type, estimated_minutes, sort_order, passing_score, max_attempts) VALUES
('11111111-0001-0001-0001-000000000001', 'Welcome to Sweepr and Independent Cleaner Expectations', 'Understand what it means to work on the Sweepr platform as an independent cleaner, your responsibilities, and what customers expect.', 'onboarding', 'base', 18, 1, 80, 3),
('11111111-0001-0001-0001-000000000002', 'Using the Sweepr App', 'A complete walkthrough of the Sweepr Pro app — managing your availability, accepting jobs, navigating to bookings, and updating job status.', 'platform', 'base', 30, 2, 80, 3),
('11111111-0001-0001-0001-000000000003', 'Customer Privacy, Home Access, and Professional Conduct', 'Learn the standards of conduct expected inside a customer''s home, how to handle access securely, and the privacy obligations you carry.', 'conduct', 'base', 30, 3, 80, 3),
('11111111-0001-0001-0001-000000000004', 'Legal, Compliance, and Marketplace Rules', 'Your obligations as an independent contractor, what the marketplace rules prohibit, and how to stay in good standing with the platform.', 'legal', 'base', 40, 4, 80, 3),
('11111111-0001-0001-0001-000000000005', 'Safety, Chemicals, Equipment, and Injury Prevention', 'Proper use and storage of cleaning chemicals, PPE requirements, ergonomic technique, and what to do if an incident occurs.', 'safety', 'base', 40, 5, 80, 3),
('11111111-0001-0001-0001-000000000006', 'Cleaning Quality Standards', 'The Sweepr quality benchmark — what every clean must meet, room-by-room checklists, and how inspections and ratings are used.', 'quality', 'base', 45, 6, 80, 3),
('11111111-0001-0001-0001-000000000007', 'Customer Communication and Conflict Handling', 'How to communicate professionally before, during, and after a job, and how to de-escalate difficult situations without violating platform policy.', 'communication', 'base', 25, 7, 80, 3),
('11111111-0001-0001-0001-000000000008', 'Damage, Claims, Incidents, and Insurance', 'What to do if you damage something, how to document and report incidents, and how the platform''s insurance coverage works.', 'compliance', 'base', 30, 8, 80, 3),
('11111111-0001-0001-0001-000000000009', 'Reliability, Ratings, and Platform Standing', 'How your reliability score is calculated, what causes demotion or suspension, and how to recover your standing after an incident.', 'performance', 'base', 25, 9, 80, 3),
('11111111-0001-0001-0001-000000000010', 'Technical Troubleshooting and Support', 'Common technical issues with the app, how to reach Sweepr support, and steps to take when technology fails you on a job.', 'support', 'base', 25, 10, 80, 3);

-- ─── Service-Specific Modules ─────────────────────────────────────────────────

INSERT INTO training_modules (id, title, description, category, required_type, service_key, estimated_minutes, sort_order, passing_score, max_attempts) VALUES
('22222222-0002-0002-0002-000000000001', 'Standard Cleaning Deep Dive', 'Systematic approach for standard maintenance cleans — sequencing, time management, and quality consistency across repeat visits.', 'service', 'service_specific', 'standard_cleaning', 30, 20, 80, 3),
('22222222-0002-0002-0002-000000000002', 'Deep Cleaning Mastery', 'Techniques for thorough deep cleans including appliances, grout, baseboards, and areas often missed in standard cleans.', 'service', 'service_specific', 'deep_cleaning', 35, 21, 80, 3),
('22222222-0002-0002-0002-000000000003', 'Move-In / Move-Out Cleaning', 'The elevated standards required for vacant-property cleans, checklist management, and documentation best practices.', 'service', 'service_specific', 'move_in_out', 35, 22, 80, 3),
('22222222-0002-0002-0002-000000000004', 'Cleaning Homes with Pets', 'Managing pet hair, dander, odors, and allergens while respecting the customer''s animals and maintaining your own safety.', 'service', 'service_specific', 'pet_home', 25, 23, 80, 3),
('22222222-0002-0002-0002-000000000005', 'Laundry Add-On Service', 'Washing, drying, folding, and putting away laundry according to platform standards and customer preferences.', 'service', 'service_specific', 'laundry_addon', 20, 24, 80, 3),
('22222222-0002-0002-0002-000000000006', 'Dishes Add-On Service', 'Proper dishwashing, dish drying, and putting items away without breakage or incorrect placement.', 'service', 'service_specific', 'dishes_addon', 20, 25, 80, 3),
('22222222-0002-0002-0002-000000000007', 'Interior Window Cleaning', 'Streak-free window cleaning technique, tools, and safety when working on high or hard-to-reach interior windows.', 'service', 'service_specific', 'interior_windows', 25, 26, 80, 3),
('22222222-0002-0002-0002-000000000008', 'Organization Add-On Service', 'Helping customers declutter and organize closets, pantries, and common areas without moving valuables or making unsolicited decisions.', 'service', 'service_specific', 'organization', 25, 27, 80, 3);

-- =============================================================================
-- LESSONS
-- =============================================================================

-- ── Module 1: Welcome to Sweepr ──────────────────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000001', 'What is Sweepr?', 'Sweepr is a two-sided marketplace that connects homeowners and renters with vetted independent cleaning professionals. Unlike traditional cleaning companies, Sweepr does not employ cleaners — you work as an independent contractor, setting your own schedule and accepting only the jobs you want.

The platform handles booking, payment processing, customer communication routing, and dispute resolution. Your role is to deliver high-quality cleaning services that meet our published standards. When you do, customers rebook, your rating rises, and you receive higher-priority job offers.

Think of Sweepr as your business development partner — we bring the customers, you bring the expertise. Your success on the platform is directly tied to your reliability, quality, and professionalism.', 1, 5),

('11111111-0001-0001-0001-000000000001', 'Your Role as an Independent Contractor', 'As an independent contractor on Sweepr, you are responsible for your own taxes, tools, and transportation. Sweepr does not withhold income tax, pay employer FICA, or provide benefits. You will receive a 1099-NEC form at the end of the year for any earnings over $600.

This independence means you have significant flexibility: you decide when to be available, which services to offer, and how far to travel. However, it also means you must conduct yourself professionally at all times — your actions reflect on your personal business, not just the platform.

You are required to have your own liability insurance. Sweepr''s platform insurance is supplemental and only activates after your personal coverage has been exhausted. Maintaining valid insurance is a condition of staying on the platform.', 2, 5),

('11111111-0001-0001-0001-000000000001', 'What Customers Expect', 'Sweepr customers book with high expectations. They are letting a stranger into their home and trusting them with their most personal space. Meeting and exceeding those expectations every time is what builds your reputation on the platform.

Customers expect punctuality. Arriving within the agreed arrival window (or communicating proactively if delayed) is non-negotiable. They expect thoroughness — every surface, corner, and surface listed in the service checklist must be addressed. They expect respect for their belongings and privacy.

Customers will rate you after every job. These ratings aggregate into your public score, which determines your position in job offer queues and your tier status. A single 1-star review can lower your average meaningfully, so consistency matters far more than occasional excellence.', 3, 5);

-- ── Module 2: Using the Sweepr App ───────────────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000002', 'Setting Up Your Profile and Availability', 'Your profile is your storefront. Complete profiles with a clear, professional photo, a well-written bio, and accurate service offerings receive more job offers than incomplete ones. Take time to write a bio that highlights your experience, your approach to cleaning, and what sets you apart.

Set your availability accurately. The platform''s matching engine will only offer jobs during windows you have marked available. If you mark yourself available but repeatedly decline or cancel, your reliability score will drop. Update your availability ahead of time when you have schedule changes — do not wait until the day of to decline a job you knew you could not take.

Your service radius determines how far from your home base we will offer jobs. A smaller radius means fewer offers but less drive time; a larger radius means more offers but more fuel cost. Find the balance that works for your schedule and vehicle.', 1, 6),

('11111111-0001-0001-0001-000000000002', 'Accepting and Managing Job Offers', 'When a job offer arrives, you have a limited window — typically 15 minutes — to accept or decline. The offer screen shows the job type, location, estimated duration, pay, and customer rating. Review all details before accepting.

Once you accept, the job is locked into your schedule. Canceling after acceptance damages your reliability score and may result in a platform warning. Only accept jobs you are genuinely committed to completing.

Use the job management screen to view your upcoming schedule, navigate to the job address, mark your arrival, update job status as you progress through the checklist, and mark the job complete. Keeping statuses updated in real time helps the customer stay informed and gives you a documented record if any disputes arise later.', 2, 7),

('11111111-0001-0001-0001-000000000002', 'Navigating to Jobs and Handling Access', 'The app provides address navigation via your default maps application. Always leave with enough time to arrive at the start of your arrival window, accounting for traffic. If you will be late, notify the customer through the in-app messaging system before your arrival window closes.

Entry instructions are displayed in the job detail screen. These may include keypad codes, lockbox combinations, building access procedures, or instructions to call a doorman. Read these before you arrive so you are not fumbling with your phone in front of the building.

Never photograph or share access codes or entry information outside the Sweepr platform. This information is sensitive. Sweepr logs all access to entry details and any unauthorized sharing is grounds for immediate removal from the platform.', 3, 7),

('11111111-0001-0001-0001-000000000002', 'Getting Paid and Understanding Earnings', 'Sweepr processes payments automatically. You do not collect payment from customers directly — all transactions happen through the platform. Your earnings are deposited to your connected bank account via Stripe on a weekly rolling basis, with a standard 7-day processing window.

Your displayed pay for a job is your guaranteed minimum. Tips are paid out separately and are passed through in full. If a job runs significantly longer than estimated due to factors outside your control (e.g., the home was in a far worse condition than described), document the extra work with photos and submit a time adjustment request through the app.

View your full earnings history, pending payouts, and tax summary in the Earnings tab. Download your 1099 form each January from the same tab. If you have payout issues, contact support through the Help section — do not reach out to customers about payment.', 4, 8);

-- ── Module 3: Privacy, Home Access, Conduct ──────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000003', 'The Trust Standard in a Customer''s Home', 'When you enter a customer''s home, you are in one of the most intimate spaces in their life. The standard of trust required is not just professional — it is personal. Customers are entrusting you with their valuables, their private belongings, their personal documents, and the safety of their family.

This trust is the foundation of every successful cleaning business. Violating it — even in small ways — destroys the relationship permanently. Always treat every item in the home as if it belongs to someone who will immediately notice if it is moved, damaged, or disturbed.

Never open drawers, closets, or cabinets that are not required for the cleaning service. Never handle personal items, mail, medications, or financial documents. If you encounter something that appears illegal or dangerous, exit the home, lock up as instructed, and contact Sweepr support immediately.', 1, 7),

('11111111-0001-0001-0001-000000000003', 'Secure Home Access and Key Handling', 'You may be given physical keys, key codes, or smart lock access. All of these must be handled with the same level of care as a master key to someone''s entire life. Never share access credentials with anyone. Never make copies of physical keys. If you lose a key or access code is compromised, contact Sweepr support and the customer immediately.

Digital access codes must not be stored in personal notes apps, text messages, or shared with household members or subcontractors. All access instructions are encrypted and stored in the Sweepr platform — use the app to reference them.

If you arrive and find the home already open, contact the customer before entering and document your arrival time and the door state. If the home shows signs of break-in or something feels wrong, do not enter. Call the customer, and if you cannot reach them, call local emergency services.', 2, 8),

('11111111-0001-0001-0001-000000000003', 'Professional Conduct Standards', 'Professional conduct inside a customer''s home means: do not eat or drink the customer''s food without explicit written permission. Do not use the customer''s bathroom beyond what is absolutely necessary. Do not watch television, use the customer''s devices, or make personal phone calls (non-work calls) while on the job.

You may listen to music or podcasts through your own earbuds at a reasonable volume, but only one earbud — you must remain aware of your environment at all times. Do not bring guests, family members, or other workers onto a job unless they are registered as a co-worker on the platform and the customer has explicitly approved it.

Maintain a smoke-free environment at all times. Never smoke on the property, in the driveway, or within sight of the home. If you wear fragrance, keep it minimal — many customers have sensitivities or allergies. Dress appropriately: Sweepr-branded or professional attire is required.', 3, 8),

('11111111-0001-0001-0001-000000000003', 'Privacy, Photography, and Social Media', 'Taking photographs of a customer''s home, belongings, or family members — even for "before/after" documentation — is only permitted when required to document damage or an incident, and only shared through the Sweepr platform claim system. You may not post photos of any customer''s home on social media, review sites, or personal websites.

Sweepr collects location data while you are on an active job. This is used for ETA accuracy and dispute resolution. This data is not shared with third parties and is retained for 90 days. You are informed of this policy through the app''s consent screen.

Violations of customer privacy — including unauthorized photography, sharing access information, or discussing customer personal details — are grounds for immediate and permanent removal from the platform, and may expose you to civil liability.', 4, 7);

-- ── Module 4: Legal, Compliance, Marketplace Rules ───────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000004', 'Independent Contractor vs. Employee', 'Understanding your legal classification as an independent contractor is critical. You are not an employee of Sweepr. This means Sweepr does not control how you perform your work — only the outcome (the quality standard) and the general scope (the service booked). You use your own tools, set your own schedule, and can work for other platforms simultaneously.

Because you are a contractor, you are responsible for self-employment taxes (15.3% of net earnings, split between Social Security and Medicare). You should make quarterly estimated tax payments to the IRS to avoid penalties at year end. Consult a tax professional about deductions available to you — vehicle mileage, supplies, and equipment are commonly deductible.

The independent contractor relationship is governed by the Sweepr Independent Contractor Agreement (ICA) you signed during onboarding. Review it annually, as it may be updated. Continued use of the platform after a policy update constitutes acceptance of the new terms.', 1, 9),

('11111111-0001-0001-0001-000000000004', 'Prohibited Activities and Marketplace Rules', 'The Sweepr marketplace has rules designed to protect customers, the platform, and other cleaners. Violating these rules results in warnings, suspension, or permanent removal depending on severity.

Strictly prohibited: soliciting customers to book outside the platform ("off-platform bookings"). This includes giving customers your personal contact info for the purpose of booking, accepting cash for Sweepr-referred work, or directing customers to competing platforms. This is the most common reason cleaners are removed, and enforcement includes monitoring for patterns in customer communications.

Also prohibited: creating fake reviews, manipulating ratings, accessing customer accounts through any method other than officially granted credentials, performing work beyond the scope booked without authorization, and bringing unauthorized individuals onto job sites. Report any other cleaner you believe is violating these rules to Sweepr compliance.', 2, 10),

('11111111-0001-0001-0001-000000000004', 'Insurance Requirements', 'You are required to maintain a general liability insurance policy with a minimum of $1 million per occurrence. Sweepr verifies this during onboarding and performs annual checks. You must upload a current certificate of insurance through the platform. If your policy lapses, you will be suspended from receiving new job offers until a valid certificate is on file.

The Sweepr platform provides supplemental coverage through its trust-and-safety program for verified incidents during booked jobs. This coverage is secondary — it only activates after your own policy has paid out. Do not rely on platform coverage as a substitute for your own policy.

If you operate as a business entity (LLC, corporation), your business must carry the insurance, not just you personally. Sole proprietors may use a personal-trade policy. Contact your insurance provider and specify that you perform residential cleaning services as an independent contractor.', 3, 11),

('11111111-0001-0001-0001-000000000004', 'Data Privacy and GDPR/CCPA Obligations', 'As a contractor who accesses customer data through the Sweepr platform, you have legal obligations under applicable data privacy laws including the California Consumer Privacy Act (CCPA) and, where applicable, GDPR. You must not retain, copy, or use customer data for any purpose other than completing the booked service.

Specifically: do not record or log customer addresses in personal notebooks, spreadsheets, or contact lists. Do not contact customers outside of the Sweepr platform. Do not share customer information with third parties. If a customer requests that you delete any information you have about them, direct them to Sweepr''s privacy team — do not attempt to fulfill data deletion requests yourself.

Any breach or suspected breach of customer data must be reported to Sweepr''s privacy team immediately via the support channel. Failure to report a known breach may result in personal legal liability in addition to platform removal.', 4, 10);

-- ── Module 5: Safety ─────────────────────────────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000005', 'Chemical Safety Fundamentals', 'Cleaning chemicals range from mildly irritating to acutely dangerous. Every cleaner must understand basic chemical safety before working with any products. The golden rule: never mix chemicals without explicit manufacturer guidance. Mixing bleach with ammonia produces chloramine gas; mixing bleach with acid-based cleaners produces chlorine gas. Both are toxic and potentially lethal in enclosed spaces.

Always read the Safety Data Sheet (SDS) for any product you use. Manufacturers are legally required to provide SDS sheets for all chemical products. The SDS tells you the hazards, required PPE, first aid for exposure, and disposal requirements. Keep SDS sheets accessible — either on your phone or in your supply bag.

Store chemicals in their original containers with labels intact. Never transfer chemicals to unlabeled bottles. Keep chemicals out of reach of children and pets. When working in a customer''s home, store your bag in a location where it will not be knocked over or accessed by household members.', 1, 9),

('11111111-0001-0001-0001-000000000005', 'Personal Protective Equipment (PPE)', 'PPE is not optional. It is a professional and legal requirement when handling cleaning chemicals. The minimum PPE for standard cleaning work is: nitrile or latex gloves (not vinyl, which offers poor chemical resistance), and eye protection when using spray products or working overhead.

For deep cleaning or working with stronger chemicals (toilet bowl cleaners, oven degreasers, mold removers), add: a respirator or N95 mask when working in enclosed spaces with limited ventilation, and knee pads if working on hard floors for extended periods.

Inspect your PPE before each use. Gloves with holes or tears should be replaced immediately. Do not reuse single-use respirator masks. Eye protection should be cleaned between jobs. Keep a stock of replacements in your supply kit — running out of PPE mid-job is not a valid reason to work without it.', 2, 9),

('11111111-0001-0001-0001-000000000005', 'Ergonomics and Injury Prevention', 'Cleaning is physically demanding work. Repetitive strain injuries, back injuries, and knee injuries are the most common occupational hazards for cleaning professionals. Preventing them requires deliberate attention to your body mechanics every shift.

Lift with your legs, not your back. When moving furniture to clean underneath, push with your legs and keep the load close to your body. Avoid twisting while carrying weight. Use extension wands and long-handled tools to reduce the need to crouch or kneel when possible.

Take micro-breaks every 45 minutes. Stretch your wrists, shoulders, and lower back regularly. If you feel pain during a job — especially sharp or sudden pain — stop what you are doing, assess, and rest. Working through pain leads to serious injury. If you sustain an injury on a job, document it in the app and contact Sweepr support.', 3, 8),

('11111111-0001-0001-0001-000000000005', 'Slip, Fall, and Emergency Procedures', 'Wet floors are a major hazard — both for you and for household members. When mopping, close off the area being cleaned or use wet floor signage. If the home has children or elderly residents, coordinate the mopping sequence to avoid exposing them to wet surfaces.

Know the emergency exits of every home you work in. Identify them on arrival. If a fire, gas leak, or other emergency occurs, your priority is to evacuate safely and call emergency services. Do not attempt to fight a fire or contain a gas leak yourself. Leave your equipment and exit immediately.

If a customer or household member is injured while you are present, call 911 immediately. Do not administer medical treatment beyond basic first aid unless you are trained. Notify Sweepr support as soon as the immediate emergency is handled. Complete a full incident report in the app within 24 hours.', 4, 9);

-- ── Module 6: Quality Standards ──────────────────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000006', 'The Sweepr Quality Standard', 'Every clean you perform on Sweepr must meet the published quality benchmark for the service type. This benchmark is the foundation of customer trust and is what your rating is measured against. "Good enough" is not sufficient — the standard is thorough, consistent, and repeatable.

The quality standard exists because customers make repeat booking decisions based on their first experience. A clean that earns a 4-star instead of a 5-star review is not a minor difference — it reduces your rebooking probability by over 60% for that customer. Protecting your rating means protecting your income.

You will be provided the full service-specific quality checklist in the service training modules. The base standard applies to all cleans: surfaces wiped, floors cleaned, trash emptied, fixtures shined, and the space left smelling clean. These are not optional items — they are minimum requirements.', 1, 8),

('11111111-0001-0001-0001-000000000006', 'Room-by-Room Cleaning Sequence', 'Efficient cleaning follows a consistent sequence. Work top-to-bottom within each room — dust ceiling fans before wiping counters, clean counters before mopping floors. Work left-to-right around the room so you do not skip surfaces. Clean from the furthest point from the door back toward the exit so you are not walking on freshly cleaned floors.

Standard room sequence: bedrooms first (they require more time and attention), then bathrooms (highest sanitation importance), then kitchen (most labor-intensive appliance work), then living areas and hallways, and finally entryways. Adjust based on the specific layout, but always complete each room fully before moving on.

Time management is critical. Each job is allocated a fixed number of hours based on the booking details. If you are falling behind schedule, communicate with the customer via the app — do not rush and sacrifice quality. Rushed work causes damage and low ratings. A brief message explaining you are taking a little extra time to do the job right builds goodwill.', 2, 9),

('11111111-0001-0001-0001-000000000006', 'Common Quality Failures and How to Avoid Them', 'The most common reasons customers leave less-than-5-star reviews: missed areas (especially baseboards, behind toilets, under furniture edges), streaky glass and mirrors, soap scum left in showers and tubs, dusty ceiling fan blades, and smudged stainless steel appliances.

Each of these is preventable with technique and checklist discipline. Use a dedicated microfiber cloth for glass surfaces — never paper towels, which leave lint. Dry stainless steel in the direction of the grain. Scrub soap scum with a non-abrasive scrubber and allow the cleaning product dwell time before wiping. Run your finger along baseboards before leaving a room.

The easiest way to avoid quality failures is to use the in-app checklist as you go, not after. Checking items off as you complete them forces systematic coverage. Before marking a job complete, do a final walkthrough — look at the home from a customer''s perspective, not a cleaner''s.', 3, 9),

('11111111-0001-0001-0001-000000000006', 'Supplies, Equipment, and Substitutions', 'You are responsible for bringing professional-grade supplies to every job unless the customer has specifically requested otherwise or the booking specifies customer-supplied products. Professional supplies consistently outperform consumer products and reduce your time per job.

Your standard kit should include: all-purpose cleaner, bathroom disinfectant, glass cleaner, toilet bowl cleaner, stainless steel polish, wood-safe surface cleaner, mop and bucket or Swiffer-type system, vacuum with HEPA filter, microfiber cloths (minimum 12), scrubbing sponges, and trash bags in multiple sizes.

Never substitute products without approval. If you are out of a required product, contact the customer through the app before starting the affected area. Do not use household products you find in the customer''s home without explicit written permission — some products may damage surfaces you are not aware of, and using their supplies creates liability questions.', 4, 9),

('11111111-0001-0001-0001-000000000006', 'Handling Special Surfaces and Delicate Items', 'Every home has surfaces that require special care. Hardwood floors should never be steam mopped — use a wood-safe spray mop system. Natural stone (marble, granite, travertine) must only be cleaned with pH-neutral cleaners; acidic or abrasive products etch the surface. Stainless steel should be cleaned with the grain direction. Painted surfaces should only be wiped with microfiber and mild cleaner — never with abrasive scrubbers.

Delicate items — artwork, sculptures, antiques, electronics — should generally not be moved or cleaned unless the customer has explicitly requested it. If you must clean near a delicate item, photograph it before touching it. If you accidentally knock something over, report it immediately through the app — do not hide or minimize damage.

When in doubt, do not touch it. A customer would rather have you skip cleaning the shelf holding their grandmother''s china than have the china broken. Use common sense and err on the side of caution.', 5, 10);

-- ── Module 7: Communication and Conflict ─────────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000007', 'Pre-Job Communication Best Practices', 'Good communication starts before you arrive. When you accept a job, the customer receives a notification. If the booking is more than 24 hours away, send a brief confirmation message through the in-app chat: your name, confirmation that you have reviewed the job details, and any clarifying questions about access or special requests.

On the morning of the job, send a brief arrival message confirming your ETA. This simple act reduces customer anxiety, prevents missed arrivals from being reported as no-shows, and sets a professional tone for the day.

Use the in-app messaging system exclusively for all job-related communication. Do not provide your personal phone number, WhatsApp, or any other communication channel. In-app messages are documented and time-stamped, which protects you in any dispute. Messages outside the platform have no evidentiary value to Sweepr.', 1, 6),

('11111111-0001-0001-0001-000000000007', 'During and After the Job', 'During the job, communicate proactively if anything unexpected comes up: a locked room, damaged item discovered on arrival, a pet that is acting aggressively, or a job that is taking significantly longer than expected. Brief, factual messages sent in real time document your awareness and good faith.

After completing the job, mark it complete in the app and send a brief wrap-up message: confirmation that the job is done, any items you want to note (e.g., "I noticed the bathroom fan cover was dusty so I cleaned that too"), and a professional closing. This final message is a powerful tool for building customer loyalty.

Never solicit tips, ask for 5-star reviews, or share negative commentary about other cleaners in your messages. All communications are monitored and any solicitation or unprofessional conduct will result in a warning.', 2, 6),

('11111111-0001-0001-0001-000000000007', 'De-escalating Difficult Situations', 'Occasionally you will encounter a dissatisfied customer. Your first instinct may be defensive, but the most professionally effective response is to listen and acknowledge. "I understand you''re disappointed, and I want to make this right" is more powerful than any justification of your work.

If a customer contacts you about a quality issue during or immediately after a job, assess whether a quick fix is feasible. If you can return to address a missed area within a reasonable window and the customer agrees, do so — it converts a complaint into a loyalty moment. If you cannot return, apologize clearly and direct them to submit a re-clean request through the app.

Never argue with a customer in writing. Never call them wrong or challenge their perception of the clean. Even if you disagree with their assessment, the platform will always take a documented communication where you were professional and responsive seriously in any dispute review.', 3, 7),

('11111111-0001-0001-0001-000000000007', 'When to Escalate to Sweepr Support', 'Some situations must be escalated to Sweepr support rather than handled directly with the customer. Escalate when: a customer is verbally abusive or harassing, a customer requests work outside the scope of the booking, the home is in a condition that makes safe or sanitary cleaning impossible, a customer attempts to change payment terms or asks you to accept cash, or you discover something in the home that makes you feel unsafe.

To escalate, use the "Contact Support" button in the job detail screen. Support is available during business hours and has an emergency line for active-job situations. When escalating, document with notes and photos when possible.

Escalating a situation is not failing — it is the professional response to a situation that exceeds what a contractor should handle independently. Sweepr support has the authority and tools to resolve most escalations. Your job is to keep yourself and the customer safe and to document carefully.', 4, 7);

-- ── Module 8: Damage and Claims ──────────────────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000008', 'Prevention is the Best Policy', 'The most effective claims strategy is prevention. Before you begin cleaning any room, do a 60-second visual scan for pre-existing damage: chips, cracks, scuffs, broken items. Photograph anything that looks like it could be disputed later. These photos are your protection — a timestamp showing damage existed before you touched anything.

Move furniture carefully. Pick up items rather than sliding them when possible. If an item is too heavy to move safely alone, work around it or document why you could not clean beneath it. Never rush furniture moves — the extra 30 seconds to move something carefully is far cheaper than a damage claim.

When working with liquid products near electronics, cover them or work carefully around them. Spills on electronics are among the most expensive damage claims. Use spray bottles pointing away from electronics and damp-not-wet cloths near any device.', 1, 7),

('11111111-0001-0001-0001-000000000008', 'What to Do When Damage Happens', 'If you damage something, stop what you are doing and assess. Then: photograph the damage clearly from multiple angles. Note the time. Do not attempt to hide, repair, or minimize the damage. Contact the customer immediately through the in-app messaging system with a clear, factual message: "While cleaning [area], I accidentally [what happened]. I''ve photographed the damage and I want to make sure we get this resolved properly."

Then file a damage report through the app within one hour of the incident. Provide your photos, description, and estimated value if you know it. Sweepr''s claims team will review the report and contact both you and the customer.

Attempting to hide damage or deny it occurred when there is evidence will result in immediate removal from the platform, regardless of the damage amount. Reporting it promptly and honestly is always the better outcome — both ethically and practically.', 2, 8),

('11111111-0001-0001-0001-000000000008', 'Understanding Insurance Coverage', 'Your personal liability insurance is your primary coverage. Before a claim reaches Sweepr''s supplemental coverage, it must first go through your insurer. Keep your insurance current and your policy readily accessible. Your insurer''s claims process is independent of Sweepr''s.

Sweepr''s supplemental coverage applies to damage that occurs during a verified, active booking when your own policy is insufficient to cover the claim. Coverage does not apply to damage caused by gross negligence, intentional acts, or violations of platform policy.

Claims are reviewed by Sweepr''s trust and safety team. Resolution timelines depend on claim complexity. During review, maintain open communication and respond to any requests for information within 48 hours. Non-responsive cleaners during an active claim may have their account suspended pending resolution.', 3, 8),

('11111111-0001-0001-0001-000000000008', 'Pre-Existing Damage and Fraudulent Claims', 'Occasionally customers file damage claims for items that were damaged before your visit. Your pre-job photographic documentation is your primary defense. This is why the pre-clean scan is not optional — it is essential self-protection.

If you receive a damage claim for something you know was pre-existing, respond through the claims interface with your dated pre-job photos and a factual description. Do not accuse the customer of fraud — simply present your documentation and let the evidence speak. Sweepr''s team will review both accounts and the photo metadata.

If you believe a customer has filed a false or exaggerated claim, you can submit a complaint through the claims escalation process. Documented patterns of fraudulent claims by customers result in account review on the customer side. Both parties are protected by the documentation-first approach.', 4, 7);

-- ── Module 9: Reliability and Ratings ────────────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000009', 'How Your Scores Are Calculated', 'Sweepr tracks two primary performance metrics: your quality score (the average of customer ratings, weighted toward recent reviews) and your reliability score (based on on-time arrivals, cancellation rate, and job completion rate). Both scores influence your tier and your position in job offer queues.

Your quality score is a rolling 90-day average with recent reviews weighted 2x compared to reviews older than 30 days. A 3-star review from last week impacts your score more than a 3-star review from two months ago. Consistently high recent ratings can recover your score faster than waiting for old reviews to age out.

Your reliability score is calculated weekly. Each cancellation within 24 hours of a job reduces it by 3 points (out of 100). Each no-call/no-show reduces it by 10 points. Being more than 15 minutes late without prior notification reduces it by 2 points. Conversely, consistently early arrivals and zero cancellations slowly increase the base score.', 1, 7),

('11111111-0001-0001-0001-000000000009', 'Tier System and What It Means', 'Sweepr has three cleaner tiers: Standard, Preferred, and Elite. Your tier determines your priority in job offer queues (Elite cleaners see offers first), your displayed badge on customer-facing profiles, and certain earnings bonuses.

Standard tier requires maintaining a quality score above 4.0 and a reliability score above 70. Preferred tier requires quality above 4.5 and reliability above 85, with a minimum of 20 completed jobs in the past 90 days. Elite tier requires quality above 4.8, reliability above 95, and 40+ jobs in the past 90 days with no unresolved complaints.

Tier drops are automatic when you fall below thresholds for two consecutive weeks. Tier upgrades are reviewed monthly. If your tier drops, you will receive a notification with specific metrics to improve. The upgrade/downgrade cycle means your tier reflects your recent performance, not your historical reputation.', 2, 6),

('11111111-0001-0001-0001-000000000009', 'Recovering from a Bad Streak', 'Bad weeks happen — illness, family emergencies, equipment failures. The Sweepr platform has hardship provisions for documented extraordinary circumstances. If you experience a serious personal emergency that causes cancellations or no-shows, contact support within 24 hours and document the situation. Sweepr reviews hardship claims case-by-case and may remove or reduce the reliability score impact.

For quality score recovery, the most effective approach is consistency. Accept only the jobs you can do excellently — don''t overextend your schedule. Take time to do each job thoroughly. Request feedback from customers via the in-app satisfaction prompt. Improving your recent scores more than compensates for earlier bad reviews.

If you receive a low rating that you believe was unfair or inaccurate, you can submit a rating dispute within 7 days. Disputes are reviewed by the trust team. Invalid ratings (e.g., a 1-star review left by mistake with a comment like "wrong person") are sometimes removed. Gaming the dispute system by disputing legitimate reviews results in warnings.', 3, 7),

('11111111-0001-0001-0001-000000000009', 'Account Suspension and Reinstatement', 'Account suspension can be temporary (7-30 days) or permanent. Temporary suspension is typically triggered by reliability score dropping below 50, an unresolved damage claim, or repeated policy violations. During temporary suspension, your profile is hidden and you do not receive job offers.

Permanent removal results from: off-platform booking confirmed by evidence, gross negligence causing significant property damage or personal injury, conduct violations involving harassment or theft, falsifying documents, or creating fake accounts or reviews.

If your account is suspended, you will receive an email with the reason and, for temporary suspensions, a list of conditions for reinstatement. Reinstatement typically requires completing a refresher training module, resolving any outstanding claims, and agreeing to a monitoring period. Engage with the process constructively — the platform prefers to reinstate good cleaners over losing them.', 4, 7);

-- ── Module 10: Technical Troubleshooting ─────────────────────────────────────

INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('11111111-0001-0001-0001-000000000010', 'Common App Issues and Quick Fixes', 'The most common app issue is a connectivity problem. Before assuming the app is broken, check your cellular signal or ask for the WiFi password at the property. The app caches job details when offline, so you can reference entry instructions and checklists without a connection, but real-time status updates require connectivity.

If the app crashes or freezes on job status updates, close and reopen it. Your progress is saved server-side, so you will not lose completed checklist items from a crash. If the issue persists, try clearing the app cache in your phone settings.

For login issues, the most common cause is a session token expiration. Log out and log back in. If you have biometric login enabled and it is not working, disable it and use your password temporarily. If you are locked out of your account, use the "Forgot Password" flow — do not contact customers to explain the issue.', 1, 6),

('11111111-0001-0001-0001-000000000010', 'Navigation and Mapping Problems', 'The Sweepr app passes job addresses to your default maps application. If the navigation is directing you to the wrong location, check the full address in the job details — sometimes apartment or unit numbers cause routing issues. Call the customer through the in-app call feature if you are unable to locate the property.

In areas with poor GPS accuracy (downtown, underground parking), trust the address and your visual judgment over GPS coordinates. If you believe the address in the booking is incorrect, contact the customer through the app — do not guess.

If your device battery is dying mid-navigation, the job details including the address are cached and available offline in the app. Screenshot the address before leaving for jobs as a backup. Keep a car charger in your vehicle.', 2, 6),

('11111111-0001-0001-0001-000000000010', 'Payment and Earnings Discrepancies', 'If your payout amount seems incorrect, first review the job summary in the Earnings tab. It shows the base pay, any bonuses, and your portion of any tips. If a job is missing from your earnings, check whether it was fully marked complete in the app — jobs in "in progress" status are not paid out until marked complete.

Processing delays of 1-2 business days beyond the standard 7-day window are normal during high-volume periods. If a payout is more than 3 business days late beyond the expected window, contact support through the Help tab with the specific job IDs in question.

Tax discrepancies — particularly if your 1099-NEC does not match your own earnings records — should be addressed immediately via the support channel. Provide your own records and Sweepr will reconcile. Do not file your taxes with numbers you believe are incorrect without first resolving the discrepancy with support.', 3, 6),

('11111111-0001-0001-0001-000000000010', 'Contacting Support Effectively', 'Sweepr offers support through multiple channels: in-app chat (fastest, available 7am-9pm daily), email (support@sweepr.com, 24-48 hour response), and a phone line for active-job emergencies only. Use the channel appropriate to the urgency.

For the fastest resolution, provide complete information in your first message: the job ID, the exact issue, what you have already tried, and any relevant screenshots. Vague support requests like "my app isn''t working" without context result in back-and-forth that delays resolution.

For non-urgent account, payment, or rating questions, use the in-app chat during business hours. For urgent active-job situations — you cannot access the property, a customer is being hostile, you discovered damage — use the in-app emergency contact option, which escalates to a senior support agent immediately.', 4, 7);

-- ── Service Module Lessons ────────────────────────────────────────────────────

-- Module: Standard Cleaning
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000001', 'Standard Clean Scope and Expectations', 'A standard clean is a maintenance clean for a home that is regularly cleaned. It is not a deep clean — the expectation is thorough surface cleaning, not detailed scrubbing of built-up grime. Understanding this scope helps you manage time and customer expectations correctly.

Standard clean covers: all accessible surfaces dusted and wiped, kitchen counters and appliance exteriors cleaned, bathroom surfaces and fixtures cleaned and disinfected, floors vacuumed and mopped, trash emptied and bags replaced, and bedding changed if linens are provided. It does not include: inside appliances, inside cabinets, walls, or windows (unless specifically added).

Communicate scope clearly if a customer has unrealistic expectations. A helpful message: "I''ll be completing a standard maintenance clean today — if there''s anything specific you''d like prioritized, let me know before I start."', 1, 8),

('22222222-0002-0002-0002-000000000001', 'Efficient Sequencing for Repeat Cleans', 'The key to standard cleaning profitability is efficiency. Repeat customers'' homes are cleaner than new customers'' — build your sequence to take advantage of that. You should be able to complete a standard clean faster on your 5th visit to a home than your 1st.

Build a mental (or written) map of each customer''s home after your first visit. Note the quirks: the ceiling fan that always collects dust first, the shower door that needs extra attention, the wood floor that shows footprints easily. Customizing your sequence to each home over repeat visits makes you faster and your cleans higher quality.

Aim to complete each task in one pass — don''t come back to redo surfaces. If you are wiping kitchen counters, clear everything, wipe thoroughly, and replace. Doing each surface twice wastes time without adding quality.', 2, 8),

('22222222-0002-0002-0002-000000000001', 'Managing Time on Standard Cleans', 'Standard cleans are booked with time estimates based on home size. A 2-bedroom apartment is typically 2-2.5 hours; a 4-bedroom house is 3.5-4 hours. These estimates assume a maintained home. If the home is significantly dirtier than expected, document it with a note in the app at job start.

If you finish early without cutting corners — great. You have time to add a finishing touch (e.g., rolling the toilet paper end into a triangle, fanning the towels) that drives 5-star reviews. Never leave early to pad your hourly rate; if the job is done well, mark it complete.

If you are running over time, communicate with the customer at the halfway point, not at the end. Saying "I want to make sure everything is done right and I may need 20 extra minutes" lands much better than leaving early or surprising them with a time-adjustment request after the fact.', 3, 7);

-- Module: Deep Cleaning
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000002', 'What Makes a Deep Clean Different', 'A deep clean includes everything in a standard clean plus the areas that accumulate grime over months: inside the oven and microwave, inside and behind the refrigerator, inside kitchen cabinets and drawers (if accessible), grout lines in tile surfaces, baseboards, window tracks, blinds, light switch covers, door handles and frames, and inside shower doors.

Customers booking deep cleans typically have not had professional cleaning for a while, or are preparing for a major life event (moving, hosting a party, a post-construction cleanup). Their expectations are correspondingly high — they want the home to feel genuinely new.

Budget your time knowing that every task will take longer than in a maintained home. Budget approximately 50-75% more time than a standard clean for the same size home. If the home is extremely neglected, communicate before starting whether the time booked is sufficient.', 1, 8),

('22222222-0002-0002-0002-000000000002', 'Tackling Built-Up Grime and Appliances', 'The key to efficient deep cleaning is dwell time. Apply your cleaning product, let it sit for the manufacturer-recommended time (usually 5-10 minutes for heavy grease or soap scum), then wipe. Scrubbing immediately without dwell time wastes effort.

For oven cleaning, use an oven-safe cleaner and let it dwell for 15-20 minutes. Remove oven racks and soak them separately. Wipe with a damp cloth in sections. Rinse thoroughly to avoid burning odors when the oven next heats.

For refrigerator cleaning: remove all shelves and drawers, wash them in the sink, wipe the interior walls with a mild cleaner, dry thoroughly, and replace. Never use strong disinfectants inside the refrigerator — use food-safe cleaners. Pull the refrigerator out to clean behind and underneath — this area is frequently missed and extremely dirty in neglected homes.', 2, 9),

('22222222-0002-0002-0002-000000000002', 'Grout, Tile, and Hard-to-Reach Areas', 'Grout cleaning is one of the most satisfying and most time-consuming parts of a deep clean. Use a grout brush or an old toothbrush with a grout cleaner. Work in sections and rinse well to prevent cleaner residue from attracting more dirt. Never use bleach on colored grout — it will fade it. Oxygen-based cleaners (like OxiClean paste) are safe on most grout types.

Window tracks and door tracks collect debris that requires a small brush or toothbrush to dislodge. Vacuum the loose debris first, then apply cleaner and scrub. These areas are invisible but immediately noticed when dirty — customers run their fingers along tracks when inspecting your work.

Baseboards should be wiped with a damp microfiber cloth along the full length of each wall. For painted baseboards, use minimal moisture. For wood baseboards, use a wood-safe cleaner. Get low and check your work from an angle — dust left on baseboards shows up in raking light.', 3, 9);

-- Module: Move-In/Move-Out
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000003', 'Move-In/Move-Out Standards', 'Move-in/move-out cleans are performed on vacant properties. The home must be returned to a like-new condition (or as close as practically possible). This is typically the most demanding service type on the platform and is priced accordingly.

Every area must be cleaned — including inside all appliances, all cabinet interiors, all closets and storage areas, garage floors, and laundry areas. Walls should be spot-cleaned for scuffs. Window interiors should be cleaned. Light fixtures should be dusted and accessible bulbs wiped.

Documentation is especially important for move-in/out cleans because they occur at transition points where disputes between tenants and landlords are common. Photograph every room from the doorway before you start and after you finish. These photos are your professional record and may be requested by Sweepr, the customer, or even a landlord/tenant dispute process.', 1, 9),

('22222222-0002-0002-0002-000000000003', 'Checklist Management for Vacant Properties', 'Use the full move-in/out checklist in the app on every job. Do not deviate from the checklist order — it is sequenced to prevent re-dirtying completed areas. Check off each item as you complete it, not at the end.

If any area is inaccessible (locked storage room, appliances that cannot be moved safely) or if you discover a condition that is outside reasonable cleaning scope (mold, structural damage, hoarding-level debris), stop work on that area, photograph it, and send a message to the customer immediately. Do not attempt to address mold, structural damage, or hazardous waste — these are outside the scope of cleaning services.

Time estimates for move-out cleans are based on home size and condition. A standard apartment move-out may take 4-6 hours solo. A large house in poor condition may require all day. Communicate timing expectations with the customer before starting and confirm whether they need the job finished by a specific deadline.', 2, 9),

('22222222-0002-0002-0002-000000000003', 'Coordination with Landlords and Property Managers', 'For move-out cleans, you may be working with access provided by a property manager or landlord rather than the outgoing tenant. Follow the access instructions precisely. If the access method doesn''t work, contact the booking customer first — if unreachable, contact Sweepr support.

If the landlord or property manager is present during the clean, remain professional and focused on your work. Do not discuss the outgoing tenant''s security deposit, the condition of the property, or anything that could be construed as testimony in a landlord-tenant dispute. Your role is to clean — the dispute resolution is between the parties.

After completing a move-out clean, send a completion message through the app with a summary of what was completed and attach any photos of particularly challenging areas you addressed. This professional handoff reassures the customer and creates a document record if any questions arise later.', 3, 8);

-- Module: Pet Homes
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000004', 'Working Safely with Pets Present', 'Homes with pets present specific cleaning challenges. Before starting, ask the customer to confine pets to a room you will not be cleaning, or to a crate/outdoor area. This is not just for your safety — loose pets can knock over your supply bag, eat cleaning products, or escape through an open door.

Be aware of common pet hazards: cats that dart through open doors, dogs that may be territorial, birds that are sensitive to aerosol sprays (spray products near bird cages can be fatal — use non-spray alternatives). If a pet is behaving aggressively — growling, snapping, or not responding to commands — stop work and contact the customer immediately. Do not attempt to handle, restrain, or discipline a customer''s pet.

If you have pet allergies, disclose this to the customer before accepting the job. Cleaning a home with pets when you have severe allergies and not disclosing it creates safety risks for you and potential service disruptions for the customer.', 1, 7),

('22222222-0002-0002-0002-000000000004', 'Pet Hair, Dander, and Odor Removal', 'Pet hair embeds deeply in upholstery, carpets, and along baseboards. A standard vacuum will not remove all of it. Use a vacuum with a HEPA filter and pet-hair attachment. Run the vacuum in multiple directions over carpets to lift hair from different angles. Use a rubber squeegee tool on upholstery to gather embedded hair before vacuuming.

Pet dander settles on all surfaces, not just where the pet sits. Wipe all horizontal surfaces with a microfiber cloth before vacuuming to avoid redistributing dander. Change your microfiber cloths more frequently in pet homes — they fill up with dander quickly.

Pet odor removal is separate from odor masking. Enzyme-based cleaners break down organic odor compounds at the molecular level; air fresheners merely mask them. For areas with urine odor, use an enzyme cleaner and allow adequate dwell time. Never use strong bleach products on areas where the pet might walk — residual bleach is toxic to dogs and cats.', 2, 7),

('22222222-0002-0002-0002-000000000004', 'Specialized Equipment for Pet Homes', 'If you regularly service homes with pets, invest in specialized tools: a vacuum with a motorized pet-hair brush roll, a silicone pet-hair roller for hard furniture surfaces, an enzyme-based odor eliminator in your supply kit, and a high-filtration mask for heavy-dander homes.

Consider wearing a separate set of clothes for pet-home cleans if you have clients with pet allergies who you clean for on the same day. Pet dander transfers on clothing and can trigger allergic reactions in your next client''s home.

Document in your service notes (visible only to you, not the customer) which homes have pets and what type. This helps you prepare appropriately before each visit. Some pets are seasonal shedders — inform customers that shedding season may require additional vacuum passes and adjust accordingly.', 3, 7);

-- Module: Laundry
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000005', 'Laundry Add-On Standards', 'The laundry add-on covers washing, drying, folding, and putting away one or more loads of laundry as specified in the booking. Before starting, read the customer''s laundry preferences in the job notes. Many customers have specific instructions — delicate cycles, hang-dry items, or specific folding styles for certain items.

If no instructions are provided, use a default approach: cold water for darks, warm for lights, gentle cycle for any items that appear delicate. Never wash wool, silk, or dry-clean-only items in a standard machine — set them aside and note them in your completion message.

Start the laundry at the beginning of your visit so it completes while you clean the rest of the home. Do not leave laundry in the washer — transfer it to the dryer promptly to prevent mildew. If the dryer is in use when you arrive, message the customer for guidance.', 1, 6),

('22222222-0002-0002-0002-000000000005', 'Folding and Putting Away', 'Folding and put-away is the difference between a functional laundry service and one that earns 5 stars. Take time to fold items neatly — shirts folded uniformly, pants with creases aligned, towels folded in thirds. Customers notice.

Follow the customer''s organization system when putting items away. Look at how the shelves and drawers are already organized, and match it. If you cannot determine where something goes, set it in a visible, neat pile and note it in your completion message.

Bedding should be changed if clean linens are provided and the bed has been stripped. Make the bed neatly with hospital corners or as neatly as the bedding allows. Replace throw pillows in their original arrangement. A well-made bed after laundry service dramatically improves the perceived quality of the entire visit.', 2, 6);

-- Module: Dishes
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000006', 'Dishes Add-On Standards', 'The dishes add-on covers washing, drying, and putting away dishes left in the sink or on the counter. It does not include emptying and reloading the dishwasher unless specifically noted in the booking. Clarify scope with the customer if it is unclear.

Wash dishes in hot water with dish soap. Use a clean dish brush or new sponge — never use the customer''s existing sponge unless it is clearly new, as old sponges harbor bacteria and cross-contaminate surfaces. Rinse thoroughly to remove all soap residue.

For dishes that appear to require hand-washing only (crystal, cast iron, hand-painted ceramics), wash them by hand and dry them carefully. Never put crystal or delicate ceramics in the dishwasher without explicit customer permission.', 1, 5),

('22222222-0002-0002-0002-000000000006', 'Breakage Prevention and Put-Away', 'Dishes and glassware are high-risk for breakage during the put-away phase. Carry only 2-3 pieces at a time. Hold glasses by the body, not the rim. Place items down gently — don''t stack them heavily.

Follow the customer''s cabinet organization. Look at how items are arranged before starting and match it. Most households have a system — pots and pans together, glasses by type, plates by size. If you cannot tell where something goes, set it on the counter with a note in your completion message.

If you break something while doing the dishes add-on, the same damage reporting procedure applies. Photograph it, message the customer through the app, and file a report. Breakage during dishes service is common — handle it professionally and it will not significantly impact your rating.', 2, 5);

-- Module: Interior Windows
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000007', 'Streak-Free Window Technique', 'Streak-free windows require the right tools and technique. Use a squeegee for large windows and a microfiber cloth for smaller ones — never paper towels, which leave lint and smear rather than clean. Glass cleaner should be sprayed onto the cloth, not directly onto the glass, to prevent overspray on frames, sills, or nearby surfaces.

The squeegee technique: spray the glass, work from top to bottom in overlapping passes, wipe the squeegee blade after each pass with a clean cloth. Finish by wiping the edges with a dry microfiber cloth. For corners and the bottom edge, use a detailing cloth.

Natural light reveals every streak — check your work from an angle in natural light before moving on. Cloudy days make streak checking difficult; err on the side of an extra pass.', 1, 6),

('22222222-0002-0002-0002-000000000007', 'Safety for High or Hard-to-Reach Windows', 'For windows above standing height, use a step stool or a window-cleaning extension wand. Never stand on furniture, counters, or improvised platforms. If a window cannot be safely reached with proper equipment, document that in your completion notes and offer to return with the right equipment rather than taking a safety risk.

Use a stable, non-slip step stool rated for your weight plus the force you will apply during cleaning. Position it on a flat, stable surface. Never overreach — move the stool rather than stretching.

For large picture windows or floor-to-ceiling glass, work in sections from top to bottom. Start with the upper section using a squeegee with an extension handle, then address the lower section at standing height. Check the entire window from several angles before moving on.', 2, 7);

-- Module: Organization
INSERT INTO training_lessons (module_id, title, body, sort_order, estimated_minutes) VALUES
('22222222-0002-0002-0002-000000000008', 'Organization Add-On Scope and Limits', 'The organization add-on covers visible, accessible areas that the customer has specifically identified for organization. It does not mean rearranging the entire home — it means helping implement an organization system in designated areas such as a pantry, closet, or junk drawer.

Before starting, review the customer''s notes carefully. If specific areas are not listed, message the customer to clarify. Do not organize areas that are not explicitly requested — moving items in a bedroom closet when the customer only wanted the pantry organized creates confusion and potential conflict.

Your role in organization is to assist, not to decide. The customer''s preferred organization system is the right system. If asked for suggestions, offer options — but implement what the customer chooses. Never discard items, even if they appear to be trash, without explicit customer permission.', 1, 6),

('22222222-0002-0002-0002-000000000008', 'Organizing Without Overstepping', 'The boundary between helpful organization and overstepping is clear: you handle objects, not decisions. Grouping similar items together, creating visible categories, using containers to separate small items, and making the space more visually logical are all within scope. Deciding what the customer should keep, moving items to different rooms, and handling personal documents or valuables are not.

Leave all items in the same room where you found them unless the customer explicitly directs otherwise. If you find items in a disorganized area that clearly belong elsewhere (e.g., tools in a kitchen drawer), note it to the customer rather than moving them yourself.

For pantry organization specifically: wipe shelves before placing items back, group by category (canned goods, baking supplies, snacks), face labels forward, and place taller items toward the back. These small touches visually transform a pantry and earn strong appreciation without requiring any decision-making on your part.', 2, 7);

-- =============================================================================
-- QUIZ QUESTIONS
-- =============================================================================

-- ── Module 1 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000001', 'What is your employment relationship with Sweepr?', '["You are a part-time employee of Sweepr", "You are an independent contractor using the Sweepr marketplace", "You are a full-time employee with benefits", "You are a franchise owner"]', 'You are an independent contractor using the Sweepr marketplace', 'Sweepr is a marketplace platform. All cleaners operate as independent contractors, not employees. This means you are responsible for your own taxes, insurance, and tools.', 1),

('11111111-0001-0001-0001-000000000001', 'Who is responsible for your income taxes as a Sweepr cleaner?', '["Sweepr withholds and pays your taxes automatically", "You are responsible for your own income and self-employment taxes", "Taxes are included in the platform fee", "You only pay taxes if you earn more than $50,000"]', 'You are responsible for your own income and self-employment taxes', 'As an independent contractor, you pay your own income taxes and self-employment tax (15.3%). Sweepr provides a 1099-NEC at year end but does not withhold taxes.', 2),

('11111111-0001-0001-0001-000000000001', 'What primarily determines your rating on the Sweepr platform?', '["How many years of experience you have", "Customer ratings after each completed job", "Your tier status", "How many jobs you accept per week"]', 'Customer ratings after each completed job', 'Customer ratings after each job aggregate into your quality score. Consistent high ratings build your reputation and tier, while low ratings can impact your standing.', 3),

('11111111-0001-0001-0001-000000000001', 'What insurance coverage must you maintain to work on Sweepr?', '["No insurance is required — Sweepr covers everything", "Your own general liability insurance with minimum $1M coverage", "A home warranty is sufficient", "Health insurance only"]', 'Your own general liability insurance with minimum $1M coverage', 'You must maintain a general liability policy with at least $1M per occurrence. The Sweepr platform insurance is supplemental, not primary — it does not replace your own policy.', 4),

('11111111-0001-0001-0001-000000000001', 'How does Sweepr help you get business as a cleaner?', '["Sweepr assigns you jobs on a fixed schedule", "Sweepr connects you with customers and handles booking, payment, and customer routing", "Sweepr pays you a guaranteed minimum hourly rate", "Sweepr provides your cleaning supplies"]', 'Sweepr connects you with customers and handles booking, payment, and customer routing', 'Sweepr acts as a business development partner — handling customer acquisition, booking logistics, payment processing, and dispute resolution. You provide the cleaning expertise.', 5);

-- ── Module 2 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000002', 'How long do you typically have to accept or decline a job offer?', '["1 hour", "24 hours", "15 minutes", "Until the scheduled start time"]', '15 minutes', 'Job offers have a 15-minute acceptance window. After that, the offer expires and goes to the next cleaner. Review job details quickly and decide.', 1),

('11111111-0001-0001-0001-000000000002', 'Where should you reference entry codes and access instructions for a job?', '["Write them down in your personal notebook", "The job detail screen in the Sweepr app", "The confirmation email from Sweepr", "Ask the customer to text them to you"]', 'The job detail screen in the Sweepr app', 'All entry instructions are encrypted in the Sweepr app. Access them in the job detail screen. Never store access codes in personal notes or outside the platform.', 2),

('11111111-0001-0001-0001-000000000002', 'When is a payout for a completed job initiated?', '["When you accept the job", "When you mark the job complete in the app", "At the end of each month", "When the customer leaves a review"]', 'When you mark the job complete in the app', 'Payouts are triggered when you mark a job complete. Jobs left in "in progress" status are not processed for payment. Always mark jobs complete promptly after finishing.', 3),

('11111111-0001-0001-0001-000000000002', 'What should you do if you will be late to a job?', '["Show up without notification and apologize in person", "Notify the customer through the in-app messaging system before your arrival window closes", "Cancel the job", "Call Sweepr support first"]', 'Notify the customer through the in-app messaging system before your arrival window closes', 'Proactive communication about delays is a professional standard. Message the customer through the app — this creates a documented record and prevents a late arrival being counted as a no-show.', 4),

('11111111-0001-0001-0001-000000000002', 'What happens to your reliability score if you cancel a job less than 24 hours before it starts?', '["Nothing, one cancellation does not matter", "Your score decreases by 3 points", "Your account is suspended", "You lose your tier status immediately"]', 'Your score decreases by 3 points', 'Cancellations within 24 hours reduce your reliability score by 3 points each. No-call/no-shows are more severe at 10 points each. Maintaining high reliability is key to staying in good standing.', 5);

-- ── Module 3 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000003', 'What should you do if a customer provides a physical key for access?', '["Make a copy in case you lose it", "Store it safely and return it as instructed; never copy it or share it", "Leave it under the doormat for next time", "Give it to Sweepr to hold on your behalf"]', 'Store it safely and return it as instructed; never copy it or share it', 'Physical keys must never be copied or shared. Handle them as if they are the only key to someone''s home. If a key is lost, contact Sweepr support and the customer immediately.', 1),

('11111111-0001-0001-0001-000000000003', 'You arrive at a home and notice the front door is already open. What should you do?', '["Walk in and start cleaning normally", "Contact the customer before entering and document your arrival time and the door state", "Call the police immediately", "Leave and mark the job as incomplete"]', 'Contact the customer before entering and document your arrival time and the door state', 'An open door could indicate a security issue. Contact the customer first. If there are signs of a break-in or you feel unsafe, do not enter and call emergency services if necessary.', 2),

('11111111-0001-0001-0001-000000000003', 'A customer has a pet snake in a terrarium in the bedroom. You are allergic to animals. What should you do?', '["Clean around the terrarium and say nothing", "This should have been disclosed when accepting the job; contact the customer and Sweepr support for guidance", "Refuse to complete the job without warning", "Move the terrarium to another room"]', 'This should have been disclosed when accepting the job; contact the customer and Sweepr support for guidance', 'Known allergies that affect your ability to safely complete a job should be disclosed at booking acceptance. If discovered on-site, contact the customer and support for guidance before proceeding.', 3),

('11111111-0001-0001-0001-000000000003', 'Which of the following is allowed inside a customer''s home?', '["Taking photos of the home''s decor to post on social media", "Listening to music through one earbud while working", "Eating food from the customer''s refrigerator if you are hungry", "Inviting a friend to help you clean without notifying the customer"]', 'Listening to music through one earbud while working', 'Listening to music through one earbud is permitted (the other must be free to maintain situational awareness). Eating the customer''s food, unauthorized photography, and unregistered guests are all prohibited.', 4),

('11111111-0001-0001-0001-000000000003', 'When is it appropriate to photograph a customer''s home?', '["Whenever you see something interesting", "Only to document damage or an incident, shared exclusively through the Sweepr platform", "Before every clean to show your process on social media", "After every clean for your portfolio"]', 'Only to document damage or an incident, shared exclusively through the Sweepr platform', 'Photography inside a customer''s home is only permitted to document damage or incidents, and those photos must be shared through the Sweepr platform claims system, not social media or personal channels.', 5);

-- ── Module 4 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000004', 'What is the most common reason cleaners are permanently removed from the Sweepr platform?', '["Getting too many 4-star reviews", "Off-platform bookings — accepting cash or directing customers to book outside Sweepr", "Having a reliability score below 80", "Using the customer''s WiFi"]', 'Off-platform bookings — accepting cash or directing customers to book outside Sweepr', 'Off-platform booking (soliciting customers to pay outside the platform) violates the ICA and is the most enforced rule on the platform. It harms both the platform and customer trust.', 1),

('11111111-0001-0001-0001-000000000004', 'What must you do if your liability insurance policy lapses?', '["Nothing — Sweepr''s platform insurance covers you", "Upload a new certificate of insurance immediately; you will be suspended from new job offers until it is on file", "Inform customers verbally that you have no coverage", "Cancel your Sweepr account"]', 'Upload a new certificate of insurance immediately; you will be suspended from new job offers until it is on file', 'Active insurance is a platform requirement. A lapsed policy results in suspension from new job offers. Upload your new certificate immediately to restore your active status.', 2),

('11111111-0001-0001-0001-000000000004', 'A customer asks for your personal phone number so they can call you directly next time. What do you say?', '["Give it to them — building direct relationships with customers is good business", "Politely decline and explain that all communication must go through the Sweepr platform", "Give a fake number", "Report the customer immediately to support"]', 'Politely decline and explain that all communication must go through the Sweepr platform', 'Giving customers your personal contact info for the purpose of direct booking is prohibited. Politely explain the platform requirement — most customers understand.', 3),

('11111111-0001-0001-0001-000000000004', 'Under the independent contractor model, who controls how you perform your cleaning work?', '["Sweepr dictates every step of how you clean", "You control your own methods; Sweepr sets quality standards and scope, not process", "The customer can give you step-by-step instructions you must follow exactly", "Your insurance company"]', 'You control your own methods; Sweepr sets quality standards and scope, not process', 'Independent contractor status means you determine how to achieve the quality outcome. Sweepr sets what the outcome must be (quality standards, scope), not exactly how you achieve it.', 4),

('11111111-0001-0001-0001-000000000004', 'What should you do if a customer asks you to delete their personal information from your records?', '["Delete your contacts and notes yourself", "Direct them to Sweepr''s privacy team and do not attempt to fulfill the request yourself", "Tell them you do not have any records", "Send them your records via email"]', 'Direct them to Sweepr''s privacy team and do not attempt to fulfill the request yourself', 'Data deletion requests under CCPA/GDPR must be handled by Sweepr''s privacy team, not by individual contractors. Direct the customer to the appropriate channel.', 5),

('11111111-0001-0001-0001-000000000004', 'When does the Sweepr supplemental insurance coverage apply?', '["For any damage that occurs during any cleaning job", "For verified incidents during booked jobs after your own insurance has paid out", "When you do not have your own insurance", "For damage you cause intentionally"]', 'For verified incidents during booked jobs after your own insurance has paid out', 'Platform supplemental coverage is secondary. It only applies after your own policy has been exhausted for verified incidents during active bookings. It does not cover gross negligence or intentional acts.', 6);

-- ── Module 5 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000005', 'Which chemical combination produces toxic chloramine gas?', '["Bleach and dish soap", "Bleach and ammonia-based cleaners", "Vinegar and baking soda", "Hydrogen peroxide and water"]', 'Bleach and ammonia-based cleaners', 'Mixing bleach with ammonia produces chloramine gas, which is toxic. This is one of the most dangerous chemical mixing errors in cleaning. Never mix bleach with any ammonia-containing product.', 1),

('11111111-0001-0001-0001-000000000005', 'What is the minimum PPE required for standard cleaning work?', '["No PPE is required for standard cleaning", "Nitrile or latex gloves and eye protection when using spray products", "Full hazmat suit", "Only a face mask"]', 'Nitrile or latex gloves and eye protection when using spray products', 'The minimum standard is nitrile or latex gloves (not vinyl) and eye protection when using sprays or working overhead. Additional PPE is required for stronger chemicals.', 2),

('11111111-0001-0001-0001-000000000005', 'Why should you not use bleach on colored grout?', '["It does not clean grout", "Bleach will fade colored grout; use oxygen-based cleaners instead", "Bleach is too expensive for grout", "Grout does not need cleaning"]', 'Bleach will fade colored grout; use oxygen-based cleaners instead', 'Bleach strips color from grout and can permanently damage the appearance. Oxygen-based cleaners (like OxiClean) are safe and effective on most grout types.', 3),

('11111111-0001-0001-0001-000000000005', 'How should you lift heavy furniture when cleaning?', '["Bend at the waist and use your back muscles", "Lift with your legs, keep the load close to your body, avoid twisting", "Ask the customer to help you lift", "Never move any furniture"]', 'Lift with your legs, keep the load close to your body, avoid twisting', 'Proper lifting technique — legs bent, back straight, load close to body, no twisting — prevents the back and knee injuries that are the most common occupational hazards in cleaning.', 4),

('11111111-0001-0001-0001-000000000005', 'What should you do first if a fire breaks out while you are cleaning?', '["Try to put it out with water", "Evacuate safely and call emergency services; leave your equipment", "Call Sweepr support before calling 911", "Finish your current task then evacuate"]', 'Evacuate safely and call emergency services; leave your equipment', 'Life safety is the absolute priority. Evacuate immediately, call 911, and notify Sweepr support after the emergency is handled. Do not attempt to fight a fire. Your equipment is replaceable — you are not.', 5),

('11111111-0001-0001-0001-000000000005', 'What does "dwell time" mean when using cleaning products?', '["The amount of time you spend in each room", "The time you allow a cleaning product to sit before wiping, which improves effectiveness", "How long you wait between cleaning visits", "The expiration date on cleaning products"]', 'The time you allow a cleaning product to sit before wiping, which improves effectiveness', 'Dwell time allows the chemical agents in cleaning products to break down grease, bacteria, or grime before you wipe. Skipping dwell time means you are wiping, not cleaning.', 6);

-- ── Module 6 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000006', 'What is the recommended room-by-room cleaning sequence?', '["Entryway first, bedrooms last", "Bedrooms, bathrooms, kitchen, living areas, entryways", "Kitchen first, then bathrooms, then everything else", "Clean in whatever order is fastest"]', 'Bedrooms, bathrooms, kitchen, living areas, entryways', 'The standard sequence is bedrooms (time-intensive), bathrooms (sanitation priority), kitchen (appliance work), living areas, then entryways. This prevents re-dirtying completed areas.', 1),

('11111111-0001-0001-0001-000000000006', 'What is the correct direction to work within a room?', '["Bottom to top, then right to left", "Top to bottom, left to right, away from the door", "Start with the biggest surfaces first", "Whichever direction feels comfortable"]', 'Top to bottom, left to right, away from the door', 'Work top-to-bottom (dust falls down), left-to-right (systematic coverage), and away from the door toward the exit so you are not walking on freshly cleaned floors.', 2),

('11111111-0001-0001-0001-000000000006', 'Which tool should you use for streak-free cleaning of mirrors and glass?', '["Paper towels with glass cleaner", "A dedicated microfiber cloth with glass cleaner applied to the cloth, not the glass", "Any old rag with soap and water", "Newspaper"]', 'A dedicated microfiber cloth with glass cleaner applied to the cloth, not the glass', 'Paper towels leave lint on glass surfaces. Apply glass cleaner to the cloth, not the surface, to prevent overspray. Use a dedicated microfiber cloth — not one used for other surfaces.', 3),

('11111111-0001-0001-0001-000000000006', 'A customer has a marble countertop. Which cleaner should you use?', '["Any-purpose cleaner with bleach", "pH-neutral stone cleaner only", "Vinegar-based cleaner", "Abrasive scrubbing powder"]', 'pH-neutral stone cleaner only', 'Natural stone including marble is acid-sensitive. Acidic cleaners (vinegar, citrus-based, many all-purpose cleaners) will etch the surface permanently. Only use pH-neutral stone cleaners.', 4),

('11111111-0001-0001-0001-000000000006', 'When should you use the in-app cleaning checklist?', '["Only at the end of the job to confirm everything was done", "As you go through the clean, checking off items when complete", "Once a week in a batch", "Only for deep cleans, not standard cleans"]', 'As you go through the clean, checking off items when complete', 'Checking off items as you complete them forces systematic coverage and ensures you do not miss areas. Completing the checklist after the fact from memory is unreliable and provides no real-time documentation.', 5),

('11111111-0001-0001-0001-000000000006', 'What is the most effective way to prevent quality failures?', '["Clean as fast as possible", "Use the in-app checklist in real time and do a final walkthrough from a customer perspective", "Ask customers to point out areas to focus on", "Only clean what the customer specifically requests"]', 'Use the in-app checklist in real time and do a final walkthrough from a customer perspective', 'Systematic checklist use combined with a customer-perspective final walkthrough catches missed areas before the customer does. Looking at the home as if you are the customer is a powerful quality-control tool.', 6);

-- ── Module 7 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000007', 'Why should all job-related communication go through the Sweepr in-app messaging system?', '["It is required by Sweepr policy and creates a documented, time-stamped record", "It is faster than texting", "So Sweepr can read your messages", "It is optional — use whatever is fastest"]', 'It is required by Sweepr policy and creates a documented, time-stamped record', 'In-app messages are documented, timestamped, and available for dispute resolution. Messages outside the platform have no evidentiary value to Sweepr. This protects both you and the customer.', 1),

('11111111-0001-0001-0001-000000000007', 'When is the best time to communicate if you expect a job will take longer than scheduled?', '["At the very end of the job when you are not done yet", "At the halfway point, proactively", "After you finish, in the completion message", "Never mention it — just finish as fast as you can"]', 'At the halfway point, proactively', 'Communicating a potential overtime at the halfway point gives the customer maximum notice and turns the situation into a demonstration of your thoroughness. Surprising them at the end creates frustration.', 2),

('11111111-0001-0001-0001-000000000007', 'A customer contacts you saying they are unhappy with the clean. What is the most effective first response?', '["Explain why you did everything correctly", "Listen, acknowledge their concern, and offer to make it right through a re-clean or report", "Offer a direct refund", "Ignore the message and hope they do not escalate"]', 'Listen, acknowledge their concern, and offer to make it right through a re-clean or report', 'De-escalation starts with acknowledgment. "I understand you''re disappointed and I want to make this right" is far more effective than justification. Offer a solution and follow through.', 3),

('11111111-0001-0001-0001-000000000007', 'Which of the following is allowed in your in-app messages to customers?', '["Asking customers to leave you a 5-star review", "Providing a brief, professional completion summary of the work done", "Sharing negative comments about other cleaners", "Offering to do future work at a discounted rate outside the platform"]', 'Providing a brief, professional completion summary of the work done', 'A professional completion summary builds goodwill and is excellent practice. Soliciting reviews, disparaging other cleaners, and off-platform solicitation are all prohibited and monitored.', 4),

('11111111-0001-0001-0001-000000000007', 'When should you escalate a situation to Sweepr support rather than handling it with the customer?', '["When the customer gives you a 4-star review", "When a customer is verbally abusive, attempts to change payment terms, or requests out-of-scope work", "Whenever you disagree with a customer", "Never — always resolve issues directly with the customer"]', 'When a customer is verbally abusive, attempts to change payment terms, or requests out-of-scope work', 'Certain situations exceed what a contractor should handle independently. Abuse, payment manipulation, unsafe conditions, and out-of-scope requests should be escalated to Sweepr support immediately.', 5);

-- ── Module 8 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000008', 'What is the most important preventive measure against damage claims?', '["Work slowly and carefully", "Photograph pre-existing damage before you start cleaning each room", "Use only the customer''s cleaning products", "Avoid moving any furniture"]', 'Photograph pre-existing damage before you start cleaning each room', 'A timestamped pre-clean photograph of pre-existing damage is your primary protection against false claims. Without it, you have no documentation that damage existed before your visit.', 1),

('11111111-0001-0001-0001-000000000008', 'You accidentally break a ceramic vase while cleaning. What do you do first?', '["Clean up the pieces and hope the customer doesn''t notice", "Photograph the damage, message the customer through the app, and file a damage report within one hour", "Try to glue it back together", "Mention it verbally at the end of the job"]', 'Photograph the damage, message the customer through the app, and file a damage report within one hour', 'Immediate, honest reporting of damage is both the ethical requirement and the practical best outcome. Hiding damage results in immediate removal from the platform when discovered.', 2),

('11111111-0001-0001-0001-000000000008', 'What should you do if you receive a damage claim for something you can prove was pre-existing?', '["Accept responsibility to keep the customer happy", "Respond through the claims interface with your dated pre-job photographs and a factual description", "Argue with the customer that they are lying", "Ignore the claim"]', 'Respond through the claims interface with your dated pre-job photographs and a factual description', 'Your pre-job documentation is your defense. Present it factually through the claims interface without accusatory language. Let the evidence speak and the trust team adjudicate.', 3),

('11111111-0001-0001-0001-000000000008', 'How many pieces of glassware should you carry at one time during put-away?', '["As many as you can manage efficiently", "2-3 pieces at a time, held by the body not the rim", "At least 10 to save time", "Stack them all and carry in one trip"]', '2-3 pieces at a time, held by the body not the rim', 'Breakage risk increases dramatically with overloaded carries. 2-3 pieces at a time, held properly, is the professional standard. The extra trips are worth it compared to the cost of a broken item.', 4),

('11111111-0001-0001-0001-000000000008', 'How long do you have to respond to an open damage claim before your account may be suspended?', '["7 days", "1 month", "48 hours", "You never need to respond — Sweepr handles it"]', '48 hours', 'During an open damage claim, you must respond to any requests for information within 48 hours. Non-responsive cleaners during an active claim may have their accounts suspended pending resolution.', 5);

-- ── Module 9 Quiz ─────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000009', 'How are recent reviews weighted compared to older reviews in your quality score?', '["All reviews are weighted equally", "Reviews from the past 30 days are weighted 2x compared to reviews older than 30 days", "Older reviews count more because they represent a longer track record", "Only your last 5 reviews matter"]', 'Reviews from the past 30 days are weighted 2x compared to reviews older than 30 days', 'Recent performance is weighted more heavily. This means consistent recent quality can recover your score faster than waiting for old bad reviews to expire.', 1),

('11111111-0001-0001-0001-000000000009', 'What are the requirements for Preferred tier status?', '["Quality above 4.0 and reliability above 70", "Quality above 4.5, reliability above 85, and 20+ completed jobs in the past 90 days", "Quality above 4.8 and 40+ jobs per month", "Just completing the training program"]', 'Quality above 4.5, reliability above 85, and 20+ completed jobs in the past 90 days', 'Preferred tier requires quality 4.5+, reliability 85+, and 20 completed jobs in the last 90 days. Elite requires 4.8+ quality, 95+ reliability, and 40+ jobs with no unresolved complaints.', 2),

('11111111-0001-0001-0001-000000000009', 'How much does a no-call/no-show reduce your reliability score?', '["1 point", "3 points", "10 points", "Your account is immediately suspended"]', '10 points', 'A no-call/no-show removes 10 points from your reliability score — far more than a 24-hour cancellation (3 points). Always contact the customer and Sweepr if you cannot make it to a job.', 3),

('11111111-0001-0001-0001-000000000009', 'A family emergency causes you to no-show on a job. What should you do?', '["Nothing — personal emergencies are excused automatically", "Contact Sweepr support within 24 hours, document the situation, and request a hardship review", "Create a fake cancellation reason in the app", "Delete your account and start over"]', 'Contact Sweepr support within 24 hours, document the situation, and request a hardship review', 'Sweepr has hardship provisions for documented extraordinary circumstances. Contact support within 24 hours with documentation. The reliability impact may be reduced or removed after case review.', 4),

('11111111-0001-0001-0001-000000000009', 'When can you dispute a customer rating?', '["Anytime you disagree with a rating", "Within 7 days of receiving a rating you believe is unfair or inaccurate", "Never — all ratings are final", "Only if you are an Elite tier cleaner"]', 'Within 7 days of receiving a rating you believe is unfair or inaccurate', 'You have 7 days to dispute a rating. The trust team reviews disputes for valid ratings (wrong-person errors, etc.). Gaming the system by disputing legitimate reviews results in warnings.', 5);

-- ── Module 10 Quiz ────────────────────────────────────────────────────────────

INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('11111111-0001-0001-0001-000000000010', 'The Sweepr app crashes mid-job and loses your progress. What most likely happened?', '["All your progress is lost permanently", "The app crashed but your progress is saved server-side; it will reload when you reopen the app", "You need to restart the entire job", "Contact the customer to rebook"]', 'The app crashed but your progress is saved server-side; it will reload when you reopen the app', 'Job progress is saved server-side in real time. A crash simply means the local client disconnected. Reopening the app reconnects to your saved session.', 1),

('11111111-0001-0001-0001-000000000010', 'A payout is 3 business days late beyond the expected 7-day window. What should you do?', '["Wait another week before worrying", "Contact Sweepr support through the Help tab with the specific job IDs", "Contact the customer directly for payment", "File a chargeback with your bank"]', 'Contact Sweepr support through the Help tab with the specific job IDs', 'Normal delays of 1-2 days beyond the window are common. At 3+ days late, contact support with specific job IDs. Never contact customers about payment — all payment issues go through support.', 2),

('11111111-0001-0001-0001-000000000010', 'What is the fastest way to get support for an active-job emergency?', '["Email support@sweepr.com", "Post on social media", "Use the in-app emergency contact option, which escalates to a senior agent immediately", "Call the customer to conference in support"]', 'Use the in-app emergency contact option, which escalates to a senior agent immediately', 'The in-app emergency contact is the fastest path for active-job situations. It bypasses the queue and goes directly to a senior support agent.', 3),

('11111111-0001-0001-0001-000000000010', 'How should you write a support request for the fastest resolution?', '["Describe the problem vaguely and let support figure it out", "Include the job ID, the exact issue, what you have already tried, and any relevant screenshots", "Just say your app is not working", "Submit multiple tickets for the same issue"]', 'Include the job ID, the exact issue, what you have already tried, and any relevant screenshots', 'Complete information in your first message eliminates back-and-forth delays. Job ID, exact issue, troubleshooting steps already tried, and screenshots give support everything needed to resolve the issue immediately.', 4),

('11111111-0001-0001-0001-000000000010', 'Your phone battery is dying and you have not saved the customer''s address. What is your best option?', '["Turn back and cancel the job", "Access the job details in the Sweepr app (cached offline) or from a screenshot taken before departing", "Call a friend to look it up", "Ring nearby doorbells to find the right house"]', 'Access the job details in the Sweepr app (cached offline) or from a screenshot taken before departing', 'The Sweepr app caches job details including addresses for offline access. The training recommendation is also to screenshot the address before leaving as a backup. Preparation prevents this situation.', 5);

-- ── Service Module Quizzes ────────────────────────────────────────────────────

-- Standard Cleaning quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000001', 'What does a standard clean include that a deep clean does not guarantee?', '["Consistent, thorough surface maintenance cleaning on every visit", "Cleaning inside appliances on every visit", "Complete cabinet interior cleaning", "Wall and ceiling cleaning"]', 'Consistent, thorough surface maintenance cleaning on every visit', 'Standard cleans are maintenance cleans — thorough surface cleaning done consistently. Deep cleaning adds appliance interiors, grout, and other intensive areas. Know the scope.', 1),
('22222222-0002-0002-0002-000000000001', 'If you finish a standard clean well ahead of schedule, what should you do?', '["Leave early and mark the job complete", "Use the extra time to add finishing touches that drive 5-star reviews", "Start a different job", "Bill for extra time anyway"]', 'Use the extra time to add finishing touches that drive 5-star reviews', 'Finishing early is an opportunity to add details (toilet paper triangle, fanned towels, extra shine on chrome) that consistently earn 5-star reviews. Never leave early to pad your hourly rate.', 2),
('22222222-0002-0002-0002-000000000001', 'When should you communicate that a job may run over the estimated time?', '["At the very end when you''re clearly not finished", "At the halfway point, proactively", "After the job is complete", "Never — just finish as fast as possible"]', 'At the halfway point, proactively', 'Proactive communication at the halfway point gives customers maximum notice and turns a potential complaint into a demonstration of your thoroughness.', 3);

-- Deep Cleaning quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000002', 'How much additional time should you budget for a deep clean compared to a standard clean of the same home?', '["The same amount", "50-75% more time", "Twice as long always", "It depends only on the number of bathrooms"]', '50-75% more time', 'Deep cleans require 50-75% more time than standard cleans for the same size home. Heavily neglected homes may need even more. Communicate scope concerns before starting if needed.', 1),
('22222222-0002-0002-0002-000000000002', 'What should you do with refrigerator shelves and drawers when doing a deep clean?', '["Wipe them in place", "Remove them, wash in the sink, dry thoroughly, then replace", "Leave them and just clean around them", "Clean them with oven cleaner"]', 'Remove them, wash in the sink, dry thoroughly, then replace', 'Removing shelves and drawers allows complete cleaning of the refrigerator interior. Wash in the sink with dish soap, dry thoroughly to prevent moisture buildup, and replace neatly.', 2),
('22222222-0002-0002-0002-000000000002', 'What type of cleaner is safe for colored grout?', '["Chlorine bleach", "Oxygen-based cleaner like OxiClean", "Any all-purpose cleaner", "Acid-based tile cleaner"]', 'Oxygen-based cleaner like OxiClean', 'Bleach strips color from grout permanently. Acid-based cleaners can damage grout. Oxygen-based cleaners are safe and effective on most grout types.', 3);

-- Move-In/Out quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000003', 'Why is documentation especially important for move-in/move-out cleans?', '["To show off your work", "These jobs occur at transition points where landlord-tenant disputes are common, and your documentation may be requested as evidence", "Documentation is required by law for move-out cleans", "To help the next cleaner know what was done"]', 'These jobs occur at transition points where landlord-tenant disputes are common, and your documentation may be requested as evidence', 'Move-out cleans happen when security deposits are at stake. Thorough before/after photography protects you and can be invaluable if requested in a landlord-tenant dispute.', 1),
('22222222-0002-0002-0002-000000000003', 'You discover suspected mold in a bathroom during a move-out clean. What should you do?', '["Clean it with bleach and continue the job", "Stop work on that area, photograph it, and message the customer immediately", "Ignore it and clean around it", "Vacate the property and call the health department"]', 'Stop work on that area, photograph it, and message the customer immediately', 'Mold remediation is outside the scope of cleaning services. Stop work on the affected area, document it, and notify the customer. Do not attempt to clean mold — it requires professional remediation.', 2),
('22222222-0002-0002-0002-000000000003', 'If a landlord is present during a move-out clean and asks about the outgoing tenant''s security deposit, you should:', '["Share your honest opinion about the condition of the home", "Remain focused on your cleaning work and avoid discussing the dispute", "Tell them everything you noticed in the home", "Ask the landlord to leave so you can work"]', 'Remain focused on your cleaning work and avoid discussing the dispute', 'Your role is to clean, not to testify in a landlord-tenant dispute. Any statements you make could be misrepresented. Stay professional and focused on your work.', 3);

-- Pet Homes quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000004', 'Which type of product effectively eliminates pet odors rather than just masking them?', '["Air freshener spray", "Scented candles", "Enzyme-based cleaner", "Baking soda only"]', 'Enzyme-based cleaner', 'Enzyme-based cleaners break down organic odor compounds at the molecular level. Air fresheners and candles only mask odors temporarily without addressing the source.', 1),
('22222222-0002-0002-0002-000000000004', 'Why should you avoid using strong bleach products in areas where pets walk?', '["It damages flooring", "Residual bleach is toxic to dogs and cats", "Bleach does not clean pet areas effectively", "It is too expensive to use on pet areas"]', 'Residual bleach is toxic to dogs and cats', 'Dogs and cats lick their paws after walking on treated surfaces. Even residual bleach can cause serious harm. Use pet-safe cleaning products in all pet-accessible areas.', 2),
('22222222-0002-0002-0002-000000000004', 'What should you do if a dog is growling and snapping at you during a cleaning job?', '["Try to calm the dog with treats", "Stop work, contact the customer immediately, and wait for guidance", "Continue cleaning in a different room", "Leave the property immediately without notification"]', 'Stop work, contact the customer immediately, and wait for guidance', 'An aggressive pet is a safety hazard. Stop work, do not try to handle the animal, and contact the customer for guidance. Do not leave without notification.', 3);

-- Laundry quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000005', 'When should you start the laundry during a cleaning visit?', '["After all the cleaning is done", "At the beginning, so it runs while you clean the rest of the home", "When the customer asks you to", "Laundry order does not matter"]', 'At the beginning, so it runs while you clean the rest of the home', 'Starting laundry at the beginning maximizes efficiency. The wash and dry cycles run while you complete other cleaning tasks, and you finish put-away toward the end of the visit.', 1),
('22222222-0002-0002-0002-000000000005', 'You find what appears to be a silk blouse in the laundry pile. What should you do?', '["Wash it on gentle cycle with cold water", "Set it aside and note it in your completion message — it may require special handling or dry cleaning", "Wash it on normal with warm water", "Throw it in the dryer on high heat"]', 'Set it aside and note it in your completion message — it may require special handling or dry cleaning', 'Silk, wool, and delicate items should not be washed without clear customer guidance. Set them aside and communicate. Damaged delicate items are expensive and difficult to resolve.', 2),
('22222222-0002-0002-0002-000000000005', 'The customer has not left laundry instructions. What default temperature should you use for dark clothing?', '["Hot — for better cleaning", "Warm — standard default", "Cold — to prevent color bleeding and shrinkage", "Any temperature is fine for darks"]', 'Cold — to prevent color bleeding and shrinkage', 'Cold water is the safe default for dark clothing — it prevents color bleeding and protects against shrinkage. When in doubt, the cooler the water, the safer the wash.', 3);

-- Dishes quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000006', 'The customer has crystal wine glasses in the dish pile. What should you do?', '["Put them in the dishwasher on gentle cycle", "Handwash carefully and dry immediately with a clean cloth", "Set them aside and skip — crystal is too risky to clean", "Use a sponge with heavy scrubbing to remove any residue"]', 'Handwash carefully and dry immediately with a clean cloth', 'Crystal should always be hand-washed. The dishwasher''s heat and detergent can cloud or crack crystal over time. Handwash gently, dry immediately with a clean lint-free cloth.', 1),
('22222222-0002-0002-0002-000000000006', 'You break a plate during the dishes add-on. What is the correct procedure?', '["Throw away the pieces and hope the customer doesn''t notice", "Photograph the damage, message the customer through the app, and file a damage report", "Try to buy a replacement plate yourself", "Tell the customer verbally at the end of the visit"]', 'Photograph the damage, message the customer through the app, and file a damage report', 'Damage reporting during add-on services follows the same procedure as all damage reports. Document immediately, notify via in-app message, and file a report.', 2),
('22222222-0002-0002-0002-000000000006', 'When putting dishes away, you cannot tell where a specific pot belongs. What should you do?', '["Put it in the most logical cabinet", "Set it on the counter and note its location in your completion message", "Put it in a drawer", "Leave it in the drying rack"]', 'Set it on the counter and note its location in your completion message', 'When you cannot determine where an item goes, leave it visible and communicate. Putting items in the wrong location is more disruptive than leaving them on the counter with a note.', 3);

-- Interior Windows quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000007', 'How should glass cleaner be applied for streak-free results?', '["Spray directly onto the glass", "Apply to the microfiber cloth, then clean the glass", "Spray onto the squeegee blade", "Apply to paper towels for absorption"]', 'Apply to the microfiber cloth, then clean the glass', 'Spraying cleaner onto the cloth, not the glass, prevents overspray on frames, sills, or electronics nearby. It also gives you better control over product distribution.', 1),
('22222222-0002-0002-0002-000000000007', 'A large floor-to-ceiling window requires cleaning but you did not bring an extension squeegee. What should you do?', '["Climb on the windowsill to reach the top", "Document the inaccessible areas in your completion notes and offer to return with proper equipment", "Skip the window entirely without noting it", "Stand on a chair from the customer''s dining room"]', 'Document the inaccessible areas in your completion notes and offer to return with proper equipment', 'Safety first — never improvise unstable platforms. The professional response is to document what could not be safely reached and offer a return visit with appropriate equipment.', 2),
('22222222-0002-0002-0002-000000000007', 'How do you check for streaks on windows?', '["Wipe the window one more time as a precaution", "View the window from an angle in natural light", "Run your finger along the glass to feel for residue", "Check from directly in front under overhead lighting"]', 'View the window from an angle in natural light', 'Viewing from an angle in natural light reveals streaks that direct-on viewing misses. The raking angle of light makes fine streaks visible. Cloudy days make this harder.', 3);

-- Organization quiz
INSERT INTO training_quiz_questions (module_id, question, choices, correct_answer, explanation, sort_order) VALUES
('22222222-0002-0002-0002-000000000008', 'The customer booked an organization add-on for the pantry. You notice their bedroom closet is also very disorganized. What should you do?', '["Organize the bedroom closet as a bonus service", "Stick to the pantry as booked; note the closet in a message if you want to offer it for a future booking", "Ask the customer if they want you to do the closet too and add it to the bill", "Clean the closet instead of the pantry"]', 'Stick to the pantry as booked; note the closet in a message if you want to offer it for a future booking', 'Only organize areas explicitly in the booking. Organizing unrequested areas can move items the customer cannot find later. Note opportunities for future bookings instead.', 1),
('22222222-0002-0002-0002-000000000008', 'While organizing a pantry, you find what appears to be trash. What should you do?', '["Throw it away — that''s why the customer booked organization", "Leave it in place; only discard items with explicit customer permission", "Put it in a bag and leave it by the front door", "Text the customer a photo and ask for permission"]', 'Leave it in place; only discard items with explicit customer permission', 'Never discard items without explicit permission. What looks like trash might be important to the customer. Your role is to organize, not to decide what to throw away.', 2),
('22222222-0002-0002-0002-000000000008', 'What is your role when a customer asks for organization suggestions?', '["Implement your own professional organization system without asking", "Offer options and implement what the customer chooses — the customer''s system is the right system", "Decline to give suggestions", "Follow a standard organization method regardless of customer preference"]', 'Offer options and implement what the customer chooses — the customer''s system is the right system', 'Your role is to assist the customer''s vision, not impose your own. Offer professional suggestions, present options, and then implement what the customer decides.', 3);
