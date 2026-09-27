"""AG News Dataset/DataLoader wrappers for the RNN pipeline."""

import json
import re
from collections import Counter
from pathlib import Path

import torch
from torch.nn.utils.rnn import pad_sequence
from torch.utils.data import DataLoader, Dataset, random_split

PAD_TOKEN = "<pad>"
UNK_TOKEN = "<unk>"

# Exported into the model card by training/export.py so serving tokenizes
# identically without importing training code.
TOKEN_PATTERN = r"[a-z0-9]+"
AG_NEWS_CLASSES = ["World", "Sports", "Business", "Sci/Tech"]

_TOKEN_RE = re.compile(TOKEN_PATTERN)


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


class Vocab:
    """Minimal token<->id vocabulary built from a token frequency count."""

    def __init__(self, itos: list[str]):
        self.itos = itos
        self.stoi = {token: idx for idx, token in enumerate(self.itos)}

    @classmethod
    def from_counter(cls, counter: Counter, min_freq: int, max_size: int) -> "Vocab":
        itos = [PAD_TOKEN, UNK_TOKEN]
        for token, freq in counter.most_common():
            if freq < min_freq:
                continue
            if len(itos) >= max_size:
                break
            itos.append(token)
        return cls(itos)

    def __len__(self) -> int:
        return len(self.itos)

    def encode(self, tokens: list[str]) -> list[int]:
        unk = self.stoi[UNK_TOKEN]
        return [self.stoi.get(token, unk) for token in tokens]


def save_vocab(vocab: Vocab, path: Path) -> None:
    Path(path).write_text(json.dumps(vocab.itos))


def load_vocab(path: Path) -> Vocab:
    itos = json.loads(Path(path).read_text())
    return Vocab(itos)


class AGNewsDataset(Dataset):
    """Wraps a HF ag_news split as tokenized, vocab-encoded label/sequence pairs."""

    def __init__(self, rows, vocab: Vocab, max_seq_len: int):
        self._rows = rows
        self._vocab = vocab
        self._max_seq_len = max_seq_len

    def __len__(self) -> int:
        return len(self._rows)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        row = self._rows[idx]
        tokens = _tokenize(row["text"])[: self._max_seq_len]
        ids = self._vocab.encode(tokens)
        return torch.tensor(ids, dtype=torch.long), row["label"]


def _collate(batch: list[tuple[torch.Tensor, int]], pad_id: int):
    sequences, labels = zip(*batch, strict=True)
    padded = pad_sequence(sequences, batch_first=True, padding_value=pad_id)
    return padded, torch.tensor(labels, dtype=torch.long)


def get_ag_news_dataloaders(config: dict) -> tuple[DataLoader, DataLoader, Vocab]:
    """Build train/val DataLoaders for AG News from a loaded config dict.

    Downloads/caches the ag_news dataset into config["data"]["root"] via the
    Hugging Face `datasets` library if not already present. Also returns the
    Vocab built from the training data, since the RNN's embedding layer must
    be sized from it (vocab size isn't known until the data is read).
    """
    from datasets import load_dataset

    data_cfg = config["data"]
    train_cfg = config["train"]

    raw = load_dataset("ag_news", split="train", cache_dir=data_cfg["root"])

    counter = Counter()
    for row in raw:
        counter.update(_tokenize(row["text"]))
    vocab = Vocab.from_counter(
        counter, min_freq=data_cfg["min_freq"], max_size=data_cfg["max_vocab_size"]
    )

    full_dataset = AGNewsDataset(raw, vocab, max_seq_len=data_cfg["max_seq_len"])

    num_val = int(len(full_dataset) * train_cfg["val_split"])
    num_train = len(full_dataset) - num_val
    generator = torch.Generator().manual_seed(config["seed"])
    train_set, val_set = random_split(
        full_dataset, [num_train, num_val], generator=generator
    )

    pad_id = vocab.stoi[PAD_TOKEN]

    def collate_fn(batch):
        return _collate(batch, pad_id)

    train_loader = DataLoader(
        train_set,
        batch_size=train_cfg["batch_size"],
        shuffle=True,
        collate_fn=collate_fn,
    )
    val_loader = DataLoader(
        val_set,
        batch_size=train_cfg["batch_size"],
        shuffle=False,
        collate_fn=collate_fn,
    )
    return train_loader, val_loader, vocab


def get_ag_news_test_dataloader(config: dict, vocab: Vocab) -> DataLoader:
    """Build a DataLoader over AG News's held-out test split (never seen in training).

    Takes the Vocab built from the training data so token ids stay consistent
    between train and test.
    """
    from datasets import load_dataset

    data_cfg = config["data"]
    train_cfg = config["train"]

    raw = load_dataset("ag_news", split="test", cache_dir=data_cfg["root"])
    test_dataset = AGNewsDataset(raw, vocab, max_seq_len=data_cfg["max_seq_len"])

    pad_id = vocab.stoi[PAD_TOKEN]

    def collate_fn(batch):
        return _collate(batch, pad_id)

    return DataLoader(
        test_dataset,
        batch_size=train_cfg["batch_size"],
        shuffle=False,
        collate_fn=collate_fn,
    )
