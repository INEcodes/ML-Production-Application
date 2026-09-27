"""Evaluate a trained checkpoint against its held-out test set.

Usage:
    python -m training.evaluate --model cnn
    python -m training.evaluate --model rnn
"""

import argparse
import json
from pathlib import Path

import torch
import yaml
from torch import nn

from training.datasets.cnn_dataset import get_cifar10_test_dataloader
from training.datasets.rnn_dataset import PAD_TOKEN, get_ag_news_test_dataloader, load_vocab
from training.models.cnn import SimpleCNN
from training.models.rnn import TextRNN


def run_eval(model: nn.Module, loader, device: torch.device) -> dict:
    model.eval()
    criterion = nn.CrossEntropyLoss()

    total_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for inputs, labels in loader:
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = model(inputs)
            loss = criterion(outputs, labels)

            total_loss += loss.item() * labels.size(0)
            correct += (outputs.argmax(dim=1) == labels).sum().item()
            total += labels.size(0)

    return {
        "test_loss": total_loss / total,
        "test_accuracy": correct / total,
        "num_samples": total,
    }


def evaluate_cnn(config: dict, checkpoint_path: Path, device: torch.device) -> dict:
    model = SimpleCNN(config["model"])
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.to(device)

    test_loader = get_cifar10_test_dataloader(config)
    return run_eval(model, test_loader, device)


def evaluate_rnn(
    config: dict, checkpoint_path: Path, vocab_path: Path, device: torch.device
) -> dict:
    vocab = load_vocab(vocab_path)
    model = TextRNN(config["model"], vocab_size=len(vocab), pad_idx=vocab.stoi[PAD_TOKEN])
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.to(device)

    test_loader = get_ag_news_test_dataloader(config, vocab)
    return run_eval(model, test_loader, device)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=["cnn", "rnn"], required=True)
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument(
        "--checkpoint-dir", type=Path, default=Path("artifacts/checkpoints")
    )
    args = parser.parse_args()

    config_path = args.config or Path(f"training/configs/{args.model}_config.yaml")
    with open(config_path) as f:
        config = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint_dir = args.checkpoint_dir / args.model
    checkpoint_path = checkpoint_dir / "best.pt"
    if not checkpoint_path.exists():
        raise FileNotFoundError(
            f"No checkpoint at {checkpoint_path} - run `python -m training.train "
            f"--model {args.model}` first"
        )

    if args.model == "cnn":
        metrics = evaluate_cnn(config, checkpoint_path, device)
    else:
        metrics = evaluate_rnn(config, checkpoint_path, checkpoint_dir / "vocab.json", device)

    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
