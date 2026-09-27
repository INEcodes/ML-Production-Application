# syntax=docker/dockerfile:1
# Serving image only - no training code or training deps. CI builds it multi-arch
# (linux/amd64 for E2.1.Micro, linux/arm64 for Ampere A1).

FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
COPY requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install -r /tmp/requirements.txt


FROM python:3.12-slim
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MODEL_CACHE_DIR=/var/cache/models

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /var/cache/models \
    && chown app:app /var/cache/models

COPY --from=builder /opt/venv /opt/venv
WORKDIR /srv
COPY app ./app

USER app
EXPOSE 8000

# Generous start period: the first boot downloads the model from Object Storage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "*"]
