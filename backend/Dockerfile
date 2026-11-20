# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv

# Dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts

# Run as an unprivileged user.
RUN useradd --system --uid 10001 --no-create-home quickpick
USER quickpick

# Cloud Run injects PORT; default 8080 for local use.
ENV PORT=8080
EXPOSE 8080

# exec so uvicorn is PID 1 and receives SIGTERM from Cloud Run.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
