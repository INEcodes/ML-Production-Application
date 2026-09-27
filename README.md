# ML-Production-Application

A CNN (CIFAR-10) and an RNN (AG News) trained locally with PyTorch, exported to
TorchScript, versioned in OCI Object Storage and served by FastAPI in Docker on an
OCI Always Free Ampere A1 VM.

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Build-out status: [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)
- **Deploying / updating / rolling back: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

## Quick reference

```bash
# train -> export -> push (laptop)
python -m training.train  --model cnn
python -m training.export --model cnn
python scripts/push_model.py --model cnn

# run the API locally against a local export, no cloud needed
cd serving && MODEL_NAME=cnn MODEL_LOCAL_DIR=../models uvicorn app.main:app --reload

# lint + tests (what CI runs)
pip install -r serving/requirements.txt -r serving/requirements-dev.txt torchvision pyyaml
ruff check . && pytest
```

API, per model (`/cnn/...`, `/rnn/...` behind nginx):

| Endpoint | |
|---|---|
| `GET /health` | `{"status": "ok", "model_name", "model_version"}` |
| `GET /version` | loaded model version, git commit, test metrics, image tag |
| `POST /predict` | CNN: `{"image_base64": "<png/jpeg>"}` · RNN: `{"text": "..."}` → label, confidence, probabilities |
