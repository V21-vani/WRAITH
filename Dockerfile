FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies only (no GPU libs in the server image)
COPY requirements.txt .
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic openenv-core requests

# Copy environment files
COPY env.py models.py profiler.py reward.py combos.py combo_selector.py policy.py app.py ./

# Static game assets (served separately, but keep for local testing)
COPY game.js index.html* ./

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
