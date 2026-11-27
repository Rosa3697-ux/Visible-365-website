# Customer workspace release check

Development target is the feature/waas-client-experience branch, Netlify deploy preview 1 and the Visible365-sandbox Supabase project. The public home page responds but the production /waas/ path returned 404 during this check.

The preview application collects business name and industry, uses the selected interface language, and opens the intake directly. A legacy order row supplies the database default scope. Starting a project does not activate a subscription. The staff queue requires an allowlisted user ID plus a Supabase-verified MFA session. It lists the latest 100 applications. Project scheduling and staff replies are outstanding. Customer requests are scoped to the verified user.

## Checks on November 27, 2026

- Node 24: `node --test tests/*.mjs` passed six tests, including customer read filters, forged target ID handling, support request ownership and the staff queue MFA gate.
- Chromium and Python Playwright: `python tests/portal_browser.py` with CHROMIUM_PATH set to the installed browser passed English and Spanish onboarding through submission, session rotation, reload and logout at 375 px. Auth and API responses were fixtures. Optional fields were skipped. No email was sent.
- Supabase SQL: `tests/onboarding-storage.sql` passed against Visible365-sandbox. Both fictional account registrations created linked account, order and project rows. The transaction rolled back. Anonymous and ordinary authenticated direct table access and signup RPC execution were denied.
- Deployed version 4 of waas-auth-sandbox. A live POST from the preview origin without credentials returned 401. The production domain origin received 403 under the existing preview-only policy.

## Production release remains pending

Validate a real Resend-delivered OTP through the release candidate, an enrolled MFA administrator and two independent signed-in customer sessions. Configure the production origin, auth redirect URLs and approved production database target together. Verify Netlify's published directory and exact commit. Retest both languages on the custom domain. Do not promote the existing test-account banner, preview-only service or legacy Stripe sandbox handler into the customer launch.
