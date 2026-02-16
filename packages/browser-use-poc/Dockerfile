FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install browser-use (Official PyPI)
RUN pip install browser-use langchain-openai langchain-anthropic playwright

# Install Playwright browsers
RUN python -m playwright install --with-deps chromium

COPY demo.py .

CMD ["python", "demo.py"]
