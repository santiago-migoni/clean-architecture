---
name: solid
description: "This skill should be used when the user asks to \"audit SOLID\", \"find SRP / OCP / LSP / ISP / DIP violations\", \"check single responsibility\", \"apply dependency inversion\", or to refactor a file or folder toward the SOLID principles (Clean Architecture Part III)."
argument-hint: "[path]"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to **analyze and fix SOLID principle violations** in the codebase.

The argument after the command is an optional file or directory path to focus on. If no argument is given, analyze the whole code root (`src/`, or `internal/` and `cmd/` in Go).

## The SOLID Principles (Part III of Clean Architecture)

### S — Single Responsibility Principle (Chapter 7)
> "A module should be responsible to one, and only one, actor."

A module/class/function has one **axis of change** — one reason it would need to be modified.
- "Reason to change" = a specific actor or stakeholder group whose requirements drive changes.
- Violation: A class that changes when the UI team changes requirements AND when the DB team changes requirements.

### O — Open/Closed Principle (Chapter 8)
> "A software artifact should be open for extension but closed for modification."

Adding new behavior should require adding NEW code, not modifying EXISTING code.
- Achieved through abstraction (interfaces, abstract classes) and the plugin pattern.
- Violation: A switch/if-else chain that must be modified to add a new case.

### L — Liskov Substitution Principle (Chapter 9)
> "What is wanted here is something like the following substitution property: If for each object o1 of type S there is an object o2 of type T such that for all programs P defined in terms of T, the behavior of P is unchanged when o1 is substituted for o2 then S is a subtype of T."

Derived types must be **behaviorally substitutable** for their base types.
- Violation: A subclass that overrides a method and throws an exception where the base class succeeded (Square/Rectangle problem).
- Violation: A subclass that requires stricter preconditions or provides weaker postconditions.

### I — Interface Segregation Principle (Chapter 10)
> "Clients should not be forced to depend on methods they do not use."

Prefer many small, focused interfaces over one large general-purpose interface.
- Violation: A class implements an interface but leaves some methods as `throw new NotImplementedError()`.
- Violation: Importing a module that contains much more than you need (causes unnecessary recompilation).

### D — Dependency Inversion Principle (Chapter 11)
> "The most flexible systems are those in which source code dependencies refer only to abstractions, not to concretions."

High-level policy should not depend on low-level details. Both should depend on abstractions.
- Violation: A use case class directly instantiating a repository class (`new SqlOrderRepository()`).
- Violation: An entity importing from an ORM library.

## Your Task

### Step 1: Scan for Violations

Read the files in the target path. For each class/module, check:

#### SRP Violations to look for:
- Classes with more than one type of responsibility (e.g., a class that validates, saves, AND sends emails).
- Classes named with conjunctions: `OrderValidatorAndSender`, `UserServiceAndController`.
- Methods that deal with multiple concerns (network I/O AND business logic in the same method).
- Files with hundreds of lines where multiple logical sections can be identified.
- A class that is imported by both the UI layer AND the DB layer for different reasons.

#### OCP Violations to look for:
- `if/else if` chains or `switch` statements that would need a new case to support new behavior.
- Classes that must be modified (not extended) to add new business types/strategies.
- Hard-coded type checks (`instanceof`, `typeof`, `is` type guards in business logic).
- Logic spread across a file that requires editing in multiple places to add a new feature.

#### LSP Violations to look for:
- Overridden methods that throw `UnsupportedOperationException` / `NotImplementedError`.
- Subclasses that narrow argument types (more restrictive preconditions).
- Subclasses that widen return types (weaker postconditions).
- Type checks on subtypes in calling code (`if (animal instanceof Dog)`).
- Empty overrides that do nothing where the base class had behavior.

#### ISP Violations to look for:
- Large interfaces (5+ methods) where not all implementors use all methods.
- Implementations that stub out interface methods with empty bodies or exceptions.
- Classes importing entire modules when they only use one function from them.
- A single interface used by very different client types.

#### DIP Violations to look for:
- `new ConcreteClass()` inside use case or entity code.
- Imports of framework/ORM classes inside the `domain/` or `application/` directories of any module.
- Use cases (`application/`) that import from `infrastructure/` or `platform/`.
- A module that imports another module's `domain/` or `infrastructure/` instead of depending on a port it owns.
- Static method calls to infrastructure services from business logic.
- Global variables or singletons used inside business rules.

### Step 2: Report Violations

For each violation found, report:
```
VIOLATION: <PRINCIPLE>
File: <file path>:<line number>
Issue: <specific description of the violation>
Impact: <what will break or become hard to change>
Fix: <concrete recommendation>
```

### Step 3: Apply Fixes

For each violation, apply the appropriate fix:

**SRP Fix**: Extract the second responsibility into a new class. Use composition or events to connect them.

**OCP Fix**: Introduce an interface/abstract class. Move each case into a separate strategy/handler. Register strategies via the Main component or a factory.

**LSP Fix**: Remove the inheritance relationship if behavioral substitution is impossible. Use composition instead. Or redesign the interface to not require the violating behavior.

**ISP Fix**: Split the large interface into role interfaces. Each client depends only on the interface it uses.

**DIP Fix**:
1. Define an interface in the inner layer.
2. Move the concrete implementation to the outer layer.
3. Inject the dependency via constructor (preferred), method injection, or factory.
4. Wire in the Main component.

### Step 4: Generate Summary Report

Produce a structured report:

```
SOLID AUDIT REPORT
==================
Path analyzed: <path>
Files scanned: <N>

VIOLATIONS FOUND:
  SRP: <count> violations
  OCP: <count> violations
  LSP: <count> violations
  ISP: <count> violations
  DIP: <count> violations

CRITICAL (dependency rule violations — DIP):
  [list of files]

HIGH (likely to cause pain in the next change — SRP/OCP):
  [list of files]

MEDIUM (design smell but manageable — LSP/ISP):
  [list of files]

FIXES APPLIED: <list of changes made>
FIXES RECOMMENDED (not applied): <list with descriptions>
```

## Common Patterns for Each Principle

### SRP — Use the "Actor" test
Ask: "Who would request this change?" If more than one type of person/team would change this class for different reasons → SRP violation.

### OCP — Use the "Strategy" or "Plugin" pattern
A type switch that grows with every new variant (`if type == 'CREDIT' … else if type == 'PAYPAL'`) is the violation. The fix is one strategy per variant behind an interface, registered in the composition root and selected by key; adding a variant adds a class, it does not edit the use case.

### LSP — Use the "Is-Substitutable-For" test
Ask: "Can I pass a `<Subtype>` everywhere a `<BaseType>` is expected and get correct behavior?" If not → LSP violation. The classic case in this layout: an in-memory repository that does not raise the same errors as the SQL one — tests pass against a substitute that is not substitutable.

### ISP — Use Role Interfaces
A fat port (a repository with reading, writing, deletion and reporting) makes every use case depend on methods it never calls. The fix is role interfaces declared by the consumers (`CustomerReader`, `CustomerWriter`); one gateway may implement several.

### DIP — Constructor Injection
A use case that constructs its gateway (`new PostgresOrderRepository()`) depends on infrastructure. The fix is a port in the module's `application/ports/output/`, received through the constructor, with the implementation constructed only in the composition root.

**For before/after code in the project's language, read** [TypeScript / JavaScript](references/typescript.md), [Python](references/python.md) or [Go](references/go.md).

## Output
Provide:
1. Total violation count per principle.
2. All violations with file:line, description, and recommended fix.
3. A prioritized fix list (most critical first).
4. Code showing before/after for each fix applied.
