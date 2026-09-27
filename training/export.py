"""Export a trained checkpoint to TorchScript and write a metrics.json model card.

Versioning scheme (per CLAUDE.md): models/<model_name>/v{n}/, containing
model.pt (+ vocab.json for the RNN) and metrics.json. Never overwrites a
previous version - each export bumps the version number.

Usage:
    python -m training.export --model cnn
    python -m training.export --model rnn
"""

import argparse
import json
import subprocess
from pathlib import Path

import torch
import yaml

from training.datasets.cnn_dataset import (
    CIFAR10_CLASSES,
    CIFAR10_IMAGE_SIZE,
    CIFAR10_MEAN,
    CIFAR10_STD,
)
from training.datasets.rnn_dataset import (
    AG_NEWS_CLASSES,
    PAD_TOKEN,
    TOKEN_PATTERN,
    UNK_TOKEN,
    load_vocab,
)
from training.evaluate import evaluate_cnn, evaluate_rnn
from training.models.cnn import SimpleCNN
from training.models.rnn import TextRNN


def _git_commit_hash() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def _next_version(model_dir: Path) -> int:
    existing = [
        int(p.name[1:])
        for p in model_dir.glob("v*")
        if p.is_dir() and p.name[1:].isdigit()
    ]
    return max(existing, default=0) + 1


def trace_cnn(config: dict, checkpoint_path: Path, device: torch.device):
    model = SimpleCNN(config["model"])
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.to(device).eval()

    example_input = torch.zeros(
        1, config["model"]["in_channels"], CIFAR10_IMAGE_SIZE, CIFAR10_IMAGE_SIZE,
        device=device,
    )
    traced = torch.jit.trace(model, example_input)
    return traced, {"dataset": "cifar10 (torchvision)"}


def trace_rnn(config: dict, checkpoint_path: Path, vocab_path: Path, device: torch.device):
    vocab = load_vocab(vocab_path)
    model = TextRNN(config["model"], vocab_size=len(vocab), pad_idx=vocab.stoi[PAD_TOKEN])
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.to(device).eval()

    example_input = torch.zeros(
        1, config["data"]["max_seq_len"], dtype=torch.long, device=device
    )
    traced = torch.jit.trace(model, example_input)
    dataset_info = {"dataset": "ag_news (huggingface datasets)", "vocab_size": len(vocab)}
    return traced, dataset_info, vocab


def serving_spec(model_name: str, config: dict) -> dict:
    """What serving/app/inference.py needs to turn raw input into model input.

    This is the training->serving contract: serving reads it from metrics.json
    instead of importing training code. tests/test_export_serving_contract.py
    checks both sides agree.
    """
    if model_name == "cnn":
        return {
            "labels": CIFAR10_CLASSES,
            "preprocessing": {
                "input_type": "image",
                "image_size": CIFAR10_IMAGE_SIZE,
                "channels": config["model"]["in_channels"],
                "mean": list(CIFAR10_MEAN),
                "std": list(CIFAR10_STD),
            },
        }
    return {
        "labels": AG_NEWS_CLASSES,
        "preprocessing": {
            "input_type": "text",
            "token_pattern": TOKEN_PATTERN,
            "lowercase": True,
            "max_seq_len": config["data"]["max_seq_len"],
            "vocab_file": "vocab.json",
            "pad_token": PAD_TOKEN,
            "unk_token": UNK_TOKEN,
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=["cnn", "rnn"], required=True)
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument(
        "--checkpoint-dir", type=Path, default=Path("artifacts/checkpoints")
    )
    parser.add_argument("--models-dir", type=Path, default=Path("models"))
    args = parser.parse_args()

    config_path = args.config or Path(f"training/configs/{args.model}_config.yaml")
    with open(config_path) as f:
        config = yaml.safe_load(f)

    # Export targets the serving CPU runtime, not whatever trained the checkpoint.
    device = torch.device("cpu")
    checkpoint_dir = args.checkpoint_dir / args.model
    checkpoint_path = checkpoint_dir / "best.pt"
    if not checkpoint_path.exists():
        raise FileNotFoundError(
            f"No checkpoint at {checkpoint_path} - run `python -m training.train "
            f"--model {args.model}` first"
        )

    vocab_dest = None
    if args.model == "cnn":
        traced, dataset_info = trace_cnn(config, checkpoint_path, device)
        test_metrics = evaluate_cnn(config, checkpoint_path, device)
    else:
        vocab_path = checkpoint_dir / "vocab.json"
        traced, dataset_info, _vocab = trace_rnn(config, checkpoint_path, vocab_path, device)
        test_metrics = evaluate_rnn(config, checkpoint_path, vocab_path, device)
        vocab_dest = vocab_path

    model_dir = args.models_dir / args.model
    version = _next_version(model_dir)
    version_dir = model_dir / f"v{version}"
    version_dir.mkdir(parents=True, exist_ok=True)

    traced.save(str(version_dir / "model.pt"))
    if vocab_dest is not None:
        (version_dir / "vocab.json").write_text(vocab_dest.read_text())

    model_card = {
        "model_name": args.model,
        "version": version,
        "export_format": "torchscript",
        "git_commit": _git_commit_hash(),
        "torch_version": torch.__version__,
        "test_metrics": test_metrics,
        **dataset_info,
        **serving_spec(args.model, config),
    }
    (version_dir / "metrics.json").write_text(json.dumps(model_card, indent=2))

    print(f"exported {args.model} v{version} -> {version_dir}")
    print(json.dumps(model_card, indent=2))


if __name__ == "__main__":
    main()
