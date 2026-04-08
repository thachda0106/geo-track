# How to Use the 30-Phase System Development Workflow

> A practical guide to building a large-scale distributed system using the BigTech-level 30-phase lifecycle.

---

## Who Is This For?

- **Tech Leads / Staff Engineers** planning a new system from scratch
- **Engineering Managers** assigning phases to teams and tracking progress
- **AI Agents** (Claude, Antigravity, Cursor) executing phases with human approval gates
- **Individual Engineers** wanting to understand the full lifecycle

## Overview

The workflow has **30 phases** across **8 stages**:

```
A. Discovery & Requirements ─── Phases 01–03 ─── "What & why?"
B. Domain & Architecture   ─── Phases 04–11 ─── "How does it look?"
C. Platform & Infrastructure ── Phases 12–16 ─── "What supports it?"
D. Service Development     ─── Phases 17–19 ─── "Build it"
E. Hardening               ─── Phases 20–25 ─── "Make it bulletproof"
F. Launch                  ─── Phases 26–27 ─── "Ship it"
G. Operations              ─── Phases 28–29 ─── "Keep it running"
H. Evolution               ─── Phase 30     ─── "Make it better"
```

---

## Getting Started

### Step 1 — Read the Master Overview

Open [build-large-system.md](../workflows/build-large-system.md) to see:
- Phase summary table (all 30 phases at a glance)
- Dependency graph (which phases depend on which)
- Folder structure (where to put documents)
- Approval gate types

### Step 2 — Choose Your System Type

The workflow is generic. Before starting, decide your system type:

| System Type | Examples |
|-------------|----------|
| E-commerce | Shopify, Amazon marketplace |
| Payments | Stripe, Square |
| Ride-hailing | Uber, Lyft |
| Social Network | Twitter, Instagram |
| Streaming | Netflix, Spotify |
| Banking | Revolut, Chime |
| SaaS | Slack, Notion |

The vertical slice (Phase 17) has recommended flows per system type.

### Step 3 — Create Your Docs Folder

Create the documentation folder structure from the master workflow:

```bash
# Create stage directories
mkdir -p docs/stages/{A-discovery-requirements,B-domain-architecture}
mkdir -p docs/stages/{C-platform-infrastructure,D-service-development}
mkdir -p docs/stages/{E-hardening,F-launch,G-operations,H-evolution}

# Create cross-cutting directories
mkdir -p docs/cross-cutting/{architecture,data,api/specs,events/schemas}
mkdir -p docs/cross-cutting/{security,infrastructure,operations/runbooks}
mkdir -p docs/cross-cutting/{operations/incident-templates,testing,release,finops}

# Create support directories
mkdir -p docs/{adr,templates,generated}
```

### Step 4 — Execute Phase by Phase

Work through each phase in order. Every phase document follows this structure:

```
1. Goal           ← What you're trying to achieve
2. Key Decisions  ← Decisions you must make
3. Documents      ← What to produce
4. Artifacts      ← Architecture artifacts (ADRs, diagrams)
5. Deliverables   ← Where to save outputs
6. Key Questions  ← Questions the phase must answer
7. Tasks          ← Step-by-step implementation
8. Mistakes       ← Common pitfalls to avoid
9. KPIs & Exit    ← How to know you're done
10. Connection    ← What feeds into the next phase
```

---

## How to Execute Each Phase

### With an AI Agent

Prompt your AI agent with:

```
Execute Phase XX — [Phase Name] from the Build Large System workflow.

Context:
- System type: [e.g., E-commerce microservices]
- Tech stack: [e.g., NestJS, PostgreSQL, Kafka, AWS]
- Previous phase output: [link to previous phase doc]

Instructions:
1. Read .ai/workflows/build-large-system-phases-XX-YY.md for Phase XX details
2. Answer all Key Questions (section 6)
3. Complete all Implementation Tasks (section 7)
4. Produce all Documents (section 3)
5. Save output to docs/stages/[stage]/XX-[name].md
6. Verify against KPIs & Exit Criteria (section 9)
7. Stop at the Approval Gate for review
```

### With a Team

| Role | Responsibility |
|------|----------------|
| **Tech Lead** | Drives phases, makes architecture decisions, reviews outputs |
| **Product Manager** | Approves Stage A (Discovery & Requirements) |
| **Security Engineer** | Reviews Phase 05 (Security) and Phase 22 (Compliance) |
| **SRE / Platform Eng** | Leads Phases 12–16 (Platform) and 20–25 (Hardening) |
| **Backend Engineers** | Execute Phases 17–19 (Service Development) |
| **Engineering Manager** | Approves Launch Gate (Phase 25) |

---

## Approval Gates

Every phase ends with an approval gate. **Do not proceed** until the gate is passed.

| Gate | Phases | Who Approves | What They Check |
|------|--------|--------------|-----------------|
| 📋 Document Review | 01–04, 14, 27–30 | Tech Lead + 1 peer | Completeness, accuracy |
| 🔒 Security Review | 05, 22 | Security Engineer | Threat model, compliance |
| 🏗️ Architecture Review | 06–11, 19–21, 23–24 | Staff/Principal Eng | Design soundness, trade-offs |
| 🧪 Quality Gate | 12–13, 15–18 | CI/CD (automated) | Tests pass, coverage met |
| 🚀 Launch Gate | 25, 26 | Eng Lead + Product + SRE | All checklist items GREEN |

---

## Phase Dependencies — What Can Run in Parallel?

Most phases are sequential, but some can overlap:

### Fully Sequential (Critical Path)
```
01 → 02 → 03 → 04 → 05 → 06 → 07/08/09 → 10 → 11
```

### Parallelizable Within Stage B
After Phase 06 (Architecture) is approved:
- **Phase 07** (Data Architecture) and **Phase 08** (API Design) can start in parallel
- **Phase 09** (Event Schema) can start after Phase 07

### Parallelizable Within Stage C
After Phase 13 (Platform Core) is approved:
- **Phase 14** (Testing) and **Phase 15** (DX) can progress in parallel
- **Phase 16** (CI/CD) starts after both

### Parallelizable Within Stage E
After Phase 18 (Full Build) is complete:
- **Phase 20** (Observability) and **Phase 19** (Migration) can run in parallel
- **Phase 21** (Performance) and **Phase 22** (Compliance) can run in parallel

---

## Timeline Estimates

| Stage | Phases | Small System | Medium System | Large System |
|-------|--------|-------------|---------------|-------------|
| A. Discovery | 01–03 | 1 week | 2 weeks | 4 weeks |
| B. Architecture | 04–11 | 2 weeks | 4 weeks | 8 weeks |
| C. Platform | 12–16 | 2 weeks | 4 weeks | 6 weeks |
| D. Development | 17–19 | 4 weeks | 8 weeks | 16 weeks |
| E. Hardening | 20–25 | 2 weeks | 4 weeks | 8 weeks |
| F. Launch | 26–27 | 1 week | 2 weeks | 3 weeks |
| G. Operations | 28–29 | Ongoing | Ongoing | Ongoing |
| H. Evolution | 30 | Ongoing | Ongoing | Ongoing |
| **Total** | | **~12 weeks** | **~24 weeks** | **~45 weeks** |

> **Small** = 3–5 services, 1 team, single region
> **Medium** = 8–15 services, 2–3 teams, single region
> **Large** = 20+ services, 5+ teams, multi-region

---

## Using AI Automation

12 phases can be **heavily automated** by AI agents:

| Phase | What AI Can Generate |
|-------|---------------------|
| 07 Data Architecture | ER diagrams from domain models, migration files |
| 08 API Design | OpenAPI specs from domain models |
| 09 Event Schema | Event schemas from domain events |
| 12 Infrastructure | Terraform modules from architecture |
| 13 Platform Core | Shared library scaffolds |
| 14 Testing | Test stubs, k6 scripts from API specs |
| 15 Dev Platform | Service scaffolds, Docker Compose |
| 16 CI/CD | Pipeline configs from service templates |
| 18 Full Build | Service implementations from specs |
| 19 Migration | Migration scripts, backward-compat tests |
| 20 Observability | Dashboard JSON, alert rules from SLOs |
| 26 Deployment | Deployment runbooks, smoke test scripts |

### AI + Human Workflow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ AI Agent │───▶│ Generate │───▶│  Human   │───▶│ Approve  │
│  reads   │    │  output  │    │ reviews  │    │  & merge │
│  phase   │    │  docs +  │    │  edits   │    │          │
│  spec    │    │  code    │    │  refines │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

---

## Adapting the Workflow

### Skipping Phases

For smaller systems, you may skip or merge:

| Phase | When to Skip |
|-------|-------------|
| 03 Risk Analysis | Very small / internal tools |
| 22 Compliance | No regulated data (no PII, no payments) |
| 23 Chaos Engineering | < 5 services, single team |
| 24 Multi-Region DR | Single-region, non-critical system |
| 27 Stabilization | Internal tool with low traffic |
| 29 SLO Review | < 5 services, informal monitoring |

### Adding Custom Phases

If your system needs additional phases:
1. Create a new phase file following the template in `docs/templates/phase-template.md`
2. Add it to the master workflow table
3. Update the dependency graph
4. Define approval gate type

---

## File Reference

| File | Contents |
|------|----------|
| [build-large-system.md](../workflows/build-large-system.md) | Master overview, phase table, dependency graph, folder structure |
| [Phases 01–10](../workflows/build-large-system-phases-01-10.md) | Discovery & Requirements + Domain & Architecture |
| [Phases 11–20](../workflows/build-large-system-phases-11-20.md) | Tech Selection + Platform + Service Development + Observability |
| [Phases 21–30](../workflows/build-large-system-phases-21-30.md) | Hardening + Launch + Operations + Evolution |

---

## FAQ

**Q: Do I really need all 30 phases?**
A: No. For small systems, skip phases marked as optional above. The core path is roughly 20 phases.

**Q: Can I use a different tech stack?**
A: Absolutely. The phases are tech-agnostic. The tech stack examples (NestJS, PostgreSQL, Kafka) are reference implementations. Replace with Go, Java, RabbitMQ, etc.

**Q: How does this compare to SAFe / TOGAF / other frameworks?**
A: This is more opinionated and engineering-focused. It's closer to how Google/Amazon/Netflix actually build systems, not how enterprise frameworks describe it.

**Q: Can I use this for a monolith?**
A: Yes. Phase 06 asks "monolith-first or microservices?" — many phases apply equally to modular monoliths. Skip event-specific phases (08, 09) if not using async messaging.

**Q: What if I'm joining an existing system?**
A: Start at the phase that matches your current state. Use the quick reference table in the master workflow to find the right entry point.
