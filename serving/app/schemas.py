"""Pydantic request/response models for the serving API."""

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ~6 MB of base64 ~= 4.5 MB of image bytes; the CNN only needs 32x32 anyway.
MAX_IMAGE_BASE64_CHARS = 6_000_000
MAX_TEXT_CHARS = 10_000


class _Model(BaseModel):
    # Fields named model_* are intentional here, not pydantic internals.
    model_config = ConfigDict(protected_namespaces=())


class PredictRequest(_Model):
    """Exactly one of `text` (RNN) or `image_base64` (CNN)."""

    model_config = ConfigDict(
        protected_namespaces=(),
        extra="forbid",
        json_schema_extra={
            "examples": [{"text": "Stocks rallied after the central bank held rates."}]
        },
    )

    text: str | None = Field(None, min_length=1, max_length=MAX_TEXT_CHARS)
    image_base64: str | None = Field(
        None,
        min_length=1,
        max_length=MAX_IMAGE_BASE64_CHARS,
        description="PNG/JPEG bytes, base64-encoded (a data: URL prefix is accepted)",
    )

    @model_validator(mode="after")
    def exactly_one_input(self):
        if (self.text is None) == (self.image_base64 is None):
            raise ValueError("provide exactly one of 'text' or 'image_base64'")
        return self


class PredictResponse(_Model):
    model_name: str
    model_version: int
    label: str
    class_index: int
    confidence: float
    probabilities: dict[str, float]


class HealthResponse(_Model):
    status: str
    model_name: str
    model_version: int


class VersionResponse(_Model):
    model_name: str
    model_version: int
    input_type: str
    labels: list[str]
    git_commit: str | None = None
    pushed_at: str | None = None
    test_metrics: dict | None = None
    image_tag: str | None = None
