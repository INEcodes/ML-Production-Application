"""Push an exported model version to OCI Object Storage (the "local -> live" handoff).

Uploads models/<name>/v{n}/ (as written by training/export.py) to the bucket under
the same layout, via OCI's S3-compatible API with plain boto3.

Versioning rules (per CLAUDE.md):
  - The bucket is the source of truth. The pushed version is always
    max(remote versions) + 1, so two machines exporting "v1" can never collide.
    If that differs from the local version number, the uploaded metrics.json is
    rewritten to the remote version (the local number is kept as "local_version").
  - A version prefix that already has objects is never written to.
  - metrics.json is uploaded last and acts as the "version is complete" marker.
  - models/<name>/latest.json is a small pointer to the newest version; it is the
    only object ever overwritten (skip with --no-promote).

Credentials come from env vars (or a repo-root .env file, see .env.example):
  OCI_NAMESPACE, OCI_REGION, OCI_BUCKET, OCI_S3_ACCESS_KEY_ID, OCI_S3_SECRET_ACCESS_KEY
  OCI_S3_ENDPOINT (optional: overrides the endpoint derived from namespace + region)

Usage:
    python scripts/push_model.py --model cnn            # push newest local export
    python scripts/push_model.py --model rnn --version 2
    python scripts/push_model.py --model cnn --dry-run  # show the plan, upload nothing
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import boto3
from botocore.config import Config

REPO_ROOT = Path(__file__).resolve().parent.parent
REQUIRED_ENV = [
    "OCI_REGION",
    "OCI_BUCKET",
    "OCI_S3_ACCESS_KEY_ID",
    "OCI_S3_SECRET_ACCESS_KEY",
]
MARKER_FILE = "metrics.json"
CONTENT_TYPES = {".json": "application/json"}


def load_dotenv(path: Path) -> None:
    """Minimal KEY=VALUE .env reader; real env vars take precedence."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def s3_client():
    missing = [name for name in REQUIRED_ENV if not os.environ.get(name)]
    endpoint = os.environ.get("OCI_S3_ENDPOINT")
    if not endpoint and not os.environ.get("OCI_NAMESPACE"):
        missing.append("OCI_NAMESPACE (or OCI_S3_ENDPOINT)")
    if missing:
        sys.exit(f"missing env vars: {', '.join(missing)} - see .env.example")

    region = os.environ["OCI_REGION"]
    endpoint = endpoint or (
        f"https://{os.environ['OCI_NAMESPACE']}.compat.objectstorage."
        f"{region}.oraclecloud.com"
    )
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=os.environ["OCI_S3_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["OCI_S3_SECRET_ACCESS_KEY"],
        config=Config(
            # OCI's S3 compat API needs path-style addressing and rejects the
            # default CRC checksum headers newer botocore versions send.
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def local_versions(model_dir: Path) -> list[int]:
    return sorted(
        int(p.name[1:])
        for p in model_dir.glob("v*")
        if p.is_dir() and p.name[1:].isdigit()
    )


def remote_versions(s3, bucket: str, model_prefix: str) -> list[int]:
    versions = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=model_prefix, Delimiter="/"):
        for cp in page.get("CommonPrefixes", []):
            name = cp["Prefix"][len(model_prefix):].rstrip("/")
            if name.startswith("v") and name[1:].isdigit():
                versions.append(int(name[1:]))
    return sorted(versions)


def prefix_is_empty(s3, bucket: str, prefix: str) -> bool:
    resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
    return resp.get("KeyCount", 0) == 0


def remote_file_hashes(s3, bucket: str, version_prefix: str) -> dict | None:
    try:
        obj = s3.get_object(Bucket=bucket, Key=version_prefix + MARKER_FILE)
    except s3.exceptions.NoSuchKey:
        return None
    files = json.loads(obj["Body"].read()).get("files", {})
    return {name: meta.get("sha256") for name, meta in files.items()}


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--model", choices=["cnn", "rnn"], required=True)
    parser.add_argument(
        "--version", type=int, default=None,
        help="local export version to push (default: newest under --models-dir)",
    )
    parser.add_argument("--models-dir", type=Path, default=REPO_ROOT / "models")
    parser.add_argument(
        "--prefix", default="models", help="key prefix inside the bucket"
    )
    parser.add_argument(
        "--no-promote", action="store_true",
        help="upload the version but leave latest.json pointing at the old one",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / ".env")

    model_dir = args.models_dir / args.model
    available = local_versions(model_dir)
    if not available:
        sys.exit(
            f"no exported versions under {model_dir} - run "
            f"`python -m training.export --model {args.model}` first"
        )
    local_version = args.version if args.version is not None else available[-1]
    version_dir = model_dir / f"v{local_version}"
    if local_version not in available:
        sys.exit(f"{version_dir} does not exist (have: {available})")
    if not (version_dir / MARKER_FILE).exists():
        sys.exit(f"{version_dir} has no {MARKER_FILE} - re-run the export")

    files = sorted(
        p for p in version_dir.iterdir() if p.is_file() and p.name != MARKER_FILE
    )
    if not files:
        sys.exit(f"{version_dir} has no model files")

    s3 = s3_client()
    bucket = os.environ["OCI_BUCKET"]
    model_prefix = f"{args.prefix.strip('/')}/{args.model}/"

    existing = remote_versions(s3, bucket, model_prefix)
    target = max(existing, default=0) + 1
    target_prefix = f"{model_prefix}v{target}/"
    if not prefix_is_empty(s3, bucket, target_prefix):
        sys.exit(f"s3://{bucket}/{target_prefix} is not empty - refusing to overwrite")

    card = json.loads((version_dir / MARKER_FILE).read_text())
    card["version"] = target
    if target != local_version:
        card["local_version"] = local_version
    card["pushed_at"] = datetime.now(UTC).isoformat(timespec="seconds")
    card["files"] = {
        p.name: {"sha256": sha256_of(p), "size_bytes": p.stat().st_size}
        for p in files
    }

    if existing:
        latest_prefix = f"{model_prefix}v{existing[-1]}/"
        local_hashes = {name: meta["sha256"] for name, meta in card["files"].items()}
        if remote_file_hashes(s3, bucket, latest_prefix) == local_hashes:
            sys.exit(
                f"local v{local_version} is identical to remote v{existing[-1]} - "
                "nothing to push"
            )

    print(f"bucket:          {bucket}")
    print(f"remote versions: {existing or 'none'}")
    print(f"pushing local v{local_version} -> s3://{bucket}/{target_prefix}")
    for p in files:
        print(f"  {p.name} ({p.stat().st_size} bytes)")
    print(f"  {MARKER_FILE} (written last)")
    if not args.no_promote:
        print(f"latest.json -> v{target}")
    if args.dry_run:
        print("dry run - nothing uploaded")
        return

    for p in files:
        s3.upload_file(
            str(p), bucket, target_prefix + p.name,
            ExtraArgs={
                "ContentType": CONTENT_TYPES.get(p.suffix, "application/octet-stream")
            },
        )
    s3.put_object(
        Bucket=bucket,
        Key=target_prefix + MARKER_FILE,
        Body=json.dumps(card, indent=2).encode(),
        ContentType="application/json",
    )

    if not args.no_promote:
        pointer = {"version": target, "updated_at": card["pushed_at"]}
        s3.put_object(
            Bucket=bucket,
            Key=f"{model_prefix}latest.json",
            Body=json.dumps(pointer, indent=2).encode(),
            ContentType="application/json",
        )

    print(f"pushed {args.model} v{target}")


if __name__ == "__main__":
    main()
