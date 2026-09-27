"""Load the exported TorchScript model once and turn raw inputs into predictions.

Preprocessing is driven entirely by the "preprocessing" block training/export.py
writes into metrics.json, so this module never imports training code.
"""

import io
import json
import re

import numpy as np
import torch
from PIL import Image, UnidentifiedImageError

from .model_loader import ModelArtifact


class InvalidInput(ValueError):
    """Input is well-formed JSON but can't be turned into a model input."""


class ImagePreprocessor:
    """Mirror training's eval transform: ToTensor() + Normalize(mean, std)."""

    input_type = "image"

    def __init__(self, spec: dict):
        self.size = int(spec["image_size"])
        self.channels = int(spec["channels"])
        self.mean = np.asarray(spec["mean"], dtype=np.float32).reshape(-1, 1, 1)
        self.std = np.asarray(spec["std"], dtype=np.float32).reshape(-1, 1, 1)

    def __call__(self, data: bytes) -> torch.Tensor:
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
            raise InvalidInput(f"could not decode image: {e}") from e
        img = img.convert("RGB" if self.channels == 3 else "L")
        if img.size != (self.size, self.size):
            img = img.resize((self.size, self.size), Image.Resampling.BILINEAR)
        arr = np.asarray(img, dtype=np.float32) / 255.0
        arr = arr[None, :, :] if arr.ndim == 2 else arr.transpose(2, 0, 1)
        arr = (arr - self.mean) / self.std
        return torch.from_numpy(np.ascontiguousarray(arr)).unsqueeze(0)

    def example(self) -> torch.Tensor:
        return torch.zeros(1, self.channels, self.size, self.size)


class TextPreprocessor:
    """Mirror training's tokenizer + vocab encode + truncation (no padding)."""

    input_type = "text"

    def __init__(self, spec: dict, itos: list[str]):
        self.stoi = {tok: i for i, tok in enumerate(itos)}
        self.unk = self.stoi[spec["unk_token"]]
        self.token_re = re.compile(spec["token_pattern"])
        self.lowercase = bool(spec.get("lowercase", True))
        self.max_len = int(spec["max_seq_len"])

    def __call__(self, text: str) -> torch.Tensor:
        tokens = self.token_re.findall(text.lower() if self.lowercase else text)
        tokens = tokens[: self.max_len]
        if not tokens:
            raise InvalidInput("text contains no tokens the model can read")
        ids = [self.stoi.get(t, self.unk) for t in tokens]
        return torch.tensor([ids], dtype=torch.long)

    def example(self) -> torch.Tensor:
        return torch.full((1, 1), self.unk, dtype=torch.long)


class Predictor:
    def __init__(self, artifact: ModelArtifact):
        card = artifact.card
        if "preprocessing" not in card or "labels" not in card:
            raise RuntimeError(
                f"{artifact.name} v{artifact.version} metrics.json has no preprocessing/labels "
                "block - re-export it with the current training/export.py and push again"
            )
        self.name = artifact.name
        self.version = artifact.version
        self.card = card
        self.labels: list[str] = card["labels"]

        spec = card["preprocessing"]
        if spec["input_type"] == "image":
            self.preprocess = ImagePreprocessor(spec)
        elif spec["input_type"] == "text":
            itos = json.loads((artifact.path / spec["vocab_file"]).read_text())
            self.preprocess = TextPreprocessor(spec, itos)
        else:
            raise RuntimeError(f"unsupported input_type {spec['input_type']!r}")
        self.input_type = self.preprocess.input_type

        self.model = torch.jit.load(str(artifact.path / "model.pt"), map_location="cpu")
        self.model.eval()
        self._warmup()

    def _warmup(self) -> None:
        # First TorchScript call is slow (profiling/optimisation); pay it at startup,
        # and fail fast if the model and metrics.json disagree.
        with torch.inference_mode():
            out = self.model(self.preprocess.example())
        if tuple(out.shape) != (1, len(self.labels)):
            raise RuntimeError(
                f"model output shape {tuple(out.shape)} does not match "
                f"{len(self.labels)} labels in metrics.json"
            )

    def predict(self, x: torch.Tensor) -> dict:
        with torch.inference_mode():
            probs = torch.softmax(self.model(x)[0], dim=0)
        idx = int(probs.argmax())
        return {
            "model_name": self.name,
            "model_version": self.version,
            "label": self.labels[idx],
            "class_index": idx,
            "confidence": float(probs[idx]),
            "probabilities": {
                label: round(float(p), 6) for label, p in zip(self.labels, probs, strict=True)
            },
        }
