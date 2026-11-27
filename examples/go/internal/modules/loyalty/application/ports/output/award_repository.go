package output

import (
	"context"

	"example.com/shop/internal/modules/loyalty/domain"
)

// AwardRepository is where loyalty keeps its awards. One award per order, so an event delivered twice counts once.
type AwardRepository interface {
	// Add stores the award; false (and nothing changes) when the order already has one.
	Add(ctx context.Context, award *domain.PointsAward) (bool, error)
	PointsOf(ctx context.Context, customerID string) (int, error)
}
