"""Plain nn.Module RNN (LSTM), shaped from config plus a runtime vocab size."""

import torch
from torch import nn


class TextRNN(nn.Module):
    def __init__(self, model_config: dict, vocab_size: int, pad_idx: int):
        super().__init__()
        num_layers = model_config["num_layers"]
        bidirectional = model_config["bidirectional"]

        self.embedding = nn.Embedding(
            vocab_size, model_config["embedding_dim"], padding_idx=pad_idx
        )
        self.lstm = nn.LSTM(
            input_size=model_config["embedding_dim"],
            hidden_size=model_config["hidden_dim"],
            num_layers=num_layers,
            batch_first=True,
            bidirectional=bidirectional,
            # nn.LSTM only allows inter-layer dropout when num_layers > 1.
            dropout=model_config["dropout"] if num_layers > 1 else 0.0,
        )
        out_dim = model_config["hidden_dim"] * (2 if bidirectional else 1)
        self.classifier = nn.Linear(out_dim, model_config["num_classes"])

    def forward(self, x):
        embedded = self.embedding(x)
        _, (hidden, _) = self.lstm(embedded)
        if self.lstm.bidirectional:
            hidden = torch.cat([hidden[-2], hidden[-1]], dim=1)
        else:
            hidden = hidden[-1]
        return self.classifier(hidden)
