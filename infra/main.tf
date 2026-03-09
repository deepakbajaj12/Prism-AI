terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── Variables ─────────────────────────────────────────────────────────────────
variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Deployment region"
  type        = string
  default     = "us-central1"
}

variable "gemini_api_key" {
  description = "Gemini API Key (stored in Secret Manager)"
  type        = string
  sensitive   = true
}

# ── Artifact Registry ─────────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "prism" {
  location      = var.region
  repository_id = "prism-ai"
  description   = "Prism AI Docker images"
  format        = "DOCKER"
}

# ── Secret Manager ────────────────────────────────────────────────────────────
resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "gemini-api-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "gemini_api_key_v1" {
  secret      = google_secret_manager_secret.gemini_api_key.id
  secret_data = var.gemini_api_key
}

# ── Cloud Run service account ─────────────────────────────────────────────────
resource "google_service_account" "prism_runner" {
  account_id   = "prism-ai-runner"
  display_name = "Prism AI Cloud Run SA"
}

resource "google_secret_manager_secret_iam_member" "runner_secret_access" {
  secret_id = google_secret_manager_secret.gemini_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.prism_runner.email}"
}

# ── Cloud Run service ─────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "prism_ai" {
  name     = "prism-ai"
  location = var.region

  template {
    service_account = google_service_account.prism_runner.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/prism-ai/prism-ai:latest"

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      startup_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 5
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.runner_secret_access,
  ]
}

# ── Public access ─────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  location = google_cloud_run_v2_service.prism_ai.location
  name     = google_cloud_run_v2_service.prism_ai.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Outputs ───────────────────────────────────────────────────────────────────
output "service_url" {
  description = "Prism AI live URL"
  value       = google_cloud_run_v2_service.prism_ai.uri
}

output "image_registry" {
  description = "Artifact Registry path for Docker pushes"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/prism-ai/prism-ai"
}
