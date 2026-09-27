# Execution Plan

Phased build-out of the repo. Each phase should be independently committable and leave
the repo in a working state. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full diagram
and component responsibilities.

## Phase 0 — Repo scaffolding *(this pass)*
- [x] `.gitignore` (Python, data, model artifacts, secrets, IDE/OS noise)
- [x] `docs/ARCHITECTURE.md`, `docs/EXECUTION_PLAN.md`
- [x] `CLAUDE.md` with codebase conventions
- [ ] Create empty directory skeleton (`training/`, `serving/`, `scripts/`, `.github/workflows/`)

## Phase 1 — Data pipeline & config
- `training/datasets/dataset.py`: `Dataset`/`DataLoader` wrappers for image data (CNN)
  and sequence data (RNN)
- `training/configs/cnn_config.yaml`, `training/configs/rnn_config.yaml`: hyperparameters,
  paths, batch size, epochs — no hardcoded values in training code
- Decide on one concrete starter dataset per model (e.g., CIFAR-10/MNIST for CNN,
  a public sequence/text dataset for RNN) so the pipeline is testable end-to-end

## Phase 2 — Model definitions
- `training/models/cnn.py`: a plain `nn.Module` CNN (conv/pool/BN blocks + classifier head)
- `training/models/rnn.py`: a plain `nn.Module` RNN/LSTM/GRU
- Both models take their shape/hyperparameters from the config, not from code edits

## Phase 3 — Training loop
- `training/train.py`: training/validation loop, metric logging (accuracy/loss),
  checkpointing best model, early stopping
- Checkpoints written to `artifacts/checkpoints/` (gitignored)

## Phase 4 — Evaluation & export
- `training/evaluate.py`: run a held-out test set through a checkpoint, print/report metrics
- `training/export.py`: convert the best checkpoint to TorchScript or ONNX; write a
  `metrics.json`/model card (metrics, dataset version, git commit hash, export format)
  next to the exported model
- Establish the versioning scheme: `models/<model_name>/v{n}/{model.onnx, metrics.json}`

## Phase 5 — Model push (the "local → live" handoff)
- [ ] *(manual, OCI console)* Create an **OCI Object Storage** bucket (Always Free: 20GB,
  Standard tier, private) and an S3-compatible-API customer secret key
  (Identity → My Profile → Customer Secret Keys); copy `.env.example` → `.env` and fill it in
- [x] `scripts/push_model.py`: uses `boto3` pointed at the OCI S3-compatible endpoint
  (`https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`) to upload the
  exported model + metadata (`pip install -r scripts/requirements.txt`)
- [x] Bump version number, never overwrite a previous version in place

Bucket layout written by `push_model.py`:

```
models/<name>/v{n}/model.pt        # + vocab.json for the RNN
models/<name>/v{n}/metrics.json    # model card + per-file sha256; uploaded LAST = "version complete"
models/<name>/latest.json          # {"version": n} pointer; the only object ever overwritten
```

- The pushed version is always `max(remote) + 1`; the bucket, not the local export
  folder, owns version numbers. `metrics.json` keeps the original as `local_version`.
- The push is refused if the target prefix already has objects, or if the export is
  byte-identical to the newest remote version.
- `--no-promote` uploads without moving `latest.json`; `--dry-run` shows the plan.
- Phase 6's `model_loader.py` should resolve `MODEL_VERSION=latest` via `latest.json`,
  treat a version without `metrics.json` as incomplete, and verify the sha256s.

## Phase 6 — Serving app
- [x] `serving/app/model_loader.py`: on startup, download the model version pinned by the
  `MODEL_VERSION` env var (default: `latest`) from OCI Object Storage into a local cache
  (sha256-verified; cached versions reused offline; `MODEL_LOCAL_DIR` for tests/dev)
- [x] `serving/app/schemas.py`: Pydantic request/response models
- [x] `serving/app/inference.py`: load model once at startup, run inference, format output.
  Preprocessing + labels come from the `preprocessing`/`labels` block `training/export.py`
  now writes into `metrics.json`, so serving never imports training code
- [x] `serving/app/main.py`: FastAPI app with `GET /health` and `POST /predict`
  (`{"image_base64": ...}` for the CNN, `{"text": ...}` for the RNN)
- [x] `serving/tests/`: API + loader tests against tiny TorchScript models built at test
  time (no network, no committed binaries); `tests/test_export_serving_contract.py`
  checks `export.py` output against `inference.py`, including pixel-level parity with
  torchvision's eval transform

## Phase 7 — Containerization
- [x] `serving/Dockerfile`: multi-stage build, lean runtime image (no training deps,
  CPU-only torch, non-root user, healthcheck)
- [x] `serving/docker-compose.yml`: the compose file that also runs unchanged on the OCI VM
  — one image, one service per model (`cnn` → :8001, `rnn` → :8002, selected via
  `COMPOSE_PROFILES`), env from `.env`, restart policy `unless-stopped`, model cache volume

## Phase 8 — CI/CD
- [x] `.github/workflows/ci.yml`:
  1. On PR: `ruff` + all tests
  2. On merge to `main` (once repo variable `DEPLOY_ENABLED=true`): build a
     `linux/arm64` image, push `:<sha12>` + `:latest` to **OCIR**, authenticated with an
     OCI auth token
  3. [x] `scripts/deploy.sh` over SSH: copy compose file, set `IMAGE_TAG`, `docker compose
     pull && up -d`, wait for healthchecks, auto-rollback to the previous tag on failure

## Phase 9 — OCI Always Free provisioning & deployment
Scripted in `scripts/vm/` and walked through in [DEPLOYMENT.md](DEPLOYMENT.md):
- [ ] *(manual)* Create an **Always Free Ampere A1** instance (Ubuntu 24.04 aarch64) and
  open 80/443 (+22 from your IP) in its Security List
- [x] `scripts/vm/setup.sh`: Docker + Compose plugin, host iptables for 80/443, nginx
  reverse proxy (`nginx-ml-app.conf`), Let's Encrypt via certbot, `ml-app.service`
- [ ] *(manual)* `/opt/ml-app/.env` on the VM, `docker login` to OCIR, GitHub secrets
- [ ] *(manual)* Confirm `/health` and `/predict` end-to-end over HTTPS

## Phase 10 — Observability & iteration
- [x] Structured JSON logging (request id, model version, latency) in `serving/app/main.py`;
  `X-Request-ID` propagated from nginx
- [x] `GET /version`: loaded model version, git commit, test metrics, image tag
- [x] Retrain → export → push → redeploy loop and rollback documented in
  [DEPLOYMENT.md](DEPLOYMENT.md)

---

**Next concrete step:** the manual parts of Phase 5 and Phase 9 (OCI bucket, keys, VM),
then follow [DEPLOYMENT.md](DEPLOYMENT.md). The RNN checkpoint in `artifacts/` predates
`vocab.json` being saved, so retrain the RNN before exporting it (or run with
`COMPOSE_PROFILES=cnn` until then).
