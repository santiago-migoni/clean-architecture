# Tests — Go

The complete, tested version of this code is [`examples/go`](../../../examples/go): the same application in every language.

Tests are `<file>_test.go` beside the code, in the same package (or `<package>_test` to test only the exported API). Gateway tests against a real database carry `//go:build integration`. HTTP e2e tests live in `cmd/<app>/` or `internal/bootstrap/`, using `httptest`.

```text
go test ./...                       # unit: no database, no network
go test -tags integration ./...     # plus the gateways against a real database
```

The test of each piece is in that piece's skill reference: entity (`entity`), interactor (`usecase`), presenter (`presenter`), controller (`controller`), gateway integration test (`gateway`). This page holds what spans several pieces.

## Cross-module gateway — only the other module's input port is faked

```go
// internal/modules/orders/infrastructure/gateways/customer_lookup_gateway_test.go
package gateways

import (
	"context"
	"testing"

	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
)

type fakeGetCustomer map[string]customersinput.CustomerView

func (f fakeGetCustomer) Execute(_ context.Context, id string) (*customersinput.CustomerView, error) {
	if v, ok := f[id]; ok {
		return &v, nil
	}
	return nil, nil
}

func TestExistsTranslatesTheCustomersAnswerIntoABoolean(t *testing.T) {
	g := NewCustomerLookupGateway(fakeGetCustomer{"c-1": {ID: "c-1", Name: "Ada"}})
	if ok, _ := g.Exists(context.Background(), "c-1"); !ok {
		t.Fatal("c-1 should exist")
	}
	if ok, _ := g.Exists(context.Background(), "ghost"); ok {
		t.Fatal("ghost should not exist")
	}
}
```

## Repository contract — the same scenarios against every implementation

A function that takes a constructor runs the same assertions against the in-memory gateway (in the unit suite) and the SQL one (in the integration suite).

```go
// internal/modules/customers/application/ports/output/contract.go
// Package output: the contract test lives with the port, so every implementation can run it.
package output

import (
	"context"
	"errors"
	"testing"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/domain"
)

func RunCustomerRepositoryContract(t *testing.T, newRepo func(t *testing.T) CustomerRepository) {
	t.Run("same email is a conflict and the first customer survives", func(t *testing.T) {
		ctx := context.Background()
		repo := newRepo(t)
		ada, _ := domain.NewCustomer("c-1", "Ada", "ada@example.com")
		other, _ := domain.NewCustomer("c-2", "Other", "ada@example.com")
		if err := repo.Save(ctx, ada); err != nil {
			t.Fatal(err)
		}
		var conflict *interactors.EmailAlreadyRegisteredError
		if err := repo.Save(ctx, other); !errors.As(err, &conflict) {
			t.Fatalf("want EmailAlreadyRegisteredError, got %v", err)
		}
		if got, _ := repo.FindByID(ctx, "c-1"); got == nil || got.Name() != "Ada" {
			t.Fatal("the first customer did not survive")
		}
	})
}
```

```go
// internal/modules/customers/infrastructure/gateways/inmemory/customer_repository_test.go
package inmemory

import (
	"testing"

	"example.com/shop/internal/modules/customers/application/ports/output"
)

func TestCustomerRepositoryContract(t *testing.T) {
	output.RunCustomerRepositoryContract(t, func(*testing.T) output.CustomerRepository { return NewCustomerRepository() })
}
```

A helper that imports `testing` in a non-test file is compiled into the package; keep it small, or move it to an `internal/.../outputtest` package that only tests import.

## HTTP e2e through the test composition root

```go
// internal/bootstrap/e2e_test.go
package bootstrap

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPlaceOrderForAnUnknownCustomerIs404(t *testing.T) {
	server := httptest.NewServer(NewForTest().Handler)
	defer server.Close()

	res, err := http.Post(server.URL+"/orders", "application/json",
		strings.NewReader(`{"customerId":"ghost","items":[{"productId":"p1","quantity":1,"unitPriceCents":250}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("want 404, got %d", res.StatusCode)
	}
}

func TestMalformedJSONIs400(t *testing.T) {
	rec := httptest.NewRecorder()
	NewForTest().Handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(`{`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}
```

The same scenarios run against `bootstrap.New` with a real database in the integration suite (`//go:build integration`).
