// Package inmemory: non-production gateways for the test composition root and the use case tests.
package inmemory

import (
	"context"
	"sync"

	"example.com/shop/internal/modules/loyalty/application/ports/output"
	"example.com/shop/internal/modules/loyalty/domain"
)

type AwardRepository struct {
	mu      sync.Mutex
	byOrder map[string]*domain.PointsAward
}

var _ output.AwardRepository = (*AwardRepository)(nil)

func NewAwardRepository() *AwardRepository {
	return &AwardRepository{byOrder: map[string]*domain.PointsAward{}}
}

func (r *AwardRepository) Add(_ context.Context, a *domain.PointsAward) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.byOrder[a.OrderID()]; ok {
		return false, nil
	}
	r.byOrder[a.OrderID()] = a
	return true, nil
}

func (r *AwardRepository) PointsOf(_ context.Context, customerID string) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	total := 0
	for _, a := range r.byOrder {
		if a.CustomerID() == customerID {
			total += a.Points()
		}
	}
	return total, nil
}
