---
name: event
description: "This skill should be used when the user asks to \"publish an event\", \"react to another module's event\", \"add an integration event\", \"subscribe a module to another module\", \"decouple two modules with events\", \"add a domain event\", or wants one module to react to something that happened in another without calling it (Clean Architecture Chapters 14 and 27)."
argument-hint: "<module>/<EventName> [subscriber module]"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants one module to **announce** something that happened, and other modules to **react** to it, without the publisher knowing them.

The argument is `<module>/<EventName>` (e.g., `orders/OrderPlaced`): the module that publishes and the event. An optional second argument names the module that subscribes (e.g., `loyalty`).

## Call or event?

Modules meet in two ways, both through the other module's public surface in `application/ports/`:

| | A **call** | An **event** |
|---|---|---|
| Who depends on whom | the caller on the callee | the subscriber on the publisher |
| Folder of the public surface | `B/application/ports/input/` | `A/application/ports/published/` |
| Who imports it | `A/infrastructure/gateways/` | `B/infrastructure/subscribers/` |
| The caller or publisher waits for an answer | yes | no: it announces a fact and goes on |
| Use when | A needs something from B to finish (does the customer exist?) | B must react to what A did, and A does not care who reacts (award points for a placed order) |

If A needs an answer to complete its use case, it is a call (see the `boundary` and `gateway` skills). If A only announces a fact, it is an event. Both are dependencies: `ca_cycles` counts a subscription like an import, so a module may not subscribe to a module that calls it (the cycle is reported).

## Domain event and integration event

- The **domain event** (`A/domain/events/`) is internal: A's vocabulary, may use A's types. The use case announces it through an output port of A (`application/ports/output/<a>-events`), and never knows who listens.
- The **integration event** (`A/application/ports/published/`) is the **published contract**: plain, versioned data (ids, numbers, strings), named `<module>.<event>.v<N>` (`orders.order-placed.v1`). It imports nothing but `shared/`: a subscriber depends on this file only, never on A's domain. `ca_scan` reports a contract that imports anything else (`published-contract`).
- An adapter in `A/infrastructure/` implements the output port: it maps the domain event to the contract and publishes it on the bus, which `main/` injects as a function (the adapter never imports `platform/`).
- A change that breaks a subscriber (a field removed or renamed) is a **new version** (`v2`), published beside `v1` until every subscriber moved.

## Your Task

### Step 1: The domain event and its port (publisher)
In `A/domain/events/`, the event as A's use case sees it. In `A/application/ports/output/`, the port the use case publishes it through; the interactor publishes **after** its change is stored, and only for what really happened (no event for an order that was not placed).

### Step 2: The published contract (publisher)
In `A/application/ports/published/`, one file per event and version: its type name and its plain fields. No import of A's domain, interactors or infrastructure.

### Step 3: The publishing adapter (publisher)
In `A/infrastructure/gateways/`: implements the events port, maps the domain event to the contract, and calls the injected `publish` function.

### Step 4: The subscriber (each subscribing module)
In `B/infrastructure/subscribers/`, a driving adapter, like a controller: it receives A's contract and calls an interactor **of B**, with B's own request. B's use case never sees A's contract, so it can be called by the event, a command line or a backfill alike. B keeps its own copy of the data it needs, in its own tables, and refers to A's entities by id, without a foreign key.

Make the handling **idempotent**: an event may arrive twice (a retry, a replay). Store what was processed by the event's natural key (one award per `orderId`) and ignore a second delivery.

### Step 5: The bus and the wiring (main)
The bus is a driver in `platform/events/`: `subscribe(type, handler)`, `subscribeAll(handler)` (an audit log, a tracer) and `publish(event)`. The composition root creates it, gives `publish` to A's adapter and subscribes B's subscriber. Nothing else knows the bus.

The in-process bus delivers synchronously, in order, after the publisher stored its change. **A failing subscriber is reported and never fails the publisher**: the order is placed whatever loyalty does. That is at most once: an event whose subscriber failed is lost for it. When that is not acceptable, use an **outbox**: the event is written in the same transaction as the change, and published (and retried) afterwards. Replacing the in-process bus with a broker and an outbox changes no module.

**Before writing code, read the reference for the project's language.** Each one has `orders` publishing `OrderPlaced` and `loyalty` awarding points for it: the contract, the publishing adapter, the subscriber, the bus, the wiring and the tests:

- [TypeScript / JavaScript](references/typescript.md)
- [Python](references/python.md)
- [Go](references/go.md)

The complete, tested application is in `examples/<language>` of the plugin.

### Step 6: Tests
- The publishing adapter: one domain event in, the contract out.
- The subscriber: the contract in, B's request out (the use case replaced).
- B's use case: the effect, and a second delivery of the same event changing nothing.
- The bus: delivery in order, and a failing subscriber neither stopping the others nor failing the publisher.
- End to end, on both composition roots: the effect seen through B's API after A's use case ran, and nothing for a use case that failed.

## Validation Checklist

- [ ] The contract lives in `A/application/ports/published/`, is plain and versioned, and imports nothing but `shared/` (`published-contract` is clean).
- [ ] Only `B/infrastructure/` imports A's contract; B's domain and application never see it.
- [ ] A never imports B, and B does not call A while A calls B (`ca_cycles` is clean).
- [ ] The use case publishes after storing its change, and only for what happened.
- [ ] The subscriber calls B's own use case; B keeps its own copy of the data, in its own tables, without a foreign key to A's.
- [ ] Handling is idempotent by the event's natural key.
- [ ] The bus lives in `platform/events/` and is wired only in the composition root; a failing subscriber never fails the publisher.
- [ ] The guarantee is stated: at most once with the in-process bus; an outbox for at least once.

## Output
1. The files created, by module and layer.
2. The edge added between the modules (B → A's contract), and the cycle check.
3. The delivery guarantee, and what would change with an outbox.
