# DocFlow Complete

A MERN healthcare appointment and live queue system with four roles:

- Patient: public registration, profile, doctor list, booking, appointments, live queue, AI placeholder
- Admin: the only role that creates doctor and receptionist accounts
- Doctor: sees own appointments, adds notes/prescription, completes the current consultation
- Receptionist: approves appointments, assigns queue numbers, completes or skips the current patient

## Important safety

This folder is a separate completed copy. It does not overwrite your old project. Keep your old `docflow.zip` as a backup.

## First setup

### 1. Backend environment

Copy:

```text
server/.env.example
```

to:

```text
server/.env
```

Edit `MONGODB_URI` and `JWT_SECRET`. Configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` so registration OTP messages can
be delivered. For Gmail, you may instead set `EMAIL_USER` and `EMAIL_PASS`
with an app password.

For extra safety, use a separate MongoDB database name such as:

```text
docflow_complete
```

This keeps your previous database data unchanged.

### 2. Install packages

Open terminal 1:

```bash
cd server
npm install
npm run seed
npm run dev
```

Open terminal 2:

```bash
cd client
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Default seeded credentials

Admin:

```text
Email: admin@docflow.com
Password: Admin123
```

Sample doctors:

```text
sarah@docflow.com
fahim@docflow.com
nusrat@docflow.com
Password for all: Doctor123
```

Change these passwords through the admin workflow before real use.

## Role flow

1. Patients verify their email with a two-minute OTP, then complete their profile and password.
2. Admin logs in and creates doctor or receptionist credentials.
3. Admin gives those credentials to the staff member.
4. All roles use the same login page.
5. Login redirects each role to the correct dashboard.

## Daily startup

Backend terminal:

```bash
cd server
npm run dev
```

Frontend terminal:

```bash
cd client
npm run dev
```

Keep both terminals open while demonstrating the project.

## Production and operational checks

Use `npm run doctor` in `server` to validate required configuration and MongoDB backup tooling. Runtime health endpoints are `/api/health/live` and `/api/health/ready`; protected Prometheus metrics are exposed at `/api/metrics`. Docker and CI definitions are included. See `PRODUCTION_REQUIREMENTS.md` for deployment, monitoring, backup, incident-response, and rollback procedures.

## AI note

The current AI recommendation is a rule-based placeholder. Ollama integration is intentionally left for the final AI stage.
