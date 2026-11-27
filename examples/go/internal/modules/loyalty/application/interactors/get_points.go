package interactors

import (
	"context"

	"example.com/shop/internal/modules/loyalty/application/ports/output"
)

type GetPointsResponse struct {
	CustomerID string `json:"customerId"`
	Points     int    `json:"points"`
}

// GetPoints answers the points a customer has. A customer loyalty never heard of has 0: loyalty does not ask the
// customers module whether the customer exists, and it may not have received an order event yet.
type GetPoints struct{ awards output.AwardRepository }

func NewGetPoints(awards output.AwardRepository) *GetPoints { return &GetPoints{awards: awards} }

func (uc *GetPoints) Execute(ctx context.Context, customerID string) (GetPointsResponse, error) {
	points, err := uc.awards.PointsOf(ctx, customerID)
	return GetPointsResponse{CustomerID: customerID, Points: points}, err
}
