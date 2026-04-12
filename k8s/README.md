# GeoTrack — Kubernetes Manifests

Kubernetes configuration cho GeoTrack platform, sử dụng [Kustomize](https://kustomize.io/) để quản lý multi-environment.

## Directory Structure

```
k8s/
├── base/                          ← Single source of truth (shared across all envs)
│   ├── kustomization.yaml         ← Orchestrator — gom tất cả files, inject namespace + labels
│   ├── namespace.yaml             ← Namespace: geotrack
│   ├── serviceaccount.yaml        ← RBAC identity cho pods
│   ├── configmap.yaml             ← Non-sensitive env vars (NODE_ENV, PORT, LOG_LEVEL...)
│   ├── secret.yaml                ← Sensitive env vars — TEMPLATE ONLY, dùng sealed-secrets in prod
│   ├── deployment.yaml            ← 2 Deployments: geotrack-api + geotrack-worker
│   ├── service.yaml               ← ClusterIP Service: port 80 → pod port 3000
│   └── hpa.yaml                   ← Horizontal Pod Autoscaler (CPU/memory-based scaling)
└── overlays/
    ├── staging/
    │   └── kustomization.yaml     ← Patches base: lower resources, debug logging
    └── production/
        └── kustomization.yaml     ← Patches base: higher resources, stricter scaling
```

## Architecture Diagram

```
                    kustomization.yaml
                    (orchestrates all files)
                            │
        ┌───────────────────┼───────────────────────┐
        │                   │                       │
        ▼                   ▼                       ▼
   ┌─────────┐     ┌──────────────┐          ┌──────────┐
   │Namespace│     │ ServiceAccount│          │ ConfigMap │
   │geotrack │     │ geotrack     │          │ + Secret  │
   └────┬────┘     └──────┬───────┘          └─────┬─────┘
        │                 │                        │
        │      ┌──────────┴─── envFrom ────────────┘
        │      │          │
        ▼      ▼          ▼
   ┌────────────────────────────────────────┐
   │         deployment.yaml                │
   │  ┌──────────────┐ ┌─────────────────┐  │
   │  │ geotrack-api │ │ geotrack-worker │  │
   │  │ replicas: 2  │ │ replicas: 1     │  │
   │  │ RollingUpdate│ │ Recreate        │  │
   │  └──────┬───────┘ └─────────────────┘  │
   └─────────┼──────────────────────────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌─────────┐     ┌──────────┐
│ Service │     │   HPA    │
│ :80→3000│     │ 2→10 pods│
│ ClusterIP│    │ CPU: 70% │
└─────────┘     └──────────┘
```

## File Reference Map

| File | Resource | References | Referenced By |
|------|----------|------------|---------------|
| `namespace.yaml` | `Namespace: geotrack` | — | All resources (live in this namespace) |
| `serviceaccount.yaml` | `ServiceAccount: geotrack` | Namespace | Deployment (`serviceAccountName`) |
| `configmap.yaml` | `ConfigMap: geotrack-config` | Namespace | Deployment (`envFrom.configMapRef`) |
| `secret.yaml` | `Secret: geotrack-secrets` | Namespace | Deployment (`envFrom.secretRef`) |
| `deployment.yaml` | `Deployment: geotrack-api` | SA, ConfigMap, Secret | Service (via pod labels), HPA |
| `deployment.yaml` | `Deployment: geotrack-worker` | SA, ConfigMap, Secret | — (no Service, background process) |
| `service.yaml` | `Service: geotrack-api` | Pods with label `geotrack-api` | Ingress (external), other services (internal) |
| `hpa.yaml` | `HPA: geotrack-api-hpa` | Deployment `geotrack-api` | — |

## Environment Comparison

| Dimension | Base | Staging | Production |
|-----------|------|---------|------------|
| API Replicas | 2 | 1 | 3 |
| HPA Range | 2–10 | 1–3 | 3–20 |
| CPU request/limit | 250m / 1000m | 100m / 500m | 500m / 2000m |
| Memory request/limit | 256Mi / 512Mi | 128Mi / 256Mi | 512Mi / 1Gi |
| NODE_ENV | production | staging | production |
| LOG_LEVEL | info | debug | warn |
| Name Prefix | — | `staging-` | — |

## Quick Start

### Prerequisites

- `kubectl` — Kubernetes CLI
- `kustomize` — Configuration management (or use `kubectl -k`)
- A running cluster (minikube for local, EKS/GKE for cloud)

### Preview (dry-run)

```bash
# Preview generated YAML without applying
kustomize build k8s/base

# Preview staging overlay
kustomize build k8s/overlays/staging

# Validate against cluster (dry-run)
kustomize build k8s/base | kubectl apply --dry-run=client -f -
```

### Deploy

```bash
# Apply base
kubectl apply -k k8s/base

# Apply staging overlay
kubectl apply -k k8s/overlays/staging

# Apply production overlay
kubectl apply -k k8s/overlays/production
```

### Verify

```bash
# Check all resources
kubectl get all -n geotrack

# Watch pods in real time
kubectl get pods -n geotrack -w

# Verify env vars
kubectl exec -n geotrack deployment/geotrack-api -- env | sort

# Access API locally (port-forward)
kubectl port-forward -n geotrack service/geotrack-api 8080:80
# → http://localhost:8080/api/v1/health
```

### Debug

```bash
# Logs
kubectl logs -n geotrack deployment/geotrack-api --follow
kubectl logs -n geotrack <pod-name> --previous         # crash logs

# Describe (events, probe status, errors)
kubectl describe pod -n geotrack <pod-name>
kubectl describe deployment -n geotrack geotrack-api

# Shell into pod
kubectl exec -it -n geotrack deployment/geotrack-api -- /bin/sh

# Events (sorted by time)
kubectl get events -n geotrack --sort-by='.lastTimestamp'

# Rollback
kubectl rollout undo deployment/geotrack-api -n geotrack
```

## Design Decisions

### Why Kustomize over Helm?
Pure YAML, no templating language. Base defines shared truth, overlays apply targeted patches. Reviewers read 5-line patches, not diff 100-line templated files.

### Why `Recreate` strategy for worker?
The worker runs an outbox relay. Running two instances simultaneously causes duplicate event publishing — a **correctness bug**. `Recreate` ensures only one instance runs at any time.

### Why no Service for worker?
The worker is a background processor (outbox relay), not an HTTP server. It doesn't receive inbound traffic, so a Service is unnecessary.

### Why `maxUnavailable: 0` for API?
Zero-downtime deploys. During rollout, K8s creates a new pod first, waits for readiness, then kills an old one. No user impact.

## Secrets Management

> ⚠️ `secret.yaml` contains `CHANGE_ME` placeholders. **Never commit real secrets to Git.**

For production, use one of:
- **[Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)** — encrypt secrets, safe to commit
- **[External Secrets Operator](https://external-secrets.io/)** — sync from AWS Secrets Manager / Vault
- **[SOPS](https://github.com/getsops/sops)** — file-level encryption
