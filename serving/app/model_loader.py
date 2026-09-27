"""Resolve and fetch the MODEL_VERSION-pinned model artifact once, at startup.

Sources, in order of precedence:
  - MODEL_LOCAL_DIR: a directory laid out like the bucket (<dir>/<name>/v{n}/).
    For tests and local runs without credentials; nothing is downloaded.
  - OCI Object Storage via its S3-compatible API (the production path), using the
    layout scripts/push_model.py writes:
        models/<name>/v{n}/{model.pt, vocab.json?, metrics.json}
        models/<name>/latest.json   -> {"version": n}

Downloads land in MODEL_CACHE_DIR/<name>/v{n}/ and are sha256-checked against the
"files" manifest in metrics.json. A cached, verified version is reused without
touching the network, so restarts are fast and survive an Object Storage outage.
"""

import hashlib
import json
import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

MARKER_FILE = "metrics.json"
DEFAULT_CACHE_DIR = "/var/cache/models"

log = logging.getLogger(__name__)


class ModelLoadError(RuntimeError):
    pass


@dataclass(frozen=True)
class ModelArtifact:
    name: str
    version: int
    path: Path
    card: dict


def parse_version(value: str | None) -> int | None:
    """'latest'/'' -> None, '3' or 'v3' -> 3."""
    v = (value or "latest").strip().lower()
    if v == "latest":
        return None
    v = v.removeprefix("v")
    if not v.isdigit():
        raise ModelLoadError(f"invalid MODEL_VERSION {value!r}: use 'latest', 'N' or 'vN'")
    return int(v)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _versions_in(model_dir: Path) -> list[int]:
    return sorted(
        int(p.name[1:])
        for p in model_dir.glob("v*")
        if p.name[1:].isdigit() and (p / MARKER_FILE).exists()
    )


def _read_card(version_dir: Path) -> dict:
    return json.loads((version_dir / MARKER_FILE).read_text())


def _is_verified(version_dir: Path) -> bool:
    if not (version_dir / MARKER_FILE).exists():
        return False
    files = _read_card(version_dir).get("files", {})
    return all(
        (version_dir / name).exists() and _sha256(version_dir / name) == meta["sha256"]
        for name, meta in files.items()
    )


def load_from_local_dir(root: Path, name: str, version: int | None) -> ModelArtifact:
    model_dir = root / name
    available = _versions_in(model_dir)
    if not available:
        raise ModelLoadError(f"no complete versions of {name!r} under {model_dir}")
    version = available[-1] if version is None else version
    if version not in available:
        raise ModelLoadError(f"{name} v{version} not found under {model_dir} (have {available})")
    version_dir = model_dir / f"v{version}"
    return ModelArtifact(name, version, version_dir, _read_card(version_dir))


def make_s3_client(env: Mapping[str, str]):
    import boto3
    from botocore.config import Config

    required = ["OCI_REGION", "OCI_BUCKET", "OCI_S3_ACCESS_KEY_ID", "OCI_S3_SECRET_ACCESS_KEY"]
    missing = [k for k in required if not env.get(k)]
    endpoint = env.get("OCI_S3_ENDPOINT")
    if not endpoint and not env.get("OCI_NAMESPACE"):
        missing.append("OCI_NAMESPACE (or OCI_S3_ENDPOINT)")
    if missing:
        raise ModelLoadError(f"missing env vars for Object Storage: {', '.join(missing)}")

    region = env["OCI_REGION"]
    endpoint = endpoint or (
        f"https://{env['OCI_NAMESPACE']}.compat.objectstorage.{region}.oraclecloud.com"
    )
    # Same client settings as scripts/push_model.py: OCI's S3 compat API needs
    # path-style addressing and rejects botocore's default CRC checksum headers.
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=env["OCI_S3_ACCESS_KEY_ID"],
        aws_secret_access_key=env["OCI_S3_SECRET_ACCESS_KEY"],
        config=Config(
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            retries={"max_attempts": 5, "mode": "standard"},
            connect_timeout=10,
            read_timeout=60,
        ),
    )


def _get_json(s3, bucket: str, key: str) -> dict | None:
    from botocore.exceptions import ClientError

    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            return None
        raise
    return json.loads(obj["Body"].read())


def load_from_object_storage(
    s3, bucket: str, prefix: str, name: str, version: int | None, cache_root: Path
) -> ModelArtifact:
    model_prefix = f"{prefix.strip('/')}/{name}/"
    cache_model_dir = cache_root / name

    if version is None:
        try:
            pointer = _get_json(s3, bucket, model_prefix + "latest.json")
        except Exception as e:  # network/auth failure: fall back to what's cached
            cached = [v for v in _versions_in(cache_model_dir)
                      if _is_verified(cache_model_dir / f"v{v}")]
            if not cached:
                raise ModelLoadError(f"cannot resolve latest {name}: {e}") from e
            log.warning("latest.json unreachable, using cached version",
                        extra={"model_version": cached[-1], "error": str(e)})
            version = cached[-1]
        else:
            if pointer is None:
                raise ModelLoadError(
                    f"s3://{bucket}/{model_prefix}latest.json not found - push a model first"
                )
            version = int(pointer["version"])

    version_dir = cache_model_dir / f"v{version}"
    if _is_verified(version_dir):
        log.info("using cached model", extra={"model_name": name, "model_version": version})
        return ModelArtifact(name, version, version_dir, _read_card(version_dir))

    version_prefix = f"{model_prefix}v{version}/"
    card = _get_json(s3, bucket, version_prefix + MARKER_FILE)
    if card is None:
        raise ModelLoadError(
            f"s3://{bucket}/{version_prefix}{MARKER_FILE} not found - "
            f"{name} v{version} does not exist or its push did not finish"
        )
    files = card.get("files")
    if not files:
        raise ModelLoadError(f"{name} v{version} metrics.json has no 'files' manifest")

    version_dir.mkdir(parents=True, exist_ok=True)
    (version_dir / MARKER_FILE).unlink(missing_ok=True)  # marker goes back last
    for file_name, meta in files.items():
        dest = version_dir / file_name
        tmp = dest.with_name(dest.name + ".part")
        log.info("downloading", extra={"key": version_prefix + file_name,
                                       "size_bytes": meta.get("size_bytes")})
        s3.download_file(bucket, version_prefix + file_name, str(tmp))
        digest = _sha256(tmp)
        if digest != meta["sha256"]:
            tmp.unlink(missing_ok=True)
            raise ModelLoadError(
                f"sha256 mismatch for {file_name}: expected {meta['sha256']}, got {digest}"
            )
        tmp.replace(dest)
    (version_dir / MARKER_FILE).write_text(json.dumps(card, indent=2))
    return ModelArtifact(name, version, version_dir, card)


def load_artifact(env: Mapping[str, str] | None = None, s3=None) -> ModelArtifact:
    env = os.environ if env is None else env
    name = env.get("MODEL_NAME")
    if not name:
        raise ModelLoadError("MODEL_NAME is not set (e.g. 'cnn' or 'rnn')")
    version = parse_version(env.get("MODEL_VERSION"))

    if env.get("MODEL_LOCAL_DIR"):
        return load_from_local_dir(Path(env["MODEL_LOCAL_DIR"]), name, version)

    s3 = s3 or make_s3_client(env)
    return load_from_object_storage(
        s3,
        bucket=env["OCI_BUCKET"],
        prefix=env.get("OCI_MODELS_PREFIX", "models"),
        name=name,
        version=version,
        cache_root=Path(env.get("MODEL_CACHE_DIR", DEFAULT_CACHE_DIR)),
    )
