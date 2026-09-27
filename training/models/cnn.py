"""Plain nn.Module CNN, shaped entirely from config (no hardcoded hyperparameters)."""

from torch import nn


class SimpleCNN(nn.Module):
    def __init__(self, model_config: dict):
        super().__init__()
        in_channels = model_config["in_channels"]
        conv_channels = model_config["conv_channels"]

        blocks = []
        prev_channels = in_channels
        for channels in conv_channels:
            blocks.append(nn.Conv2d(prev_channels, channels, kernel_size=3, padding=1))
            blocks.append(nn.BatchNorm2d(channels))
            blocks.append(nn.ReLU(inplace=True))
            blocks.append(nn.MaxPool2d(kernel_size=2))
            prev_channels = channels
        self.features = nn.Sequential(*blocks)

        # CIFAR-10 images are 32x32; each MaxPool2d(2) above halves the spatial size.
        spatial_size = 32 // (2 ** len(conv_channels))
        flat_dim = prev_channels * spatial_size * spatial_size

        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(flat_dim, model_config["fc_hidden"]),
            nn.ReLU(inplace=True),
            nn.Dropout(model_config["dropout"]),
            nn.Linear(model_config["fc_hidden"], model_config["num_classes"]),
        )

    def forward(self, x):
        x = self.features(x)
        return self.classifier(x)
