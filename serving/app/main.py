"""FastAPI app: GET /health, GET /version, POST /predict.

One container serves one model (MODEL_NAME), loaded once at startup. If loading
fails the process exits and Docker's restart policy retries it.
"""

import base64
import binascii
import json
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request

from .inference import InvalidInput, Predictor
from .model_loader import load_artifact
from .schemas import HealthResponse, PredictRequest, PredictResponse, VersionResponse

_STD_ATTRS = set(vars(logging.makeLogRecord({})))


class JsonFormatter(logging.Formatter):
    """One JSON object per line; anything passed via `extra=` becomes a field."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        payload.update({k: v for k, v in vars(record).items() if k not in _STD_ATTRS})
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())


_configure_logging()
log = logging.getLogger("serving")


@asynccontextmanager
async def lifespan(app: FastAPI):
    started = time.perf_counter()
    artifact = load_artifact()
    app.state.predictor = Predictor(artifact)
    log.info(
        "model loaded",
        extra={
            "model_name": artifact.name,
            "model_version": artifact.version,
            "startup_ms": round((time.perf_counter() - started) * 1000, 1),
        },
    )
    yield


app = FastAPI(
    title="ML serving API",
    lifespan=lifespan,
    # Set when served behind a path prefix (nginx /cnn/ -> this container) so /docs works.
    root_path=os.environ.get("ROOT_PATH", ""),
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    started = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        predictor = getattr(request.app.state, "predictor", None)
        log.info(
            "request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": status,
                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                "model_name": getattr(predictor, "name", None),
                "model_version": getattr(predictor, "version", None),
            },
        )


def _predictor(request: Request) -> Predictor:
    return request.app.state.predictor


@app.get("/health", response_model=HealthResponse)
def health(request: Request):
    p = _predictor(request)
    return HealthResponse(status="ok", model_name=p.name, model_version=p.version)


@app.get("/version", response_model=VersionResponse)
def version(request: Request):
    p = _predictor(request)
    return VersionResponse(
        model_name=p.name,
        model_version=p.version,
        input_type=p.input_type,
        labels=p.labels,
        git_commit=p.card.get("git_commit"),
        pushed_at=p.card.get("pushed_at"),
        test_metrics=p.card.get("test_metrics"),
        image_tag=os.environ.get("IMAGE_TAG"),
    )


def _decode_image(value: str) -> bytes:
    if value.startswith("data:") and "," in value:
        value = value.split(",", 1)[1]
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(422, f"image_base64 is not valid base64: {e}") from e


# Plain `def`: torch inference is CPU-bound, so FastAPI runs it in its threadpool
# instead of blocking the event loop.
@app.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest, request: Request):
    p = _predictor(request)
    try:
        if p.input_type == "image":
            if body.image_base64 is None:
                raise HTTPException(422, f"model '{p.name}' expects 'image_base64'")
            x = p.preprocess(_decode_image(body.image_base64))
        else:
            if body.text is None:
                raise HTTPException(422, f"model '{p.name}' expects 'text'")
            x = p.preprocess(body.text)
    except InvalidInput as e:
        raise HTTPException(422, str(e)) from e
    return p.predict(x)
