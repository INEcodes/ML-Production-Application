"""The training->serving seam: what export.py writes must be what inference.py expects.

Uses the real model classes, real configs and export.py's own trace/serving_spec
functions (random weights, no dataset), then loads the result through serving's
Predictor exactly as the container would. Needs training deps (torch, torchvision,
pyyaml) plus serving deps; neither package imports the other - only this test does.
"""

import io
import json
from pathlib import Path

import pytest
import torch
import yaml
from PIL import Image

from app.inference import ImagePreprocessor, Predictor
from app.model_loader import load_artifact
from training.datasets.rnn_dataset import PAD_TOKEN, UNK_TOKEN, Vocab, _tokenize, save_vocab
from training.export import serving_spec, trace_cnn, trace_rnn
from training.models.cnn import SimpleCNN
from training.models.rnn import TextRNN

CONFIGS = Path(__file__).resolve().parent.parent / "training" / "configs"


def _config(name):
    return yaml.safe_load((CONFIGS / f"{name}_config.yaml").read_text())


def _export(tmp_path, name, traced, config, extra_files=()):
    """Write a version dir the same way export.main() does."""
    vdir = tmp_path / "models" / name / "v1"
    vdir.mkdir(parents=True)
    traced.save(str(vdir / "model.pt"))
    for src in extra_files:
        (vdir / src.name).write_text(src.read_text())
    card = {"model_name": name, "version": 1, **serving_spec(name, config)}
    (vdir / "metrics.json").write_text(json.dumps(card))
    return Predictor(load_artifact({"MODEL_NAME": name,
                                    "MODEL_LOCAL_DIR": str(tmp_path / "models")}))


def test_cnn_contract(tmp_path):
    config = _config("cnn")
    ckpt = tmp_path / "best.pt"
    torch.save(SimpleCNN(config["model"]).state_dict(), ckpt)
    traced, _ = trace_cnn(config, ckpt, torch.device("cpu"))

    predictor = _export(tmp_path, "cnn", traced, config)
    assert len(predictor.labels) == config["model"]["num_classes"]

    buf = io.BytesIO()
    Image.new("RGB", (100, 80), (10, 200, 30)).save(buf, format="JPEG")
    x = predictor.preprocess(buf.getvalue())
    assert x.dtype == torch.float32
    assert x.shape == (1, config["model"]["in_channels"], 32, 32)
    assert predictor.predict(x)["label"] in predictor.labels


def test_cnn_preprocessing_matches_training_transform():
    """Serving's numpy preprocessing == torchvision's eval transform on a 32x32 image."""
    from training.datasets.cnn_dataset import _build_transform

    config = _config("cnn")
    preprocess = ImagePreprocessor(serving_spec("cnn", config)["preprocessing"])

    torch.manual_seed(0)
    pixels = (torch.rand(32, 32, 3) * 255).to(torch.uint8).numpy()
    img = Image.fromarray(pixels, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    expected = _build_transform(config, train=False)(img).unsqueeze(0)
    actual = preprocess(buf.getvalue())
    assert torch.allclose(actual, expected, atol=1e-5)


def test_rnn_contract(tmp_path):
    config = _config("rnn")
    text = "Wall St. Bears Claw Back Into the Black (Reuters)"
    vocab = Vocab([PAD_TOKEN, UNK_TOKEN, *sorted(set(_tokenize(text)))])
    vocab_path = tmp_path / "vocab.json"
    save_vocab(vocab, vocab_path)

    ckpt = tmp_path / "best.pt"
    model = TextRNN(config["model"], vocab_size=len(vocab), pad_idx=vocab.stoi[PAD_TOKEN])
    torch.save(model.state_dict(), ckpt)
    traced, _, _ = trace_rnn(config, ckpt, vocab_path, torch.device("cpu"))

    predictor = _export(tmp_path, "rnn", traced, config, extra_files=[vocab_path])
    assert len(predictor.labels) == config["model"]["num_classes"]

    x = predictor.preprocess(text + " unseenword")
    # Same ids training would produce for this text.
    assert x[0].tolist() == vocab.encode(_tokenize(text + " unseenword"))
    assert x.dtype == torch.long

    # Traced at max_seq_len but must accept shorter, unpadded input.
    model.eval()
    with torch.no_grad():
        assert torch.allclose(predictor.model(x), model(x), atol=1e-5)

    long = predictor.preprocess("reuters " * (config["data"]["max_seq_len"] + 50))
    assert long.shape == (1, config["data"]["max_seq_len"])


@pytest.mark.parametrize("name", ["cnn", "rnn"])
def test_spec_is_json_serialisable(name):
    json.dumps(serving_spec(name, _config(name)))
