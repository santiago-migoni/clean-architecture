// Package interactors holds the loyalty module's use cases.
package interactors

import (
	"context"

	"example.com/shop/internal/modules/loyalty/application/ports/output"
	"example.com/shop/internal/modules/loyalty/domain"
)

type AwardPointsRequest struct {
	OrderID    string
	CustomerID string
	TotalCents int
}

type AwardPointsResponse struct {
	Awarded bool // false when this order had already been awarded
	Points  int  // the points of this order
}

// AwardPoints awards the points of one placed order. It knows nothing of how it is called (an event, a command
// line, a backfill): the subscriber in infrastructure translates orders' event into this request.
type AwardPoints struct{ awards output.AwardRepository }

func NewAwardPoints(awards output.AwardRepository) *AwardPoints { return &AwardPoints{awards: awards} }

func (uc *AwardPoints) Execute(ctx context.Context, req AwardPointsRequest) (AwardPointsResponse, error) {
	award, err := domain.NewPointsAwardForOrder(req.OrderID, req.CustomerID, req.TotalCents)
	if err != nil {
		return AwardPointsResponse{}, err
	}
	awarded, err := uc.awards.Add(ctx, award) // idempotent: one award per order
	if err != nil {
		return AwardPointsResponse{}, err
	}
	return AwardPointsResponse{Awarded: awarded, Points: award.Points()}, nil
}
