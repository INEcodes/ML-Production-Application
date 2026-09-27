import pytest
from conftest import CNN_LABELS, RNN_LABELS


def test_health_reports_latest_version(cnn_client):
    r = cnn_client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "model_name": "cnn", "model_version": 2}


def test_version_endpoint(cnn_client):
    body = cnn_client.get("/version").json()
    assert body["model_version"] == 2
    assert body["input_type"] == "image"
    assert body["git_commit"] == "abc123"
    assert body["labels"] == CNN_LABELS


def test_pinned_version_is_loaded(monkeypatch, model_root):
    from conftest import _client

    with _client(monkeypatch, model_root, "cnn", version="v1") as c:
        assert c.get("/health").json()["model_version"] == 1


def test_predict_image(cnn_client, png_b64):
    r = cnn_client.post("/predict", json={"image_base64": png_b64})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["label"] in CNN_LABELS
    assert body["label"] == CNN_LABELS[body["class_index"]]
    assert set(body["probabilities"]) == set(CNN_LABELS)
    assert sum(body["probabilities"].values()) == pytest.approx(1.0, abs=1e-4)
    assert 0.0 <= body["confidence"] <= 1.0


def test_predict_image_data_url(cnn_client, png_b64):
    r = cnn_client.post("/predict", json={"image_base64": "data:image/png;base64," + png_b64})
    assert r.status_code == 200, r.text


def test_predict_text(rnn_client):
    r = rnn_client.post("/predict", json={"text": "Stocks rallied, the team WON!"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["model_name"] == "rnn"
    assert body["label"] in RNN_LABELS
    assert len(body["probabilities"]) == len(RNN_LABELS)


def test_long_text_is_truncated_not_rejected(rnn_client):
    r = rnn_client.post("/predict", json={"text": "stocks " * 500})
    assert r.status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"text": "hello", "image_base64": "aGk="},
        {"text": ""},
        {"text": "hi", "unexpected": 1},
    ],
)
def test_request_validation(rnn_client, payload):
    assert rnn_client.post("/predict", json=payload).status_code == 422


# Separate tests: both clients wrap the same module-level app, so only one can be live.
def test_text_sent_to_image_model(cnn_client):
    assert cnn_client.post("/predict", json={"text": "hello"}).status_code == 422


def test_image_sent_to_text_model(rnn_client, png_b64):
    assert rnn_client.post("/predict", json={"image_base64": png_b64}).status_code == 422


def test_text_without_tokens(rnn_client):
    r = rnn_client.post("/predict", json={"text": "!!! ???"})
    assert r.status_code == 422
    assert "no tokens" in r.json()["detail"]


@pytest.mark.parametrize("bad", ["not base64 !!", "aGVsbG8gd29ybGQ="])  # 2nd = "hello world"
def test_bad_image(cnn_client, bad):
    assert cnn_client.post("/predict", json={"image_base64": bad}).status_code == 422


def test_request_id_is_echoed_or_generated(cnn_client):
    echoed = cnn_client.get("/health", headers={"X-Request-ID": "abc"})
    assert echoed.headers["x-request-id"] == "abc"
    assert len(cnn_client.get("/health").headers["x-request-id"]) == 32
