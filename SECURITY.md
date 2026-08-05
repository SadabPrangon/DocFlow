# Security policy

## Reporting

Report suspected security issues privately to the deployment security owner. Do not open public issues containing credentials, patient information, tokens, screenshots, or exploit details. The owner must acknowledge critical reports within one business day and start containment immediately.

## Dependency management

- Production dependencies are audited during release review. Critical advisories block deployment.
- As of 2026-08-05, npm flags `GHSA-qwww-vcr4-c8h2` in the latest published `react-router` 7.18.2. The advisory affects React Router server/RSC action handling. DocFlow is a client-only Vite SPA and does not use framework mode, RSC, route actions, loaders, server rendering, or React Router request handlers, so the affected server execution path is absent.
- The router is pinned exactly to prevent silent changes. Recheck the advisory weekly and upgrade immediately when npm publishes a patched release. This acceptance must be revisited if server rendering, framework mode, loaders, or actions are introduced.
- Server production dependencies currently audit with zero known vulnerabilities.

## Secret handling

- Store production secrets in a managed secret store, not `.env` files committed to source control.
- Rotate any secret shared in chat, logs, screenshots, tickets, or source history. Revoke active sessions after signing-secret exposure.
- Use separate values for JWT signing, OTP hashing, metrics access, SMTP, Stripe, Twilio, database access, and initial administrator credentials.
