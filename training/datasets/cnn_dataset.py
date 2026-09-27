"""CIFAR-10 Dataset/DataLoader wrappers for the CNN pipeline."""

import torch
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms

# Exported into the model card by training/export.py so serving can reproduce the
# eval-time transform without importing training code.
CIFAR10_MEAN = (0.4914, 0.4822, 0.4465)
CIFAR10_STD = (0.2470, 0.2435, 0.2616)
CIFAR10_IMAGE_SIZE = 32
CIFAR10_CLASSES = [
    "airplane", "automobile", "bird", "cat", "deer",
    "dog", "frog", "horse", "ship", "truck",
]


def _build_transform(config: dict, train: bool) -> transforms.Compose:
    aug = config["augmentation"]
    normalize = transforms.Normalize(mean=CIFAR10_MEAN, std=CIFAR10_STD)

    if not train:
        return transforms.Compose([transforms.ToTensor(), normalize])

    ops = []
    if aug["random_crop"]:
        ops.append(transforms.RandomCrop(32, padding=4))
    if aug["random_flip"]:
        ops.append(transforms.RandomHorizontalFlip())
    ops.extend([transforms.ToTensor(), normalize])
    return transforms.Compose(ops)


def get_cifar10_dataloaders(config: dict) -> tuple[DataLoader, DataLoader]:
    """Build train/val DataLoaders for CIFAR-10 from a loaded config dict.

    Downloads CIFAR-10 into config["data"]["root"] if not already present.
    """
    data_cfg = config["data"]
    train_cfg = config["train"]

    train_full = datasets.CIFAR10(
        root=data_cfg["root"],
        train=True,
        download=True,
        transform=_build_transform(config, train=True),
    )
    val_source = datasets.CIFAR10(
        root=data_cfg["root"],
        train=True,
        download=True,
        transform=_build_transform(config, train=False),
    )

    num_val = int(len(train_full) * train_cfg["val_split"])
    num_train = len(train_full) - num_val
    generator = torch.Generator().manual_seed(config["seed"])

    train_split, val_split = random_split(
        range(len(train_full)), [num_train, num_val], generator=generator
    )
    train_indices = train_split.indices
    val_indices = val_split.indices

    train_set = torch.utils.data.Subset(train_full, train_indices)
    val_set = torch.utils.data.Subset(val_source, val_indices)

    train_loader = DataLoader(
        train_set,
        batch_size=train_cfg["batch_size"],
        shuffle=True,
        num_workers=data_cfg["num_workers"],
    )
    val_loader = DataLoader(
        val_set,
        batch_size=train_cfg["batch_size"],
        shuffle=False,
        num_workers=data_cfg["num_workers"],
    )
    return train_loader, val_loader


def get_cifar10_test_dataloader(config: dict) -> DataLoader:
    """Build a DataLoader over CIFAR-10's held-out test split (never seen in training)."""
    data_cfg = config["data"]
    train_cfg = config["train"]

    test_set = datasets.CIFAR10(
        root=data_cfg["root"],
        train=False,
        download=True,
        transform=_build_transform(config, train=False),
    )
    return DataLoader(
        test_set,
        batch_size=train_cfg["batch_size"],
        shuffle=False,
        num_workers=data_cfg["num_workers"],
    )
