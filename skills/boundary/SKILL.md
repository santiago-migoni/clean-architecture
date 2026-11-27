---
name: boundary
description: "This skill should be used when the user asks to \"define an architectural boundary\", \"add a partial boundary\", \"separate a subsystem\", \"decouple two modules\", \"use the Strategy or Facade pattern as a boundary\", or to decide where policy and detail should be split (Clean Architecture Chapters 17, 19 and 24)."
argument-hint: "[description of what is being separated]"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to define, review, or enforce an **Architectural Boundary**.

The argument after the command describes the boundary context (e.g., "between use cases and database", "between the payment subsystem and the core domain", "partial boundary for the notification module").

## What is an Architectural Boundary?

From the book (Chapter 17 — Boundaries: Drawing Lines):
> "Software architecture is the art of drawing lines that I call boundaries. Those boundaries separate software elements from one another, and restrict those on one side from knowing about those on the other."

Boundaries exist to:
- **Separate things that change at different rates** (policy from detail, business rules from UI).
- **Protect inner layers** from volatile outer layers.
- **Enable independent deployability** and independent developability.
- **Defer decisions** about frameworks, DBs, and UIs until they must be made.

## Types of Boundaries Covered in the Book

### 1. Full Boundary (Chapter 24 — Partial Boundaries)
A complete architectural boundary with:
- A boundary interface (Input Port) in the inner layer.
- A boundary interface (Output Port) in the inner layer.
- Concrete implementations in the outer layer.
- Dependency inversion across the boundary.

Use when: Systems are expected to be deployed as separate services or need strict enforcement.

### 2. Partial Boundary — One-Dimensional (Strategy Pattern)
Implement the interfaces but package them together in the same deployable unit.
Use when: Full separation may be needed in the future but isn't yet required.

### 3. Partial Boundary — Façade Pattern
Use a Façade to define a simplified boundary without full DIP.
Use when: The boundary is stable enough that direction of dependency is acceptable.

### 4. The Main Boundary
The Main component is on the other side of all boundaries — it creates and wires everything.

## Your Task

### Step 1: Identify What is Being Separated
Determine:
- What is the **stable, high-level policy** (inner side)?
- What is the **volatile, low-level detail** (outer side)?
- What **interfaces** need to exist at the boundary?

### Step 2: Define Boundary Interfaces

For each boundary crossing, the interfaces live in the **inner** layer, in the module's `application/ports/`:
- `input/` — what the outer layer (or another module) calls IN;
- `output/` — what the outer layer must implement (repositories, payment providers, notifiers, clocks).

### Step 3: Implement the Full Boundary (if applicable)

The inner side declares the port in its own vocabulary; an adapter in `infrastructure/` implements it and translates to the outside format (an SDK, an HTTP API, a queue). The outside client is created in `platform/` and injected by the composition root; business outcomes the provider reports (a declined card) become values or typed errors in the module's vocabulary, anything else propagates.

**Before writing code, read the reference for the project's language** — a full boundary to a payment provider and a partial boundary, for the `billing` module:

- [TypeScript / JavaScript](references/typescript.md)
- [Python](references/python.md)
- [Go](references/go.md)

Use case ports and the cross-module gateway are in the `usecase` and `gateway` references.

### Step 4: Module Boundary (Between High-Level Components)

In this layout every module under `modules/` is a component, and the line between two modules is a boundary. Example with `billing` and `inventory`:

```
modules/
├── billing/
│   ├── domain/
│   ├── application/
│   │   └── ports/
│   │       └── output/
│   │           └── inventory-query             ← billing defines what it needs (port owned by billing)
│   └── infrastructure/
│       └── gateways/
│           └── inventory-query-gateway     ← implements it, calling inventory's INPUT port
└── inventory/
    ├── domain/
    ├── application/
    │   └── ports/
    │       └── input/
    │           └── check-stock                 ← the only inventory file billing's infrastructure may import
    └── infrastructure/
```

The `billing` module does NOT import `inventory`'s `domain/` or `infrastructure/`. The port is owned by the **caller** (`billing`), its implementation lives in the caller's `infrastructure`, and that gateway calls only `inventory/application/ports/input/`. The composition root injects inventory's interactor into the gateway. Data crossing the boundary is plain data, and `billing`'s domain refers to inventory items by id only.

A module boundary can also be crossed the other way round, by an **event**: `inventory` announces `stock-depleted` in `inventory/application/ports/published/` (plain, versioned data), and `billing/infrastructure/subscribers/` reacts by calling a use case of billing. `inventory` never knows billing exists. Use a call when the caller needs an answer to finish; use an event when the publisher only announces a fact. See the `event` skill.

### Step 5: Partial Boundary (Strategy)

When a full boundary is overkill but you want to preserve the option: keep the interface in `application/ports/output/` and a single implementation in the same module, and mark the interface as a partial boundary in its doc comment so a future team can split it out without touching the callers. (Example in the language references.)

### Step 6: Document the Boundary Decision

Create or update `docs/architecture/ARCHITECTURE.md`:
```markdown
## Boundary: <Name>

**Separates**: <Inner> (stable policy) from <Outer> (volatile detail)

**Type**: Full | Partial (Strategy) | Partial (Façade)

**Interfaces defined in inner layer**:
- `modules/<module>/application/ports/input/<name>` — called by outer → inner
- `modules/<module>/application/ports/output/<name>` — implemented by outer, called by inner

**Reason for this boundary**:
- <Outer> changes frequently (e.g., DB schema, HTTP API, third-party)
- <Inner> changes rarely (business rules)
- Allows swapping <Outer> without touching <Inner>

**When to upgrade to full boundary**: [condition, e.g., "if we need to deploy billing as a microservice"]
```

### Step 7: Verify Boundary Integrity

Check that:
1. No import crosses the boundary in the wrong direction (layers: `infrastructure → application → domain`; modules: only `A/infrastructure → B/application/ports/input`).
2. All cross-boundary data is passed as **simple data structures** (no domain objects leaking out, no framework objects leaking in).
3. The boundary interface lives in the **inner** layer.
4. The implementation lives in the **outer** layer.

## Policy and Level

From Chapter 19:
- **Level** = the distance from inputs and outputs. The farther from I/O, the higher the level.
- High-level policies (business rules) should depend on lower-level details **only through interfaces** (boundaries).
- Low-level details (DB, HTTP) change frequently; high-level policies change rarely.

## Stable vs. Volatile Components (SDP/SAP)
- Components on the **inner side** of a boundary should be **more stable** (fewer incoming changes).
- Components on the **outer side** should be **more volatile** (change often).
- If a stable component depends on a volatile component — **add an interface at the boundary**.

## Validation Checklist

- [ ] Boundary interfaces are defined in the **inner** layer.
- [ ] Outer layer code depends on boundary interfaces, not on inner implementations.
- [ ] Cross-boundary data uses **plain data structures** (no entity objects, no framework objects).
- [ ] The boundary type is documented (full vs. partial + reason).
- [ ] Import rules are enforced on both axes — layers and modules (lint rules, module boundaries, ArchUnit, etc.).
- [ ] Main component wires together across boundaries.

## Output
After creating/reviewing boundary files, provide:
1. A boundary diagram showing what's on each side.
2. The interfaces created and where they live.
3. The dependency direction enforced.
4. Recommended boundary type with justification.
