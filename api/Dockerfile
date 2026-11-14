FROM python:3.12-slim
ARG WITH_LOCAL_STT=0
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt requirements-local.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    if [ "$WITH_LOCAL_STT" = "1" ]; then pip install --no-cache-dir -r requirements-local.txt; fi
COPY app ./app
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
