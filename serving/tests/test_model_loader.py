import hashlib
import io
import json
import shutil

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError

from app.model_loader import ModelLoadError, load_artifact, parse_version


class FakeS3:
    """In-memory stand-in for the two boto3 S3 calls the loader makes."""

    def __init__(self, objects: dict[str, bytes], fail_all: bool = False):
        self.objects = objects
        self.fail_all = fail_all
        self.downloads: list[str] = []

    def get_object(self, Bucket, Key):
        if self.fail_all:
            raise EndpointConnectionError(endpoint_url="https://oci.example")
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": io.BytesIO(self.objects[Key])}

    def download_file(self, Bucket, Key, Filename):
        self.downloads.append(Key)
        with open(Filename, "wb") as f:
            f.write(self.objects[Key])


def bucket_from(model_root, name="cnn", versions=(1, 2), latest=2) -> dict[str, bytes]:
    """Mirror what scripts/push_model.py uploads, including the sha256 manifest."""
    objects = {}
    for v in versions:
        vdir = model_root / name / f"v{v}"
        card = json.loads((vdir / "metrics.json").read_text())
        card["files"] = {}
        for p in vdir.iterdir():
            if p.name == "metrics.json":
                continue
            data = p.read_bytes()
            objects[f"models/{name}/v{v}/{p.name}"] = data
            card["files"][p.name] = {"sha256": hashlib.sha256(data).hexdigest(),
                                     "size_bytes": len(data)}
        objects[f"models/{name}/v{v}/metrics.json"] = json.dumps(card).encode()
    objects[f"models/{name}/latest.json"] = json.dumps({"version": latest}).encode()
    return objects


def env(tmp_path, version="latest"):
    return {"MODEL_NAME": "cnn", "MODEL_VERSION": version, "OCI_BUCKET": "b",
            "MODEL_CACHE_DIR": str(tmp_path / "cache")}


@pytest.mark.parametrize("raw,expected", [(None, None), ("latest", None), ("", None),
                                          ("3", 3), ("v3", 3), (" V12 ", 12)])
def test_parse_version(raw, expected):
    assert parse_version(raw) == expected


@pytest.mark.parametrize("raw", ["three", "v", "1.2", "-1"])
def test_parse_version_rejects_garbage(raw):
    with pytest.raises(ModelLoadError):
        parse_version(raw)


def test_resolves_latest_downloads_and_verifies(tmp_path, model_root):
    s3 = FakeS3(bucket_from(model_root))
    art = load_artifact(env(tmp_path), s3=s3)
    assert art.version == 2
    assert (art.path / "model.pt").exists()
    assert "files" in art.card
    assert s3.downloads == ["models/cnn/v2/model.pt"]


def test_pinned_version(tmp_path, model_root):
    art = load_artifact(env(tmp_path, "1"), s3=FakeS3(bucket_from(model_root)))
    assert art.version == 1


def test_cache_is_reused(tmp_path, model_root):
    load_artifact(env(tmp_path, "2"), s3=FakeS3(bucket_from(model_root)))
    s3 = FakeS3(bucket_from(model_root))
    load_artifact(env(tmp_path, "2"), s3=s3)
    assert s3.downloads == []


def test_pinned_cached_version_needs_no_network(tmp_path, model_root):
    load_artifact(env(tmp_path, "2"), s3=FakeS3(bucket_from(model_root)))
    art = load_artifact(env(tmp_path, "2"), s3=FakeS3({}, fail_all=True))
    assert art.version == 2


def test_latest_falls_back_to_cache_when_storage_is_down(tmp_path, model_root):
    load_artifact(env(tmp_path, "1"), s3=FakeS3(bucket_from(model_root)))
    art = load_artifact(env(tmp_path), s3=FakeS3({}, fail_all=True))
    assert art.version == 1


def test_latest_with_no_cache_and_storage_down_fails(tmp_path):
    with pytest.raises(ModelLoadError, match="cannot resolve latest"):
        load_artifact(env(tmp_path), s3=FakeS3({}, fail_all=True))


def test_corrupted_cache_is_redownloaded(tmp_path, model_root):
    art = load_artifact(env(tmp_path, "2"), s3=FakeS3(bucket_from(model_root)))
    (art.path / "model.pt").write_bytes(b"corrupt")
    s3 = FakeS3(bucket_from(model_root))
    load_artifact(env(tmp_path, "2"), s3=s3)
    assert s3.downloads == ["models/cnn/v2/model.pt"]


def test_checksum_mismatch_is_rejected(tmp_path, model_root):
    objects = bucket_from(model_root)
    objects["models/cnn/v2/model.pt"] = b"tampered"
    with pytest.raises(ModelLoadError, match="sha256 mismatch"):
        load_artifact(env(tmp_path, "2"), s3=FakeS3(objects))
    assert not (tmp_path / "cache" / "cnn" / "v2" / "metrics.json").exists()


def test_missing_version(tmp_path, model_root):
    with pytest.raises(ModelLoadError, match="does not exist"):
        load_artifact(env(tmp_path, "9"), s3=FakeS3(bucket_from(model_root)))


def test_incomplete_push_is_rejected(tmp_path, model_root):
    objects = bucket_from(model_root)
    del objects["models/cnn/v2/metrics.json"]  # push died before the marker
    with pytest.raises(ModelLoadError, match="did not finish"):
        load_artifact(env(tmp_path, "2"), s3=FakeS3(objects))


def test_nothing_pushed_yet(tmp_path):
    with pytest.raises(ModelLoadError, match="push a model first"):
        load_artifact(env(tmp_path), s3=FakeS3({}))


def test_local_dir_skips_incomplete_versions(tmp_path, model_root):
    root = tmp_path / "local"
    shutil.copytree(model_root / "cnn", root / "cnn")
    (root / "cnn" / "v2" / "metrics.json").unlink()
    art = load_artifact({"MODEL_NAME": "cnn", "MODEL_LOCAL_DIR": str(root)})
    assert art.version == 1


def test_missing_credentials_message(tmp_path):
    with pytest.raises(ModelLoadError, match="OCI_S3_ACCESS_KEY_ID"):
        load_artifact({"MODEL_NAME": "cnn", "OCI_BUCKET": "b", "OCI_REGION": "r",
                       "OCI_NAMESPACE": "n"})
