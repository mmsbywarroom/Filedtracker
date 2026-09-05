# GitHub → EC2 auto deploy

Target:

- GitHub: `https://github.com/mmsbywarroom/Filedtracker.git`
- EC2 Mumbai (`ap-south-1`, `t3.medium`, Elastic IP `13.234.95.134`) — host stored in GitHub secret `EC2_HOST`
- Domain: `https://filed.videh.co.in`
- Database: PostgreSQL **on the same EC2** (Docker). Do not use RDS in `us-east-1` — too slow from Mumbai.

If you already run another app on this instance, stop/conflict-check port 80, 443, and 3000 first.

## 1. EC2 security group (Mumbai)

Inbound:

| Type | Port | Source |
| --- | --- | --- |
| SSH | 22 | your IP only |
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 |

**Never** open PostgreSQL port 5432 to the internet.

## Disk / logs (important on t3.medium)

`deploy/disk-cleanup.sh` runs:

- every **6 hours** via cron
- after every deploy

It truncates large Docker/nginx/app logs, vacuums journald, and prunes unused Docker images. Compose also caps container logs at **10MB × 3** files.

If the site sticks on Loading / auto-refreshes, SSH and run:

```bash
sudo /opt/filedtracker/disk-cleanup.sh
df -h /
sudo docker compose -f /opt/filedtracker/docker-compose.prod.yml restart
```

## 2. One-time server setup

SSH (use the host from your `EC2_HOST` secret):

```bash
ssh -i your-key.pem ubuntu@<EC2_HOST>
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

Set strong values for:

- `POSTGRES_PASSWORD`
- `JWT_SECRET` (32+ random characters)
- `ADMIN_PASSWORD`
- `CRON_SECRET` (32+ random characters — **required in production**)
- `FAST2SMS_*` keys
- `GOOGLE_MAPS_API_KEY`

### HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d filed.videh.co.in
sudo nginx -t && sudo systemctl reload nginx
```

### Google Maps API key (rotate if ever exposed)

1. Google Cloud Console → APIs & Services → Credentials
2. **Disable** the old key
3. Create a new key with:
   - **Application restrictions:** HTTP referrers → `https://filed.videh.co.in/*`
   - **API restrictions:** Maps JavaScript API, Roads API only
4. Update `GOOGLE_MAPS_API_KEY` in `/opt/filedtracker/.env` and redeploy

First start:

```bash
cd /opt/filedtracker
docker compose up -d --build
```

App: `https://filed.videh.co.in`

Admin: `https://filed.videh.co.in/admin/login`

## 3. GitHub Secrets (auto deploy)

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `EC2_HOST` | EC2 public hostname or IP (not committed to git) |
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

## 5. Post-deploy security checks

```bash
# Maps key must NOT be public
curl -s https://filed.videh.co.in/api/maps/config
# Expected: {"error":"Unauthorized"}

# Cron must require secret
curl -s -H "x-filedtracker-cron: 1" https://filed.videh.co.in/api/cron/auto-punch-out
# Expected: {"error":"Unauthorized"}
```
