# DocFlow production operations and privacy requirements

## Deployment baseline

- Use Node.js 22 LTS and run `npm ci`, `npm run doctor`, `npm run qa`, and the client lint/build checks before each release. CI performs these checks automatically.
- Copy `server/.env.example` to a secret-managed environment. Production startup fails when database, client URL, CORS, or sufficiently strong signing secrets are missing.
- Build the supplied `server/Dockerfile` and `client/Dockerfile`, or use `docker compose up --build` for a single-host deployment. Terminate TLS at a managed load balancer or reverse proxy; never expose MongoDB publicly.
- Set `CORS_ORIGINS` to the exact HTTPS frontend origin(s), `TRUST_PROXY=true` only behind a trusted single proxy, and `VITE_API_URL` to the public API URL at client build time.
- Do not run sample-user seeding in production. `SEED_SAMPLE_USERS` must be false; initial admin credentials must be supplied through a secret manager and rotated immediately.

## Health, monitoring, and alerting

- Liveness: `GET /api/health/live`. Readiness: `GET /api/health/ready`; it returns 503 until MongoDB and application initialization are ready.
- Prometheus-format metrics are at `GET /api/metrics` and require `Authorization: Bearer <METRICS_TOKEN>`. Keep this endpoint private to the monitoring network.
- Application request logs are structured JSON and include `X-Request-Id`, response status, and duration without logging request bodies or tokens. Forward stdout/stderr to centralized, access-controlled storage.
- Alert on readiness failure for 2 minutes, HTTP 5xx rate, authentication 429 spikes, reminder delivery errors, Stripe webhook failures, disk utilization, database connection saturation, and backup age over 26 hours.
- External uptime monitoring must check both the frontend `/healthz` and backend readiness endpoint from outside the hosting network.

## Incident response

- Assign an on-call owner and escalation contact before launch. Record detection time, affected users, containment, recovery, and follow-up actions for every incident.
- For suspected credential exposure: revoke the credential, rotate related secrets, revoke user sessions, inspect audit/application/provider logs, and notify the privacy owner.
- For an outage: stop unsafe writes when data integrity is uncertain, preserve logs, declare the last known healthy backup, restore only after checksum verification, and document achieved RPO/RTO.
- Maintain separate severity definitions and notification timelines required by the deployment jurisdiction. Never include patient data in chat, ticket titles, pager messages, or general-purpose logs.

## Privacy, consent, and retention

- Registration records explicit acceptance of privacy notice version `2026-08-05` and its timestamp.
- Users can export their profile and appointment data from the account API.
- Account deletion removes access and redacts contact/profile fields. Appointment and consultation records remain linked to an anonymized user because healthcare records must not be silently destroyed.
- Audit and clinical records should be retained for the period required by the deployment jurisdiction. The default operational target is seven years; legal counsel must approve the actual period before launch.
- Production staff must access only the minimum data needed for their role. Admin audit access is recorded and exports must be stored securely.

## Backup and disaster recovery

- Run `npm run backup` from `server` at least daily. It creates a compressed MongoDB archive plus a SHA-256 manifest under `server/backups` without printing credentials.
- Run `npm run backup:verify -- <archive>` after upload/download and before every restore. Restores reject missing or invalid checksums unless a legacy override is explicitly authorized.
- Run `npm run backup:cleanup` after successful off-site replication. `BACKUP_RETENTION_DAYS` defaults to 35; never treat this local cleanup as the monthly archive policy.
- Copy archives to encrypted off-site object storage with restricted service-account access. Local archives alone are not a disaster-recovery system.
- Retain daily backups for 35 days and monthly backups for 12 months, subject to local healthcare law.
- Test a restore in a non-production environment every quarter. Restore requires an archive inside `server/backups` and `CONFIRM_RESTORE=YES npm run restore -- <archive>`.
- Recommended objectives: RPO 24 hours and RTO 4 hours. Record each restore test, result, duration, and owner.
- Never restore a production archive into a developer machine or an environment without equivalent access controls.

## Operational ownership

- Clinic administrators own schedules, closure messages, no-show corrections, and queue recovery.
- Security administrators review audit exports, active sessions, failed-login alerts, and MFA adoption weekly.
- SMTP delivery failures and reminder worker errors must be connected to production monitoring before launch.
- Reminder jobs use a database claim to avoid duplicate delivery across multiple application replicas. Keep clocks synchronized and investigate claims older than ten minutes.

## Release and rollback

- Use immutable image tags and retain the previous known-good server/client images. Apply additive database changes before code that requires them.
- Deploy to staging first, run smoke checks for login, booking, OTP provider handoff, payment webhook, reminders, readiness, and metrics, then promote the same images.
- Roll back application images when smoke checks fail. Database rollback requires an approved restore because it is destructive; never automatically run `mongorestore --drop` during application deployment.
- After release, monitor errors, latency, queue processing, payment webhooks, and messaging delivery for at least 30 minutes.

## Payments and SMS configuration

- Stripe Checkout requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLIENT_URL`, and `PAYMENT_CURRENCY`. Configure the webhook URL as `/api/payments/webhook` and subscribe to `checkout.session.completed` and `checkout.session.expired`.
- Never mark a payment paid from a browser redirect. DocFlow updates payment state only from a verified Stripe webhook.
- Twilio reminders require `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.
- Patient phone numbers used for SMS must be stored in E.164 international format. Obtain required messaging consent and sender registration for every deployment country.
