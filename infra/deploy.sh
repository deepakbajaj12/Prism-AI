#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prism AI — Google Cloud Run Deployment Script
# Usage: ./infra/deploy.sh [PROJECT_ID] [REGION]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${2:-us-central1}"
SERVICE_NAME="prism-ai"
REPO_NAME="prism-ai"
IMAGE_TAG="latest"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID is required. Pass it as \$1 or set gcloud default project."
  exit 1
fi

echo "▶  Project : $PROJECT_ID"
echo "▶  Region  : $REGION"
echo "▶  Image   : $IMAGE"
echo ""

# 1. Enable required APIs
echo "── Enabling APIs ─────────────────────────────────────────────────────────"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT_ID"

# 2. Create Artifact Registry repository (idempotent)
echo ""
echo "── Creating Artifact Registry repository ─────────────────────────────────"
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Prism AI container images" \
  --project="$PROJECT_ID" \
  2>/dev/null || echo "   (repository already exists — skipping)"

# 3. Configure Docker auth
echo ""
echo "── Configuring Docker auth ───────────────────────────────────────────────"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# 4. Build and push the container image
echo ""
echo "── Building & pushing Docker image ──────────────────────────────────────"
docker build -t "$IMAGE" "$(dirname "$0")/.."
docker push "$IMAGE"

# 5. Store Gemini API key in Secret Manager (skip if already exists)
echo ""
echo "── Secret Manager: gemini-api-key ───────────────────────────────────────"
if ! gcloud secrets describe gemini-api-key --project="$PROJECT_ID" &>/dev/null; then
  if [[ -z "${GEMINI_API_KEY:-}" ]]; then
    echo "   GEMINI_API_KEY env var not set. Skipping secret creation."
    echo "   Create it manually:  gcloud secrets create gemini-api-key --data-file=- <<< 'YOUR_KEY'"
  else
    echo -n "$GEMINI_API_KEY" | \
      gcloud secrets create gemini-api-key \
        --data-file=- \
        --project="$PROJECT_ID"
    echo "   Secret created."
  fi
else
  echo "   Secret already exists — skipping."
fi

# 6. Deploy to Cloud Run
echo ""
echo "── Deploying to Cloud Run ────────────────────────────────────────────────"
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
  --project="$PROJECT_ID"

echo ""
echo "✅  Deployment complete!"
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.url)")
echo "🌐  Live URL: $SERVICE_URL"
