// Package subscribers holds the loyalty module's driving adapters for events, like controllers for requests: each
// turns another module's integration event into loyalty's own request. Importing orders' PUBLISHED CONTRACT is the
// second legal crossing between modules (the first is a call to another module's ports/input); orders never knows
// that loyalty exists.
package subscribers

import (
	"context"

	"example.com/shop/internal/modules/loyalty/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/published"
)

type AwardPointsUseCase interface {
	Execute(ctx context.Context, req interactors.AwardPointsRequest) (interactors.AwardPointsResponse, error)
}

type OrderPlaced struct{ awardPoints AwardPointsUseCase }

func NewOrderPlaced(awardPoints AwardPointsUseCase) *OrderPlaced {
	return &OrderPlaced{awardPoints: awardPoints}
}

func (s *OrderPlaced) Handle(ctx context.Context, e published.OrderPlacedV1) error {
	_, err := s.awardPoints.Execute(ctx, interactors.AwardPointsRequest{OrderID: e.OrderID, CustomerID: e.CustomerID, TotalCents: e.TotalCents})
	return err
}
