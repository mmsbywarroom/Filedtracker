# Attendance

Mobile + desktop field attendance: OTP login, CSV users, face-locked punch in/out, and Google Maps–style travel footprints.

## Setup

Local Postgres:

```bash
docker compose up -d db
```

Then:

```bash
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Production (EC2 + GitHub auto deploy): see `DEPLOY.md`.

Open http://localhost:3000

### Admin

- URL: `/admin/login`
- Email: `admin@fieldtrack.local`
- Password: `Admin@12345` (change in `.env`)

### User

Users must exist first (CSV or manual). Login on `/` with mobile + 4-digit OTP (Fast2SMS).

CSV columns:

`Sector Incharge Name, Sector Incharge Number, Assembly Name, Sector Allotted, Zone, District`

## Security

- Fast2SMS key stays on the server (`.env`)
- OTP hashed, 5-minute expiry, attempt limits, IP rate limits
- HttpOnly session cookies
- Face match on server against stored descriptor
- Punch in/out requires GPS

Camera + location need HTTPS in production (localhost is fine for testing).
