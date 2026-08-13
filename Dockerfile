FROM mcr.microsoft.com/playwright/python:v1.61.0-noble

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium

COPY app.py scraper.py ./
COPY templates ./templates
COPY static ./static

EXPOSE 8000

CMD ["sh", "-c", "gunicorn app:app --workers 1 --worker-class gthread --threads 4 --timeout 120 --bind 0.0.0.0:${PORT:-8000}"]
