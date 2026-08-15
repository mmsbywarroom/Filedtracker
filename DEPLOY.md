# GitHub → EC2 auto deploy

Target:

- GitHub: `https://github.com/mmsbywarroom/Filedtracker.git`
- EC2 Mumbai: `13.200.220.168` (`rural-connect-hub`, `t3.micro`)
- Database: PostgreSQL **on the same EC2** (Docker). Do not use the RDS instances in `us-east-1` (`neondb` / `sakhi-db`) — they are in Virginia and will be slow from Mumbai.

If you already run another app on this instance (`rural-connect-hub`), stop/conflict-check port 80 and 3000 first.

## 1. EC2 security group (Mumbai)

Inbound:

| Type | Port | Source |
| --- | --- | --- |
| SSH | 22 | your IP |
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 (optional later) |

Do **not** open Postgres 5432 to the internet.

## 2. One-time server setup

SSH:

```bash
ssh -i your-key.pem ubuntu@13.200.220.168
# or: ssh -i your-key.pem ec2-user@13.200.220.168
```

Then:

```bash
sudo mkdir -p /opt/filedtracker
sudo chown $USER:$USER /opt/filedtracker
git clone https://github.com/mmsbywarroom/Filedtracker.git /opt/filedtracker
cd /opt/filedtracker
sudo bash deploy/ec2-setup.sh
nano /opt/filedtracker/.env
```

Set strong `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`, and Fast2SMS keys.

First start:

```bash
cd /opt/filedtracker
docker compose up -d --build
```

App: `http://13.200.220.168`

Admin: `http://13.200.220.168/admin/login`

## 3. GitHub Secrets (auto deploy)

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `EC2_HOST` | `13.200.220.168` |
| `EC2_USER` | `ubuntu` or `ec2-user` |
| `EC2_SSH_KEY` | full private key (`.pem` contents), including `BEGIN/END` lines |

Every push to `main` copies code and runs `docker compose up -d --build`.

## 4. Optional: AWS RDS instead of local Postgres

Create RDS **PostgreSQL in ap-south-1** (same region as EC2). Security group: allow 5432 only from the EC2 security group.

Then in `/opt/filedtracker/.env`:

```
DATABASE_URL=postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/fieldtrack
```

And remove the `db` service from compose, or keep app-only:

```bash
docker compose up -d --build app
```
