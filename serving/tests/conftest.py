"""Test fixtures: tiny TorchScript models built on the fly (no network, no committed binaries).

They're laid out exactly like the bucket / an export (<root>/<name>/v{n}/) with a
metrics.json carrying the same labels + preprocessing contract training/export.py writes.
"""

import base64
import io
import json

import pytest
import torch
from fastapi.testclient import TestClient
from PIL import Image
from torch import nn

CNN_LABELS = ["airplane", "automobile", "bird", "cat", "deer",
              "dog", "frog", "horse", "ship", "truck"]
RNN_LABELS = ["World", "Sports", "Business", "Sci/Tech"]
VOCAB = ["<pad>", "<unk>", "stocks", "rallied", "team", "won", "the"]


class TinyCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = nn.Conv2d(3, 2, kernel_size=3, padding=1)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Linear(2, len(CNN_LABELS))

    def forward(self, x):
        return self.fc(self.pool(self.conv(x)).flatten(1))


class TinyRNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.emb = nn.Embedding(len(VOCAB), 4, padding_idx=0)
        self.lstm = nn.LSTM(4, 4, batch_first=True)
        self.fc = nn.Linear(4, len(RNN_LABELS))

    def forward(self, x):
        _, (h, _) = self.lstm(self.emb(x))
        return self.fc(h[-1])


def _write_version(version_dir, traced, card, extra_files=None):
    version_dir.mkdir(parents=True)
    traced.save(str(version_dir / "model.pt"))
    for name, content in (extra_files or {}).items():
        (version_dir / name).write_text(content)
    (version_dir / "metrics.json").write_text(json.dumps(card))


@pytest.fixture(scope="session")
def model_root(tmp_path_factory):
    torch.manual_seed(0)
    root = tmp_path_factory.mktemp("models")

    cnn = torch.jit.trace(TinyCNN().eval(), torch.zeros(1, 3, 32, 32))
    cnn_card = {
        "model_name": "cnn",
        "git_commit": "abc123",
        "test_metrics": {"test_accuracy": 0.5},
        "labels": CNN_LABELS,
        "preprocessing": {
            "input_type": "image",
            "image_size": 32,
            "channels": 3,
            "mean": [0.4914, 0.4822, 0.4465],
            "std": [0.2470, 0.2435, 0.2616],
        },
    }
    for v in (1, 2):
        _write_version(root / "cnn" / f"v{v}", cnn, {**cnn_card, "version": v})

    rnn = torch.jit.trace(TinyRNN().eval(), torch.zeros(1, 8, dtype=torch.long))
    rnn_card = {
        "model_name": "rnn",
        "version": 1,
        "labels": RNN_LABELS,
        "preprocessing": {
            "input_type": "text",
            "token_pattern": "[a-z0-9]+",
            "lowercase": True,
            "max_seq_len": 8,
            "vocab_file": "vocab.json",
            "pad_token": "<pad>",
            "unk_token": "<unk>",
        },
    }
    _write_version(root / "rnn" / "v1", rnn, rnn_card, {"vocab.json": json.dumps(VOCAB)})
    return root


def _client(monkeypatch, model_root, name, version="latest"):
    monkeypatch.setenv("MODEL_LOCAL_DIR", str(model_root))
    monkeypatch.setenv("MODEL_NAME", name)
    monkeypatch.setenv("MODEL_VERSION", version)
    from app.main import app

    return TestClient(app)


@pytest.fixture
def cnn_client(monkeypatch, model_root):
    with _client(monkeypatch, model_root, "cnn") as c:
        yield c


@pytest.fixture
def rnn_client(monkeypatch, model_root):
    with _client(monkeypatch, model_root, "rnn") as c:
        yield c


@pytest.fixture
def png_b64():
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (200, 30, 30)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()
