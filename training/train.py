"""Training loop shared by the CNN and RNN pipelines.

Usage:
    python -m training.train --model cnn
    python -m training.train --model rnn
    python -m training.train --model cnn --config training/configs/my_variant.yaml
"""

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
import yaml
from torch import nn, optim

from training.datasets.cnn_dataset import get_cifar10_dataloaders
from training.datasets.rnn_dataset import PAD_TOKEN, get_ag_news_dataloaders, save_vocab
from training.models.cnn import SimpleCNN
from training.models.rnn import TextRNN


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def build_cnn(config: dict):
    train_loader, val_loader = get_cifar10_dataloaders(config)
    model = SimpleCNN(config["model"])
    return model, train_loader, val_loader, None


def build_rnn(config: dict):
    train_loader, val_loader, vocab = get_ag_news_dataloaders(config)
    model = TextRNN(config["model"], vocab_size=len(vocab), pad_idx=vocab.stoi[PAD_TOKEN])
    return model, train_loader, val_loader, vocab


BUILDERS = {"cnn": build_cnn, "rnn": build_rnn}


def run_epoch(model, loader, criterion, device, optimizer=None):
    is_train = optimizer is not None
    model.train(is_train)

    total_loss = 0.0
    correct = 0
    total = 0

    with torch.set_grad_enabled(is_train):
        for inputs, labels in loader:
            inputs, labels = inputs.to(device), labels.to(device)

            if is_train:
                optimizer.zero_grad()

            outputs = model(inputs)
            loss = criterion(outputs, labels)

            if is_train:
                loss.backward()
                optimizer.step()

            total_loss += loss.item() * labels.size(0)
            correct += (outputs.argmax(dim=1) == labels).sum().item()
            total += labels.size(0)

    return total_loss / total, correct / total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=list(BUILDERS), required=True)
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument(
        "--checkpoint-dir", type=Path, default=Path("artifacts/checkpoints")
    )
    args = parser.parse_args()

    config_path = args.config or Path(f"training/configs/{args.model}_config.yaml")
    with open(config_path) as f:
        config = yaml.safe_load(f)

    set_seed(config["seed"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model, train_loader, val_loader, vocab = BUILDERS[args.model](config)
    model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=config["train"]["lr"])

    checkpoint_dir = args.checkpoint_dir / args.model
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    history_path = checkpoint_dir / "history.jsonl"
    history_path.write_text("")

    if vocab is not None:
        save_vocab(vocab, checkpoint_dir / "vocab.json")

    patience = config["train"]["early_stop_patience"]
    best_val_loss = float("inf")
    epochs_without_improvement = 0

    for epoch in range(1, config["train"]["epochs"] + 1):
        train_loss, train_acc = run_epoch(
            model, train_loader, criterion, device, optimizer=optimizer
        )
        val_loss, val_acc = run_epoch(model, val_loader, criterion, device)

        print(
            f"epoch {epoch:3d} | train_loss {train_loss:.4f} train_acc {train_acc:.4f} "
            f"| val_loss {val_loss:.4f} val_acc {val_acc:.4f}"
        )
        with history_path.open("a") as f:
            f.write(
                json.dumps(
                    {
                        "epoch": epoch,
                        "train_loss": train_loss,
                        "train_acc": train_acc,
                        "val_loss": val_loss,
                        "val_acc": val_acc,
                    }
                )
                + "\n"
            )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            epochs_without_improvement = 0
            torch.save(model.state_dict(), checkpoint_dir / "best.pt")
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience:
                print(f"early stopping at epoch {epoch} (patience={patience})")
                break

    print(f"best val_loss: {best_val_loss:.4f} -> {checkpoint_dir / 'best.pt'}")


if __name__ == "__main__":
    main()
