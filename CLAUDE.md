# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

A basic ML application (CNN + RNN models) with a **hard split between training and
serving**: models are trained locally, exported, and pushed as versioned artifacts to
object storage; a separate, lightweight FastAPI service pulls the pinned model version
and serves predictions from a Docker container running on an **Oracle Cloud
Infrastructure (OCI) Always Free** compute instance.

Full diagram and component table: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Phased build-out: [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md).

## Stack

- **Training:** PyTorch, plain `nn.Module` models, YAML configs (no hardcoded hyperparameters)
- **Model handoff:** export to TorchScript/ONNX → upload to **OCI Object Storage**
  (Always Free tier, 20GB), versioned as `models/<name>/v{n}/`. OCI Object Storage
  exposes an S3-compatible API, so `boto3` pointed at the OCI endpoint works unchanged —
  no OCI-specific SDK required.
- **Serving:** FastAPI + Uvicorn, Docker, deployed to an **OCI Always Free Ampere A1**
  compute instance (up to 4 OCPU / 24GB RAM, split across up to 4 instances, free
  indefinitely — not a 12-month trial). OCI's free tier has **no managed serverless
  container product** (no Cloud Run/App Runner equivalent that's actually free), so
  Docker runs directly on the VM via `docker compose` + a `systemd` unit, not a
  platform-managed deploy.
- **Registry:** OCI Container Registry (OCIR) — free-tier storage for the serving image.
- **TLS/ingress:** Nginx reverse proxy on the VM + Let's Encrypt (the Always Free
  Flexible Load Balancer is an alternative but adds a second moving part — start without
  it).

## Repo layout

```
training/       # local-only, heavy deps (torch, torchvision) — never imported by serving/
  configs/      # cnn_config.yaml, rnn_config.yaml
  datasets/     # Dataset/DataLoader wrappers (+ preprocessing constants export.py ships)
  models/       # cnn.py, rnn.py — plain nn.Module, shape driven by config
  train.py
  evaluate.py
  export.py     # checkpoint -> TorchScript + metrics.json (incl. labels + preprocessing spec)
scripts/
  push_model.py # uploads exported model + metadata to OCI Object Storage
  deploy.sh     # ssh's into the OCI VM: docker pull + compose up + health/rollback (used by CI)
  vm/           # one-time VM provisioning: setup.sh, nginx site, systemd unit
serving/        # lightweight deps — never imports training/
  app/
    main.py         # FastAPI app: GET /health, GET /version, POST /predict; JSON logs
    model_loader.py # downloads MODEL_VERSION-pinned artifact at container startup
    inference.py    # preprocessing driven by metrics.json + TorchScript inference
    schemas.py      # pydantic request/response models
  tests/            # fixture models are built at test time, not committed
  Dockerfile
  docker-compose.yml # what actually runs on the OCI VM (one service per model)
tests/          # export<->serving contract test — the only code importing both sides
docs/
  ARCHITECTURE.md
  EXECUTION_PLAN.md
  DEPLOYMENT.md   # runbook: OCI setup, VM, secrets, update + rollback procedure
.github/workflows/ci.yml
```

The training→serving contract is the `labels` + `preprocessing` block `export.py`
writes into `metrics.json`. If you change preprocessing in `training/datasets/`, update
`export.serving_spec()` and `serving/app/inference.py` together;
`tests/test_export_serving_contract.py` should catch drift.

## Working conventions

- **Never let `serving/` import from `training/` or vice versa.** They ship separately
  (training runs locally/on a GPU box; serving ships as a lean Docker image). If code
  needs to be shared (e.g. a preprocessing transform used at both train and inference
  time), put it in a small shared module both sides import explicitly — don't reach
  across the training/serving boundary.
- **No hyperparameters or file paths hardcoded in Python.** They belong in
  `training/configs/*.yaml`. This keeps `train.py` reusable across the CNN and RNN.
- **Model artifacts (`*.pt`, `*.onnx`, `*.ckpt`, etc.) are never committed to git** — see
  `.gitignore`. They live in object storage, addressed by version. If you need a tiny
  fixture model for serving tests, keep it under a few KB and put it under
  `serving/tests/fixtures/`.
- **The serving app loads its model at startup, not per-request.** `model_loader.py`
  downloads once when the container boots; `inference.py` reuses the loaded model object.
- **Version everything that crosses the training→serving boundary.** Every exported
  model is pushed with a `metrics.json`/model card (metrics, dataset version, git commit
  hash) alongside it — never overwrite a previous version in place, so rollback is just
  changing the `MODEL_VERSION` env var.
- **Keep the two `requirements.txt` files independent.** `training/requirements.txt` can
  be heavy (torch+cuda, torchvision, matplotlib). `serving/requirements.txt` should stay
  minimal (fastapi, uvicorn, pydantic, and either onnxruntime or torch-cpu) so the
  serving Docker image stays small.
- **Deploys are a pull, not a push, from OCI's side.** There's no managed platform to
  hand an image to. CI builds the image, pushes it to OCIR, then SSHes into the Always
  Free VM (`scripts/deploy.sh`) to `docker compose pull && docker compose up -d`.
  Secrets (OCI credentials, SSH key) live in GitHub Actions secrets, never in the repo.
- **Design around Always Free's limits, don't fight them.** One Ampere A1 instance (or a
  few small ones sharing the 4 OCPU / 24GB pool), 20GB Object Storage, and 10TB/month
  egress. That's enough for a single-replica inference API but not autoscaling or
  blue/green — a new deploy briefly restarts the one running container.

## Execution plan status

See [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) for the full phase breakdown and
which phase is currently in progress — check it before assuming a component doesn't
exist yet vs. hasn't been built yet.

## Testing

- Serving API tests (`serving/tests/`) should run against a small fixture model, not a
  real downloaded artifact — they must pass with no network/object-storage access.
- Training code doesn't need heavy unit tests, but `export.py`'s output shape/dtype
  should be checked against what `inference.py` expects, since that's the seam where the
  two lifecycles disagree silently if it drifts.
