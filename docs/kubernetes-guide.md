# GeoTrack — Zero → Advanced → Production Kubernetes Guide

> **Who this is for:** A full-stack Node.js/TypeScript engineer who understands Docker but has never properly operated Kubernetes.
> **Goal:** After reading this, you can run GeoTrack locally, debug it confidently, deploy to EKS/GKE, and design production-grade K8s architecture.

---

## Table of Contents

- [Phase 1 — Kubernetes Fundamentals (Mental Model First)](#phase-1--kubernetes-fundamentals-mental-model-first)
- [Phase 2 — Mapping Your GeoTrack k8s Structure](#phase-2--mapping-your-geotrack-k8s-structure)
- [Phase 3 — Hands-On Local Setup](#phase-3--hands-on-local-setup)
- [Phase 4 — Deep Dive (Scaling Systems)](#phase-4--deep-dive-scaling-systems)
- [Phase 5 — Production Architecture Thinking](#phase-5--production-architecture-thinking)
- [Phase 6 — Deploy to Cloud](#phase-6--deploy-to-cloud)
- [Phase 7 — Advanced / Principal Engineer Level](#phase-7--advanced--principal-engineer-level)
- [Appendix — Checklists & Reference](#appendix--checklists--reference)

---

# Phase 1 — Kubernetes Fundamentals (Mental Model First)

## 1.1 What Is Kubernetes Actually Solving?

You already know Docker. Docker solves: *"how do I run this app in a reproducible container?"*

Kubernetes solves: *"how do I run 10 copies of this app, restart them when they die, route traffic to the healthy ones, update them without downtime, and do all of this across 50 different machines?"*

**The real problem Kubernetes solves is not containers — it's operating a distributed system at scale.**

Think of it this way:

```
DOCKER COMPOSE                    KUBERNETES
──────────────                    ──────────
Single machine                    Many machines (nodes)
Manual restarts                   Self-healing (restarts broken pods)
No traffic management             Built-in service discovery + load balancing
No rolling updates                Zero-downtime deployments built-in
You manage "where to run"         Scheduler decides optimal placement
Config = local docker-compose.yml Config = desired state stored in API
```

**The core mental model:** Kubernetes is a **desired state machine**.

You tell Kubernetes: *"I want 3 replicas of my API running, with at least 256MB RAM each, accessible on port 80."*

Kubernetes continuously watches the real world and drives it toward that desired state. Pod crashes? It creates a new one. Node loses power? It reschedules pods elsewhere. This is the loop that makes Kubernetes powerful.

```
You declare:          K8s observes:          K8s acts:
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│ spec:         │────▶│ actual: 1    │────▶│ CREATE 2 more pods   │
│   replicas: 3│     │   running    │     │ until actual == spec  │
└──────────────┘     └──────────────┘     └──────────────────────┘
              ↑___________reconciliation loop___________↑
```

## 1.2 Docker Compose vs Kubernetes — Side-by-Side

| Concern                  | Docker Compose                     | Kubernetes                              |
|--------------------------|------------------------------------|-----------------------------------------|
| Define a service         | `services.api` in compose.yml      | `Deployment` manifest                   |
| Environment variables    | `environment:` block               | `ConfigMap` + `Secret`                  |
| Port mapping             | `ports: - "3000:3000"`             | `Service` (ClusterIP/NodePort/LB)       |
| Scaling                  | `docker compose scale api=3`       | `replicas: 3` or HPA (auto)            |
| Health checks            | `healthcheck:`                     | `readinessProbe` + `livenessProbe`      |
| Volumes / persistent data| `volumes:`                         | `PersistentVolumeClaim`                 |
| Multiple environments    | Multiple compose files             | Kustomize overlays                      |
| Updates                  | Re-run compose up                  | Rolling update strategy                 |
| Multi-machine            | Docker Swarm (limited)             | Native, Kubernetes core feature         |

## 1.3 Core Concepts — Intuition Before Definitions

### Pod

A Pod is the **smallest deployable unit** in Kubernetes. Think of it as a *logical host* — one or more containers that always run together on the same machine and share a network interface.

**Why "pod" not just "container"?**
Because some real-world apps need a sidecar. For example: your NestJS API + a log-shipper agent. They both need to be co-located, share the same filesystem, same localhost. A Pod gives you that.

**99% of the time:** one container = one pod.

```
Pod: geotrack-api-7d4f8b-xk2j9
├── container: api         ← your NestJS app
│   └── port 3000
└── [optional] container: otel-collector  ← sidecar for traces
    └── shares /tmp/traces volume with api
```

**Key fact:** Pods are **ephemeral**. They die and get recreated constantly. Never depend on a Pod's name or IP address directly. This is why Services exist.

### Deployment

A Deployment is the **manager** of your pods. You don't create pods directly — you create a Deployment that creates and manages them.

It handles:
- **Desired replica count** — "keep 3 api pods alive"
- **Rolling updates** — replace pods one by one, zero downtime
- **Rollback** — `kubectl rollout undo deployment/geotrack-api`

```
Deployment: geotrack-api (replicas: 3)
├── pod: geotrack-api-xxx-aaa  [Running]
├── pod: geotrack-api-xxx-bbb  [Running]
└── pod: geotrack-api-xxx-ccc  [Running]
     ↑
     If one dies, Deployment notices and creates a replacement
```

### Service

A Service is a **stable virtual IP address** that routes traffic to healthy pods. Since pod IPs change when pods restart, Services provide a fixed endpoint.

```
Client                Service (stable IP: 10.96.0.5)          Pods
──────    HTTP →     ─────────────────────────────────  →    [pod-aaa]
                     port 80 → targetPort 3000                [pod-bbb]
                     +load balancing across all healthy pods  [pod-ccc]
```

Think of a Service as a **smart, self-updating load balancer** that always knows which pods are healthy.

### ConfigMap & Secret

These are **how you inject configuration into pods** without baking config into your image.

- **ConfigMap**: non-sensitive config (LOG_LEVEL, PORT, feature flags)
- **Secret**: sensitive config (DATABASE_URL, JWT_SECRET, API keys)

**Mental model:** Your container image is **immutable** and **environment-agnostic**. The same image runs in staging and production. The environment-specific config comes from ConfigMap/Secret at runtime.

```
Image: geotrack-api:sha256-abc123  (never changes between envs)
    +
ConfigMap: NODE_ENV=staging, LOG_LEVEL=debug
    +
Secret:    DATABASE_URL=postgres://staging-db/...
    =
Running Pod with correct environment
```

### Namespace

A Namespace is a **virtual cluster within a cluster**. It's how you isolate resources.

Think of it like a directory: `/geotrack/` vs `/monitoring/`. Resources in different namespaces can't accidentally conflict by name, and you can apply different RBAC policies and resource quotas per namespace.

```
Cluster
├── namespace: geotrack          ← your app
│   ├── deployment/geotrack-api
│   └── service/geotrack-api
├── namespace: monitoring        ← Prometheus / Grafana
│   └── deployment/prometheus
└── namespace: ingress-nginx     ← ingress controller
    └── deployment/nginx
```

## 1.4 How They All Interact — Full System Diagram

```
Internet
    │
    ▼
[Ingress / LoadBalancer]
    │  routes traffic by host/path
    ▼
[Service: geotrack-api]   ← stable DNS: geotrack-api.geotrack.svc.cluster.local
    │  load-balances across healthy pods
    ├──▶ [Pod: geotrack-api-xxx-aaa]
    ├──▶ [Pod: geotrack-api-xxx-bbb]
    └──▶ [Pod: geotrack-api-xxx-ccc]
              │
              │  each pod has access to:
              ├── ConfigMap: geotrack-config  (env vars)
              └── Secret:    geotrack-secrets (env vars)

[Deployment: geotrack-api]
    │  manages the 3 pods above, handles rolling updates
    └── HPA: geotrack-api-hpa
            │  watches CPU/memory, adjusts replicas 2–10
            └── [Metrics Server] provides resource usage

[ServiceAccount: geotrack]
    │  RBAC identity for pods (what can the pod access in K8s API)
    └── attached to pods via spec.serviceAccountName
```

---

# Phase 2 — Mapping Your GeoTrack k8s Structure

## 2.1 Directory Overview

```
k8s/
├── base/                         ← Single source of truth for all environments
│   ├── namespace.yaml            ← Create the geotrack namespace
│   ├── serviceaccount.yaml       ← RBAC identity for pods
│   ├── configmap.yaml            ← Non-secret config env vars
│   ├── secret.yaml               ← Sensitive env vars (template only)
│   ├── deployment.yaml           ← Deployment for api + worker
│   ├── service.yaml              ← ClusterIP service for the api
│   ├── hpa.yaml                  ← Horizontal Pod Autoscaler
│   └── kustomization.yaml        ← Declares which files to include
└── overlays/
    ├── staging/
    │   └── kustomization.yaml    ← Patches base for staging (lower resources)
    └── production/
        └── kustomization.yaml    ← Patches base for production (higher resources)
```

## 2.2 File-by-File Deep Dive

### `namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: geotrack
```

**What it does:** Creates the `geotrack` namespace — the logical boundary for all GeoTrack resources.

**Why it's important (not obvious):**
- Without an explicit namespace manifest, you'd have to create it manually before every deployment. Having it here means `kubectl apply` is fully idempotent — you can run it fresh on a new cluster.
- It's the **first** resource in `kustomization.yaml` for a reason. All other resources reference `namespace: geotrack` — they'll fail if the namespace doesn't exist first.

**When used:** Applied once per cluster. Re-applying is safe (idempotent).

---

### `serviceaccount.yaml`

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: geotrack
  namespace: geotrack
```

**What it does:** Creates an identity (`geotrack`) that your pods run as. This is the **Kubernetes RBAC equivalent of a Linux user.**

**Why not just use the default ServiceAccount?**
The `default` service account in every namespace has no special permissions, but in many clusters it still has some API access. By creating a **dedicated** service account, you:
1. Apply the principle of least privilege
2. Can later bind IAM roles to it (e.g., AWS IRSA or GCP Workload Identity — so your pod can access S3 or GCS without hardcoded credentials)
3. Audit access per-service more cleanly

**How it connects:** `deployment.yaml` references it via `spec.serviceAccountName: geotrack`.

---

### `configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: geotrack-config
data:
  NODE_ENV: "production"
  PORT: "3000"
  LOG_LEVEL: "info"
  TRACKING_MAX_BATCH_SIZE: "100"
  # ...
```

**What it does:** Stores non-sensitive configuration as key-value pairs, injected into pods as environment variables.

**Why not just hardcode in the Deployment?**
You *could* put `env:` directly in the Deployment spec. But then:
- Changing config requires changing Deployment → triggers a pod restart
- A ConfigMap can be shared across multiple Deployments (api + worker both use `geotrack-config`)
- With `kustomize`, you can patch only the ConfigMap fields that differ per environment, keeping changes minimal and auditable

**How it connects:** `deployment.yaml` references it via:
```yaml
envFrom:
  - configMapRef:
      name: geotrack-config
```
This injects ALL ConfigMap keys as environment variables into the container.

**Overlay behavior:** The staging overlay patches `NODE_ENV=staging` and `LOG_LEVEL=debug`. The production overlay patches `LOG_LEVEL=warn`. The base value (`production`) is the safe default failsafe.

---

### `secret.yaml`

```yaml
# WARNING: This is a TEMPLATE. In production, use sealed-secrets or external-secrets.
apiVersion: v1
kind: Secret
metadata:
  name: geotrack-secrets
type: Opaque
stringData:
  DATABASE_URL: "postgresql://geotrack:CHANGE_ME@pgbouncer:6432/geotrack"
  JWT_SECRET: "CHANGE_ME_TO_A_SECURE_SECRET_MINIMUM_32_CHARS"
  # ...
```

**What it does:** Stores sensitive configuration. Kubernetes base64-encodes Secret values (it does NOT encrypt them by default).

> [!CAUTION]
> Committing real secrets to Git — even base64-encoded — is a security breach. In production use:
> - **Sealed Secrets** (Bitnami) — encrypts secrets, safe to commit to Git
> - **External Secrets Operator** — pulls from AWS Secrets Manager / GCP Secret Manager / Vault
> - **SOPS** — file-level encryption for secrets

**`stringData` vs `data`:**
`stringData` accepts plain strings (Kubernetes encodes them for you). `data` requires manually base64-encoded values. Always prefer `stringData` for readability in templates.

**How it connects:** Injected identically to ConfigMap:
```yaml
envFrom:
  - secretRef:
      name: geotrack-secrets
```

---

### `deployment.yaml` — The API

```yaml
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0   # NEVER kill a pod before a new one is ready
      maxSurge: 1         # Allow 1 extra pod during rollout
```

> **Mental model for `maxUnavailable: 0, maxSurge: 1`:**
> During a rollout with 2 replicas, K8s creates 1 new pod first. Once it passes readiness checks, it kills 1 old pod. Then creates another new one. Zero user impact. This is the safest default for an API.

```yaml
      readinessProbe:
        httpGet:
          path: /health/ready
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 10
        failureThreshold: 3
```

> **readinessProbe:** "Is this pod ready to receive traffic?" Kubernetes only sends traffic to pods that pass this. If your app is starting up, connecting to DB, or warming caches — it fails readiness and gets no traffic. Critical for zero-downtime deploys.

```yaml
      livenessProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 10
        periodSeconds: 30
        failureThreshold: 3
```

> **livenessProbe:** "Is this pod still alive?" If it fails 3 times, Kubernetes **kills and restarts** the pod. This handles deadlocks, memory corruption, infinite loops.

```yaml
      startupProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 5
        failureThreshold: 12    # 60s max startup time
```

> **startupProbe:** Disables the liveness probe until startup completes. Without it, a slow-starting NestJS app (Prisma migrations, heavy module init) would be killed by liveness before it's ready. `failureThreshold: 12` × `periodSeconds: 5` = 60 seconds maximum startup window.

### `deployment.yaml` — The Worker

```yaml
  replicas: 1
  strategy:
    type: Recreate    # Kill old before starting new (no parallel relays)
```

> **Why `Recreate` for the worker?** Your worker is an outbox relay. Running two instances simultaneously causes double-publishing of events — a correctness bug. `Recreate` means: stop the old pod completely, then start the new one. Brief downtime is acceptable; correctness is not negotiable.

---

### `service.yaml`

```yaml
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 3000
  selector:
    app.kubernetes.io/name: geotrack-api
```

**What it does:** Creates a stable virtual IP inside the cluster routing `:80` to pods matching the selector.

**ClusterIP means:** Only reachable from *inside* the cluster. You need an Ingress or LoadBalancer to expose it externally.

**How label selector works:**
```
Service selector:  { app.kubernetes.io/name: geotrack-api }
                        ↕ must match
Pod labels:        { app.kubernetes.io/name: geotrack-api }
→ Traffic is routed to this pod
```

**DNS name inside cluster:** `geotrack-api.geotrack.svc.cluster.local`
Within the same namespace, you can use just: `http://geotrack-api/health`.

---

### `hpa.yaml`

```yaml
spec:
  scaleTargetRef:
    kind: Deployment
    name: geotrack-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300     # 5min cooldown
```

**Why the asymmetric stabilization windows?**
- Scale-up is fast (60s) — traffic spikes are sudden, you need capacity NOW
- Scale-down is slow (5min) — prevent "flapping" (scale down → brief lull → scale back up)

**The 70% CPU target:** triggers scaling when average CPU across all pods exceeds 70% of `requests.cpu`. With `requests: 250m`, scaling triggers at ~175m average.

**Overlay behavior:**
- Staging: min=1, max=3 (cheap, for testing)
- Production: min=3, max=20 (always 3 pods for HA, up to 20 under load)

---

### `kustomization.yaml` (base)

```yaml
namespace: geotrack

resources:
  - namespace.yaml
  - serviceaccount.yaml
  - configmap.yaml
  - secret.yaml
  - deployment.yaml
  - service.yaml
  - hpa.yaml

commonLabels:
  app.kubernetes.io/part-of: geotrack-platform
  app.kubernetes.io/managed-by: kustomize
```

- **`namespace: geotrack`** — injects `namespace: geotrack` into every resource automatically
- **`commonLabels`** — appended to every resource's labels; enables `kubectl get all -l app.kubernetes.io/part-of=geotrack-platform`
- **Resource order matters** — namespace must be first since other resources depend on it existing

## 2.3 Why Kustomize? (Not Plain YAML or Helm)

**The problem with plain YAML:** For staging + production, you either duplicate every file (drift risk) or use Helm (templating language, complex).

**Kustomize's approach:** Pure YAML, no templating. Base = shared truth. Overlays = targeted patches.

```
base/deployment.yaml             overlays/staging/kustomization.yaml
────────────────────             ──────────────────────────────────
replicas: 2                 +    patch: replicas → 1
cpu request: 250m           +    patch: cpu → 100m
NODE_ENV: production        +    patch: NODE_ENV → staging
                            =
                            Staging: replicas:1, cpu:100m, NODE_ENV:staging
```

**JSON Patch syntax** (what your overlays use):
```yaml
- op: replace           # operation: replace | add | remove
  path: /spec/replicas  # JSON pointer into the resource object
  value: 1              # new value
```

A code reviewer only needs to read the 5-line overlay patch — not diff two 100-line files.

## 2.4 Staging vs Production Overlay — Real-World Comparison

| Dimension            | Staging            | Production           |
|----------------------|--------------------|----------------------|
| API replicas          | 1 → 3 (HPA)        | 3 → 20 (HPA)         |
| CPU request/limit     | 100m / 500m        | 500m / 2000m         |
| Memory request/limit  | 128Mi / 256Mi      | 512Mi / 1Gi          |
| LOG_LEVEL             | debug              | warn                 |
| NODE_ENV              | staging            | production           |
| namePrefix            | `staging-`         | none                 |
| Purpose               | Low-cost full test | HA production perf   |

> The `namePrefix: staging-` makes staging resources `staging-geotrack-api`. This lets both environments share **the same cluster** without naming collisions — a common cost-saving pattern for small teams.

---

# Phase 3 — Hands-On Local Setup

## 3.1 Install Required Tools

```powershell
# kubectl
choco install kubernetes-cli
kubectl version --client

# kustomize
choco install kustomize
kustomize version

# minikube
choco install minikube

# Start local cluster
minikube start --driver=docker --cpus=4 --memory=4096

# Verify
kubectl cluster-info
kubectl get nodes    # shows 1 node "minikube"
```

> **minikube vs kind:** minikube is better for solo dev (dashboard, tunneling, add-ons). `kind` (Kubernetes IN Docker) is better for CI pipelines and multi-node simulation.

## 3.2 Build Images Inside Minikube

Minikube has its own Docker daemon. Build inside it so images are available to the cluster:

```powershell
# Point your shell's Docker CLI at minikube's daemon
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# Build (these go directly into minikube, no push needed)
docker build -t geotrack-api:latest -f Dockerfile .
docker build -t geotrack-worker:latest -f Dockerfile.worker .
```

> **Important:** Set `imagePullPolicy: Never` in your Deployment for local dev, otherwise Kubernetes tries to pull from a remote registry and fails.

## 3.3 Prepare Local Secrets Override

Your `secret.yaml` has `CHANGE_ME` placeholders. Create a local overlay (never commit this):

```yaml
# k8s/overlays/local/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

namePrefix: local-

patches:
  - target:
      kind: Secret
      name: geotrack-secrets
    patch: |
      - op: replace
        path: /stringData/DATABASE_URL
        value: "postgresql://geotrack:localpassword@postgres:5432/geotrack"
      - op: replace
        path: /stringData/JWT_SECRET
        value: "local-dev-secret-at-least-32-characters-long"
  - target:
      kind: ConfigMap
      name: geotrack-config
    patch: |
      - op: replace
        path: /data/NODE_ENV
        value: "development"
      - op: replace
        path: /data/LOG_LEVEL
        value: "debug"
```

Add to `.gitignore`:
```
k8s/overlays/local/
```

## 3.4 Apply to Local Cluster

```powershell
# Preview what will be generated BEFORE applying
kustomize build k8s/base

# Dry-run (validates but doesn't apply)
kustomize build k8s/base | kubectl apply --dry-run=client -f -

# Apply base
kubectl apply -k k8s/base

# Apply staging overlay
kubectl apply -k k8s/overlays/staging

# Apply local overlay
kubectl apply -k k8s/overlays/local
```

## 3.5 Verify Everything Is Running

```powershell
# All pods in geotrack namespace
kubectl get pods -n geotrack

# All resources (pods, services, deployments, hpa)
kubectl get all -n geotrack

# Watch pods update in real time (during rollouts)
kubectl get pods -n geotrack -w

# Verify env vars were injected correctly
kubectl exec -n geotrack deployment/geotrack-api -- env | sort
kubectl exec -n geotrack deployment/geotrack-api -- printenv NODE_ENV

# Access the app (ClusterIP needs port-forward for local access)
kubectl port-forward -n geotrack service/geotrack-api 8080:80
# → open http://localhost:8080/api/v1/health
```

## 3.6 Essential Debug Commands

```powershell
# LOGS
kubectl logs -n geotrack deployment/geotrack-api --follow
kubectl logs -n geotrack <pod-name> --previous      # ← crash logs, critical
kubectl logs -n geotrack -l app.kubernetes.io/name=geotrack-api --follow  # all pods

# DESCRIBE (most useful command for diagnosing issues)
kubectl describe pod -n geotrack <pod-name>          # events, probe status, image pull
kubectl describe deployment -n geotrack geotrack-api # rollout status, conditions
kubectl describe hpa -n geotrack geotrack-api-hpa    # current metrics, target

# SHELL INTO A RUNNING POD
kubectl exec -it -n geotrack deployment/geotrack-api -- /bin/sh
kubectl exec -n geotrack deployment/geotrack-api -- curl http://localhost:3000/health

# EVENTS (sorted by time — first stop for any mysterious issue)
kubectl get events -n geotrack --sort-by='.lastTimestamp'

# ROLLOUT
kubectl rollout status deployment/geotrack-api -n geotrack
kubectl rollout history deployment/geotrack-api -n geotrack
kubectl rollout undo deployment/geotrack-api -n geotrack
```

## 3.7 Common Errors & Fixes

| Error                         | Cause                                    | Fix                                                                |
|-------------------------------|------------------------------------------|--------------------------------------------------------------------|
| `ImagePullBackOff`            | Can't pull Docker image                  | Check image name/tag; set `imagePullPolicy: Never` for local      |
| `CrashLoopBackOff`            | Container crashes immediately            | `kubectl logs --previous` to see crash output                     |
| Pod stuck `Pending`           | Insufficient CPU/memory on nodes         | `kubectl describe pod` → "Insufficient cpu"; reduce requests       |
| `0/1 ready` (readiness fail)  | Health endpoint not returning 200        | Check `/health/ready`, check DB connection from inside pod        |
| `CreateContainerConfigError`  | Referenced ConfigMap/Secret missing      | Apply namespace+configmap+secret BEFORE deployment                 |
| `OOMKilled`                   | Container exceeded memory limit          | Increase memory limit or find memory leak                         |
| `<unknown>` in HPA TARGETS   | Metrics Server not installed             | `kubectl apply -f` metrics-server manifest                        |

---

# Phase 4 — Deep Dive (Important for Scaling Systems)

## 4.1 Deployment Strategies

### Rolling Update (your current strategy for the API)

```
Before:  [v1] [v1] [v1]
Step 1:  [v1] [v1] [v2]   ← 1 new pod created, passes readiness
Step 2:  [v1] [  ] [v2]   ← 1 old pod terminated
Step 3:  [v2] [  ] [v2]   ← 1 more new pod
After:   [v2] [v2] [v2]
```

**Best for:** Stateless services like your API. Zero downtime.

**Risk:** During rollout, v1 and v2 handle traffic simultaneously. API changes must be **backward compatible** — never rename a JSON field without versioning.

### Blue/Green Deployment

```
Blue (live):    [v1] [v1] [v1]  ← Service selector points here
Green (new):    [v2] [v2] [v2]  ← Fully deployed, tested, not live

Cutover: Update Service selector to point to green
→ Instant switch, instant rollback (just change selector back)
```

```yaml
# Switch by patching Service selector:
selector:
  app: geotrack-api
  version: blue   # change to "green" to switch traffic
```

**Best for:** DB schema migrations, major breaking changes. Requires 2× pod count.

### Canary Deployment

```
Stable (90%):  [v1] [v1] [v1] [v1] [v1] [v1] [v1] [v1] [v1]
Canary (10%):  [v2]

→ Monitor metrics for errors/latency
→ Gradually increase canary replicas, decrease stable
```

Both Deployments share the same Service `selector` label. Traffic splits proportionally to replica count.

**Best for:** Validating new features on real traffic with minimal blast radius. With Istio (Phase 7), you get exact percentage control without replica math.

## 4.2 Resource Requests & Limits — The Mental Model

```
requests: Scheduler guarantee. The node must have this capacity free.
limits:   Hard ceiling. Exceed CPU? Throttled. Exceed memory? OOMKilled.
```

**The scheduler only looks at `requests`** when placing pods. `limits` only matter at runtime.

```
Your base API values:
  requests: 250m CPU, 256Mi memory
  limits:   1000m CPU, 512Mi memory
  → Burst ratio: 4× CPU, 2× memory

Your prod API values:
  requests: 500m CPU, 512Mi memory
  limits:   2000m CPU, 1Gi memory
```

**Debugging resource issues:**
- Pod stuck `Pending` → reduce `requests` or add more nodes
- Pod `OOMKilled` → increase memory `limits` (or fix leaks)
- App feels throttled/slow → increase CPU `limits` (or optimize code)
- HPA not scaling → verify Metrics Server is running; check `kubectl top pods -n geotrack`

## 4.3 Networking — Service Types Compared

```
ClusterIP (your setup)
  Only reachable inside the cluster.
  DNS: http://geotrack-api.geotrack.svc.cluster.local
  Use for: all internal services (DB, Redis, service-to-service calls)

NodePort
  Exposes on every node's IP at a port (30000–32767).
  URL: http://<node-ip>:<nodePort>
  Use for: quick local testing, not production.

LoadBalancer
  Provisions a cloud load balancer (AWS ELB, GCP LB).
  Gets an external IP. One LB per service (expensive).
  Use for: production when you have 1–2 external services.

Ingress (most common production pattern)
  One external LoadBalancer → Ingress Controller → routes by host/path to many Services.
  Internet → [AWS ALB] → [nginx-ingress pod] → [Service: geotrack-api]
                                             → [Service: other-api]
```

## 4.4 Service-to-Service Communication

Inside Kubernetes, services communicate via **DNS**:

```
Format: <service-name>.<namespace>.svc.cluster.local

Same namespace:   http://geotrack-api/health
Cross-namespace:  http://geotrack-api.geotrack.svc.cluster.local/health
```

Your `secret.yaml` already does this correctly:
```yaml
REDIS_HOST: "redis"      ← resolves to the "redis" Service in the same namespace
KAFKA_BROKERS: "redpanda:9092"  ← resolves to the "redpanda" Service
```

---

# Phase 5 — Production Architecture Thinking

## 5.1 How Real Companies Structure Kubernetes Repos

### Mono-repo (your current approach — correct for a team)
```
k8s/
├── base/
├── overlays/
│   ├── staging/
│   └── production/
└── infrastructure/          ← add this
    ├── ingress/
    ├── cert-manager/
    └── monitoring/
```

### GitOps Repo (separate from app repo, for larger teams)
```
infra-gitops-repo/
├── apps/
│   ├── geotrack/
│   │   ├── base/
│   │   └── overlays/
│   └── other-service/
├── infrastructure/
│   ├── cert-manager/
│   ├── ingress-nginx/
│   └── external-secrets/
└── clusters/
    ├── staging/
    │   └── kustomization.yaml   ← points at apps/*/overlays/staging
    └── production/
        └── kustomization.yaml   ← points at apps/*/overlays/production
```

ArgoCD (Phase 7) syncs this repo to the cluster automatically.

## 5.2 Secrets Management — The Right Way

**Level 1 (current):** Template secret.yaml, fill manually. OK for dev.

**Level 2 — Sealed Secrets (recommended start):**
```powershell
# Install kubeseal CLI
choco install kubeseal

# Install controller in cluster
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.1/controller.yaml

# Seal your secret (output is safe to commit)
kubectl create secret generic geotrack-secrets \
  --from-literal=JWT_SECRET="$(openssl rand -base64 32)" \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > k8s/base/sealed-secret.yaml

# Replace secret.yaml with sealed-secret.yaml in kustomization.yaml
```

**Level 3 — External Secrets Operator (enterprise):**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: geotrack-secrets
  namespace: geotrack
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: geotrack-secrets
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: geotrack/production/database-url
    - secretKey: JWT_SECRET
      remoteRef:
        key: geotrack/production/jwt-secret
```

## 5.3 CI/CD Integration — GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    outputs:
      sha: ${{ github.sha }}

    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}/geotrack-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl (EKS)
        run: aws eks update-kubeconfig --name geotrack-staging --region ap-southeast-1
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Update image tag
        run: kustomize edit set image geotrack-api=ghcr.io/${{ github.repository }}/geotrack-api:${{ github.sha }}
        working-directory: k8s/overlays/staging

      - name: Deploy
        run: |
          kustomize build k8s/overlays/staging | kubectl apply -f -
          kubectl rollout status deployment/geotrack-api -n geotrack --timeout=300s

  deploy-production:
    needs: [build-and-push, deploy-staging]
    runs-on: ubuntu-latest
    environment: production    # ← requires manual approval in GitHub
    if: github.ref == 'refs/heads/main'

    steps:
      # ... same pattern as staging ...
      - name: Deploy
        run: |
          kustomize build k8s/overlays/production | kubectl apply -f -
          kubectl rollout status deployment/geotrack-api -n geotrack --timeout=600s
```

**Key CI/CD principles:**
1. **Build once, promote the same immutable image** — never rebuild for production
2. **Use `github.sha` as image tag** — never use `latest` in production (tags are mutable)
3. **`kubectl rollout status`** — pipeline fails if deployment fails (not just `kubectl apply`)
4. **GitHub Environments** — require manual approval for production

---

# Phase 6 — Deploy to Cloud

## Option A: AWS EKS

### Step 1: Install Tools
```powershell
choco install eksctl awscli
aws configure   # enter access key, secret, region: ap-southeast-1
```

### Step 2: Create EKS Cluster
```powershell
eksctl create cluster \
  --name geotrack-prod \
  --region ap-southeast-1 \
  --nodegroup-name workers \
  --node-type t3.medium \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 10 \
  --managed \         # AWS manages node OS upgrades
  --with-oidc         # Enables IRSA (IAM roles for pods, no hardcoded creds)

# eksctl automatically configures kubectl context
kubectl get nodes
```

### Step 3: Push Image to ECR
```powershell
aws ecr create-repository --repository-name geotrack-api --region ap-southeast-1

aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS \
  --password-stdin 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com

docker build -t geotrack-api:v1.0.0 .
docker tag geotrack-api:v1.0.0 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/geotrack-api:v1.0.0
docker push 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/geotrack-api:v1.0.0
```

### Step 4: Deploy
```powershell
# Update image in production overlay
cd k8s/overlays/production
kustomize edit set image geotrack-api=123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/geotrack-api:v1.0.0

# Apply
kubectl apply -k k8s/overlays/production

# Install Metrics Server (required for HPA)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify HPA
kubectl get hpa -n geotrack    # TARGETS should show "20%/70%" not "<unknown>"
```

### Step 5: Expose with AWS ALB Ingress
```powershell
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system --set clusterName=geotrack-prod
```

```yaml
# k8s/overlays/production/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: geotrack-ingress
  namespace: geotrack
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-southeast-1:...:certificate/...
spec:
  rules:
    - host: api.geotrack.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: geotrack-api
                port:
                  number: 80
```

### EKS Cost Estimate

| Resource                  | Monthly Cost |
|---------------------------|--------------|
| EKS Control Plane         | ~$72         |
| 3× t3.medium nodes        | ~$90         |
| ALB Load Balancer         | ~$20         |
| **Total minimum**         | **~$182**    |

---

## Option B: Google GKE (Autopilot — Recommended)

### Step 1: Install & Configure
```powershell
choco install gcloudsdk
gcloud init
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud config set compute/region asia-southeast1
```

### Step 2: Create GKE Autopilot Cluster
```powershell
# Autopilot: Google manages nodes, you pay per pod (not per node)
gcloud container clusters create-auto geotrack-prod \
  --region asia-southeast1 \
  --release-channel regular

gcloud container clusters get-credentials geotrack-prod --region asia-southeast1
kubectl get nodes
```

### Step 3: Push to Artifact Registry
```powershell
gcloud services enable artifactregistry.googleapis.com
gcloud artifacts repositories create geotrack \
  --repository-format=docker \
  --location=asia-southeast1

gcloud auth configure-docker asia-southeast1-docker.pkg.dev

docker build -t geotrack-api:v1.0.0 .
docker tag geotrack-api:v1.0.0 \
  asia-southeast1-docker.pkg.dev/YOUR_PROJECT/geotrack/geotrack-api:v1.0.0
docker push asia-southeast1-docker.pkg.dev/YOUR_PROJECT/geotrack/geotrack-api:v1.0.0
```

### Step 4: Deploy
```powershell
# GKE Autopilot has Metrics Server built-in — HPA works immediately
cd k8s/overlays/production
kustomize edit set image geotrack-api=asia-southeast1-docker.pkg.dev/YOUR_PROJECT/geotrack/geotrack-api:v1.0.0
kubectl apply -k k8s/overlays/production
kubectl get hpa -n geotrack
```

### Step 5: GKE Managed Ingress + SSL
```yaml
# k8s/overlays/production/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: geotrack-ingress
  namespace: geotrack
  annotations:
    kubernetes.io/ingress.class: "gce"
    networking.gke.io/managed-certificates: "geotrack-cert"
spec:
  rules:
    - host: api.geotrack.com
      http:
        paths:
          - path: /*
            pathType: ImplementationSpecific
            backend:
              service:
                name: geotrack-api
                port:
                  number: 80
---
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: geotrack-cert
  namespace: geotrack
spec:
  domains:
    - api.geotrack.com    # GCP auto-provisions and renews the SSL cert
```

### GKE Cost Estimate

| Resource                  | Monthly Cost |
|---------------------------|--------------|
| GKE Autopilot control plane| $0          |
| 3 pods × 0.5 CPU + 512Mi  | ~$30         |
| GCP Load Balancer          | ~$20         |
| **Total minimum**          | **~$50**     |

> **EKS vs GKE summary:** GKE Autopilot wins on cost and simplicity at small scale. EKS wins when you need deep AWS integration (RDS, S3, IAM IRSA maturity). For GeoTrack starting out, GKE Autopilot is the better choice.

---

# Phase 7 — Advanced / Principal Engineer Level

## 7.1 Multi-Cluster Architecture

Real production setups run at minimum:

```
[dev cluster]           ← feature branch deployments
[staging cluster]       ← pre-production, mirrors prod
[production cluster]    ← live traffic, HA, multi-AZ

Optional:
[dr/failover cluster]   ← different region, active-passive
```

```powershell
# Manage multiple cluster contexts
kubectl config get-contexts
kubectl config use-context geotrack-production

# Run command against specific cluster without switching context
kubectl --context=geotrack-staging get pods -n geotrack
```

## 7.2 GitOps with ArgoCD

**The core problem:** Without GitOps, anyone with `kubectl` access can modify the cluster. The cluster drifts from Git. You lose the single source of truth.

**GitOps:** The cluster *pulls* its desired state from Git. ArgoCD watches your repo and continuously syncs the cluster to match it. Manual `kubectl apply` changes are detected and can be auto-reverted.

```
Git Repo (source of truth)
    │
    │  ArgoCD polls every 3 minutes
    ▼
ArgoCD controller (in the cluster)
    │  detects diff: Git says replicas=3, cluster has replicas=2
    ▼
ArgoCD applies: sets replicas=3 to match Git
```

```powershell
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

```yaml
# argocd/geotrack-production-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: geotrack-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/map-history
    targetRevision: main
    path: k8s/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: geotrack
  syncPolicy:
    automated:
      prune: true       # remove resources deleted from Git
      selfHeal: true    # revert manual cluster changes
    syncOptions:
      - CreateNamespace=true
```

**With this:** every `git push` to `main` → ArgoCD syncs within 3 minutes → cluster matches Git → status visible in UI. Zero manual `kubectl apply`.

## 7.3 Service Mesh — Istio Basics

Without a service mesh, you implement retries, mTLS, circuit breaking, and observability in every service. Istio moves this to the infrastructure layer via a sidecar:

```
Pod before Istio:        Pod after Istio:
┌─────────────┐          ┌─────────────────────────────┐
│ container:  │          │ container: api               │
│   api       │          │ container: istio-proxy       │
└─────────────┘          │   ├── enforces mTLS          │
                         │   ├── retries on 503         │
                         │   ├── circuit breaker        │
                         │   └── emits traces/metrics   │
                         └─────────────────────────────┘
```

```powershell
# Install Istio
istioctl install --set profile=default

# Enable sidecar injection for geotrack namespace
kubectl label namespace geotrack istio-injection=enabled
# From now on, every new pod in geotrack gets the istio-proxy sidecar
```

**Traffic-based canary (Istio):**
```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: geotrack-api
spec:
  hosts: [geotrack-api]
  http:
    - route:
      - destination:
          host: geotrack-api
          subset: stable
        weight: 90
      - destination:
          host: geotrack-api
          subset: canary
        weight: 10    # exactly 10%, not dependent on replica count
```

## 7.4 Observability — Logs + Metrics + Traces

### Logs → Fluent Bit → Centralized Store
```powershell
helm repo add fluent https://fluent.github.io/helm-charts
helm install fluent-bit fluent/fluent-bit \
  --set backend.type=cloudwatch \
  --set backend.cloudwatch.region=ap-southeast-1 \
  --set backend.cloudwatch.logGroupName=/geotrack/pods
```

Your NestJS app already outputs structured JSON (`LOG_PRETTY=false`). Each pod's stdout is scraped by the Fluent Bit DaemonSet and shipped to CloudWatch/Loki.

### Metrics → Prometheus + Grafana
```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  --set grafana.adminPassword=changeme

kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
```

Expose metrics from NestJS:
```typescript
// app.module.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({ path: '/metrics', defaultMetrics: { enabled: true } }),
  ],
})
export class AppModule {}
```

Tell Prometheus to scrape your pods:
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: geotrack-api
  namespace: geotrack
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: geotrack-api
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### Traces → OpenTelemetry → Jaeger/Tempo
```typescript
// src/otel.ts — import BEFORE NestJS bootstraps
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  serviceName: 'geotrack-api',
  instrumentations: [new HttpInstrumentation()],
});
sdk.start();
```

## 7.5 Infrastructure as Code — Terraform + EKS

```hcl
# infrastructure/eks/main.tf
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "geotrack-prod"
  cluster_version = "1.30"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  eks_managed_node_groups = {
    on_demand = {
      instance_types = ["t3.medium"]
      min_size       = 2
      max_size       = 10
      desired_size   = 3
      capacity_type  = "ON_DEMAND"
    }
    spot = {
      instance_types = ["t3.medium", "t3.large"]
      min_size       = 0
      max_size       = 5
      desired_size   = 0
      capacity_type  = "SPOT"    # 60-70% cheaper for non-critical workloads
    }
  }
}
```

```powershell
terraform init
terraform plan     # preview all changes before applying
terraform apply    # provision the cluster
```

**The philosophy:** Your cluster is code. Changes go through PR review. `terraform plan` shows exact changes before apply. No clicking in cloud consoles.

---

# Appendix — Checklists & Reference

## Local Debugging Checklist

```
When a pod is broken, check in this order:

[ ] kubectl get pods -n geotrack
      → Status: Pending? CrashLoopBackOff? OOMKilled?

[ ] kubectl describe pod <pod-name> -n geotrack
      → Events section at bottom tells you EXACTLY what went wrong
      → Common: image pull failure, insufficient memory, readiness probe failure

[ ] kubectl logs <pod-name> -n geotrack --previous
      → Use --previous if pod already crashed
      → Look for startup errors, DB connection failures

[ ] kubectl get events -n geotrack --sort-by='.lastTimestamp'
      → Full timeline of namespace events

[ ] kubectl exec -it <pod-name> -n geotrack -- /bin/sh
      → Get inside, test manually:
        curl http://localhost:3000/health
        printenv DATABASE_URL
        nc -zv redis 6379    (test Redis connectivity)

[ ] kubectl describe hpa -n geotrack
      → TARGETS showing <unknown>? Metrics Server not installed.
      → Not scaling? Check stabilizationWindowSeconds.

[ ] kubectl get endpoints -n geotrack geotrack-api
      → Empty? Service selector doesn't match pod labels.
```

## Production Readiness Checklist

```
RELIABILITY
[ ] readinessProbe configured (/health/ready)
[ ] livenessProbe configured (/health)
[ ] startupProbe configured (for slow-starting apps)
[ ] terminationGracePeriodSeconds >= max request timeout
[ ] PodDisruptionBudget defined (prevent all pods going down during node drain)
[ ] minReplicas >= 2 (no single point of failure)
[ ] HPA configured with sensible thresholds and stabilization windows

SECURITY
[ ] No real secrets committed to Git (Sealed Secrets / External Secrets)
[ ] Dedicated ServiceAccount (not default)
[ ] Resource limits set (prevents memory bomb / noisy neighbor)
[ ] Network Policies defined (pods isolated by default)
[ ] Images scanned for CVEs on push (ECR/GAR scanning)
[ ] Containers run as non-root user (USER 1001 in Dockerfile)
[ ] Read-only root filesystem where possible

OBSERVABILITY
[ ] Structured JSON logs (LOG_PRETTY=false ✓ already set)
[ ] /metrics endpoint exposed for Prometheus
[ ] Distributed tracing via OpenTelemetry configured
[ ] Alerts configured (CrashLoop, HPA at max, high latency, error rate)
[ ] Centralized log aggregation (CloudWatch/Loki)

DEPLOYMENTS
[ ] Rolling update with maxUnavailable=0 (✓ already set)
[ ] Image tag = git SHA, never "latest" in production
[ ] Rollback path tested (kubectl rollout undo)
[ ] CI/CD fails on rollout failure (kubectl rollout status)
[ ] DB migrations run before pod starts (init container or Job)

COST
[ ] Resource requests right-sized (not over-provisioned)
[ ] Spot instances for non-critical workloads
[ ] HPA prevents idle over-provisioning
[ ] Staging scaled to 0 outside business hours
```

## Quick Reference Card

```powershell
# ──── APPLY ────────────────────────────────────────────
kubectl apply -k k8s/overlays/staging
kustomize build k8s/overlays/production | kubectl apply -f -

# ──── STATUS ───────────────────────────────────────────
kubectl get all -n geotrack
kubectl get pods -n geotrack -w          # watch live
kubectl get hpa -n geotrack

# ──── LOGS ─────────────────────────────────────────────
kubectl logs -n geotrack deployment/geotrack-api -f
kubectl logs -n geotrack <pod> --previous   # crash logs
kubectl logs -n geotrack -l app.kubernetes.io/name=geotrack-api -f

# ──── DEBUG ────────────────────────────────────────────
kubectl describe pod -n geotrack <pod>
kubectl describe hpa -n geotrack geotrack-api-hpa
kubectl get events -n geotrack --sort-by='.lastTimestamp'
kubectl exec -it -n geotrack deployment/geotrack-api -- /bin/sh

# ──── ACCESS ───────────────────────────────────────────
kubectl port-forward -n geotrack svc/geotrack-api 8080:80

# ──── ROLLBACK ─────────────────────────────────────────
kubectl rollout status deployment/geotrack-api -n geotrack
kubectl rollout history deployment/geotrack-api -n geotrack
kubectl rollout undo deployment/geotrack-api -n geotrack

# ──── EMERGENCY SCALE ──────────────────────────────────
kubectl scale deployment/geotrack-api --replicas=5 -n geotrack

# ──── RESOURCE USAGE ───────────────────────────────────
kubectl top pods -n geotrack
kubectl top nodes

# ──── PREVIEW KUSTOMIZE OUTPUT ─────────────────────────
kustomize build k8s/overlays/production | less
kustomize build k8s/overlays/production | grep -A5 "kind: Deployment"
```

---

*Guide written for the GeoTrack (map-history) project. Based on actual k8s manifests in `k8s/base/` and overlays.*
*Last updated: April 2026*
