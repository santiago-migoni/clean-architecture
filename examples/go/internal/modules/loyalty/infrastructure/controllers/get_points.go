// Package controllers turns HTTP requests into loyalty use case calls. GetPoints never fails for a known reason (an
// unknown customer has 0 points), so it has no texts to translate.
package controllers

import (
	"context"
	"encoding/json"
	"net/http"

	"example.com/shop/internal/modules/loyalty/application/interactors"
)

type GetPointsUseCase interface {
	Execute(ctx context.Context, customerID string) (interactors.GetPointsResponse, error)
}

type GetPoints struct{ useCase GetPointsUseCase }

func NewGetPoints(useCase GetPointsUseCase) *GetPoints { return &GetPoints{useCase: useCase} }

func (c *GetPoints) Handle(w http.ResponseWriter, r *http.Request, _ string) {
	res, err := c.useCase.Execute(r.Context(), r.PathValue("customerId"))
	if err != nil {
		panic(err) // unexpected: the recovery middleware in platform/web logs it and answers 500
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}
