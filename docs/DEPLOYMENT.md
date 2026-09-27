# Deployment runbook

How to go from an empty OCI Always Free account to `https://<domain>/cnn/predict`, and
how to ship updates afterwards. Architecture context: [ARCHITECTURE.md](ARCHITECTURE.md).

```
laptop: train -> export -> push_model.py ──────────────► OCI Object Storage (models/<name>/v{n}/)
                                                              │ pulled at container start
GitHub: push to main -> test -> build arm64 image -> OCIR     ▼
                                   └─ deploy.sh (ssh) ─► VM: nginx :443 ─► /cnn/ → cnn container :8001
                                                                        └► /rnn/ → rnn container :8002
```

Models and code ship independently: a new model needs no image rebuild, and a new
image doesn't change which model version is served.

---

## 1. One-time OCI setup (console)

| What | Where | Notes |
|---|---|---|
| **Bucket** | Storage → Buckets → Create | Name `ml-models`, Standard tier, **private** (the default). |
| **Namespace** | Profile menu → Tenancy → *Object storage namespace* | Used in the S3 endpoint and the OCIR image path. |
| **S3 keys** | Profile → My profile → *Customer secret keys* → Generate | Gives the access key + secret for `OCI_S3_*`. The secret is shown **once**. |
| **Auth token** | Profile → My profile → *Auth tokens* → Generate | The password for `docker login` to OCIR, both in CI and on the VM. |
| **VM** | Compute → Instances → Create | Image **Oracle Linux 8/9** (the default; user `opc`) or **Canonical Ubuntu 24.04** (user `ubuntu`); `setup.sh` handles both. The commands below use `ubuntu@`, so substitute `opc@` on Oracle Linux. Preferred shape: **VM.Standard.A1.Flex** (arm64), e.g. 2 OCPU / 12 GB. If you get "out of capacity", retry later or try another availability domain. **VM.Standard.E2.1.Micro** (amd64, 1 OCPU / 1 GB) also works for **one** model: set `COMPOSE_PROFILES=cnn`. `setup.sh` adds 2 GB of swap on small-RAM machines. Assign a public IPv4 and save the SSH key pair. |
| **Ingress** | VCN → the subnet's Security List → Add ingress rules | TCP 80 and 443 from `0.0.0.0/0`. Restrict TCP 22 to your IP. |
| **DNS** *(optional)* | Your DNS provider | An A record pointing at the VM's IP. No domain? `<ip-with-dashes>.sslip.io` works with Let's Encrypt. |

Least privilege (recommended): the VM only needs to **read** models. You can create a
separate IAM user in a group with
`Allow group ml-readers to read objects in compartment <c> where target.bucket.name='ml-models'`
and put *that* user's customer secret key on the VM. Your own key then stays on your laptop for pushing.

## 2. Push a model

On your laptop, with the repo-root `.env` filled from [.env.example](../.env.example):

```bash
pip install -r scripts/requirements.txt
python -m training.export --model cnn          # -> models/cnn/v{n}/
python scripts/push_model.py --model cnn --dry-run
python scripts/push_model.py --model cnn       # -> models/cnn/v{n}/ in the bucket + latest.json
```

**The model must be exported with the current `export.py`**, because the server reads
its preprocessing and labels from `metrics.json`. A model exported before this change
won't load, and the container will say so in its logs.

## 3. Provision the VM (once)

```bash
scp -r scripts/vm serving/.env.example ubuntu@<vm-ip>:~/
ssh ubuntu@<vm-ip>
sudo DOMAIN=api.example.com EMAIL=you@example.com bash ~/vm/setup.sh
exit                                            # log back in so the docker group applies
ssh ubuntu@<vm-ip>
cp ~/.env.example /opt/ml-app/.env && chmod 600 /opt/ml-app/.env && nano /opt/ml-app/.env
docker login <region>.ocir.io -u '<namespace>/<username>'    # password: the auth token
```

`setup.sh` installs Docker and the Compose plugin, nginx and certbot. On Oracle Linux
it pulls certbot from EPEL and removes the preinstalled podman/buildah/runc, which
conflict with Docker. It opens 80/443 on the host, separately from the Security List:
iptables on Ubuntu, firewalld on Oracle Linux. On Oracle Linux it also allows nginx
to proxy through SELinux. It also installs the `ml-app` systemd unit and the nginx site, and gets a
TLS certificate if `DOMAIN` and `EMAIL` are set. It is safe to re-run.

In `/opt/ml-app/.env`, set `IMAGE`, the `OCI_*` values and `COMPOSE_PROFILES`. **Only list
models that already have a pushed version**, e.g. `COMPOSE_PROFILES=cnn`. A service with
no model to load will crash-loop, and the deploy will fail its health check.

## 4. GitHub Actions

Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `OCIR_REGION` | e.g. `us-ashburn-1` (the image goes to `<region>.ocir.io`) |
| `OCIR_NAMESPACE` | the tenancy namespace |
| `OCIR_USERNAME` | your OCI username (for identity-domain users, often `oracleidentitycloudservice/<email>`) |
| `OCIR_AUTH_TOKEN` | the auth token |
| `VM_HOST` | the VM's public IP or DNS name |
| `VM_USER` | `ubuntu` |
| `VM_SSH_KEY` | private key that can SSH into the VM; a dedicated deploy key is best |
| `VM_KNOWN_HOSTS` | *(recommended)* output of `ssh-keyscan <vm-ip>`; without it the host key is trusted on first use |

| Variable | Value |
|---|---|
| `DEPLOY_ENABLED` | `true`. Until you set it, CI only lints and runs the tests. |
| `OCIR_REPO` | *(optional)* image repo name, default `ml-serving` |

Also create an environment named `production` (Settings → Environments). Add a
required reviewer there if you want to approve deploys manually.

On every push to `main`, CI tests, builds a multi-arch (`linux/amd64` + `linux/arm64`) image, pushes
`:<sha12>` and `:latest` to OCIR, then runs [scripts/deploy.sh](../scripts/deploy.sh). That
script copies `docker-compose.yml`, sets `IMAGE_TAG` in the VM's `.env`, pulls and restarts,
then waits for the Docker healthchecks. **If the new containers aren't healthy within 5
minutes, it restores the previous `IMAGE_TAG`** and fails the job.

The first push to OCIR creates the repo as private in the root compartment. That's fine,
because the VM runs `docker login`.

To deploy by hand from your laptop (Git Bash/WSL):
`VM_HOST=<ip> VM_USER=ubuntu IMAGE_TAG=<tag> SSH_KEY_FILE=~/.ssh/<key> bash scripts/deploy.sh`

## 5. Verify

```bash
curl https://<domain>/cnn/health          # {"status":"ok","model_name":"cnn","model_version":1}
curl https://<domain>/cnn/version         # model version, git commit, test metrics, image tag
curl -X POST https://<domain>/cnn/predict -H 'Content-Type: application/json' \
  -d "{\"image_base64\": \"$(base64 -w0 cat.png)\"}"
curl -X POST https://<domain>/rnn/predict -H 'Content-Type: application/json' \
  -d '{"text": "Stocks rallied after the central bank held rates."}'
```

Interactive docs: `https://<domain>/cnn/docs`.

## 6. Standing update procedure

**New model** (no image rebuild):

```bash
python -m training.train  --model cnn
python -m training.export --model cnn
python scripts/push_model.py --model cnn           # prints the new version, e.g. v4
```

Then on the VM:

- **Pinned version** (recommended): set `CNN_MODEL_VERSION=4` in `/opt/ml-app/.env`, then
  run `docker compose up -d`. Compose recreates only the container whose env changed.
- **`latest`**: run `docker compose restart cnn`. The container re-reads `latest.json` at startup.

Check with `curl .../cnn/version`.

**New code**: merge to `main`. CI builds and deploys it.

## 7. Rollback

| What | How |
|---|---|
| Model | Set `CNN_MODEL_VERSION=<older n>` in `/opt/ml-app/.env`, run `docker compose up -d`. Versions are never overwritten, and a version already cached on the VM needs no download. |
| Code | Set `IMAGE_TAG=<older sha12>` in `/opt/ml-app/.env`, run `docker compose up -d`. Or re-run an older CI deploy job. |

A deploy restarts the single container, so expect a few seconds of 502s. Always Free has
no zero-downtime rollout.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Container restarting | `docker compose logs --tail=100 cnn`. Startup errors name the cause: missing env var, no `latest.json` (nothing pushed yet), sha256 mismatch, or missing preprocessing block (re-export). |
| `exec format error` | The image doesn't match the VM's CPU (`uname -m`). CI builds amd64 and arm64 unless the `IMAGE_PLATFORMS` variable narrows it. A laptop build must use `docker buildx build --platform linux/<arch>`. |
| Container killed / `OOMKilled` (Micro) | Run only one model (`COMPOSE_PROFILES=cnn`), and check `free -h` shows the swapfile. |
| 502 from nginx | That service isn't running (`docker compose ps`), or it isn't in `COMPOSE_PROFILES`. |
| Site unreachable | Is the Security List open for 80/443? Check `sudo iptables -L INPUT -n --line-numbers`: the ACCEPT rules must sit above the REJECT. |
| `docker compose pull` denied | Run `docker login <region>.ocir.io` on the VM as the deploy user. Auth tokens stay valid until deleted. |
| Logs | Each line is one JSON object with `request_id`, `latency_ms` and `model_version`. `X-Request-ID` matches nginx's `$request_id`. |
