package interactors

import (
	"context"
	"testing"

	"example.com/shop/internal/modules/loyalty/domain"
)

// awards is a fake of the AwardRepository port, declared here: a use case test never imports infrastructure.
type awards map[string]*domain.PointsAward

func (a awards) Add(_ context.Context, award *domain.PointsAward) (bool, error) {
	if _, ok := a[award.OrderID()]; ok {
		return false, nil
	}
	a[award.OrderID()] = award
	return true, nil
}

func (a awards) PointsOf(_ context.Context, customerID string) (int, error) {
	total := 0
	for _, award := range a {
		if award.CustomerID() == customerID {
			total += award.Points()
		}
	}
	return total, nil
}

func TestAwardsThePointsOfAnOrderAndAddsThemUpPerCustomer(t *testing.T) {
	ctx, awards := context.Background(), awards{}
	award := NewAwardPoints(awards)
	if res, err := award.Execute(ctx, AwardPointsRequest{"o-1", "c-1", 1750}); err != nil || res != (AwardPointsResponse{Awarded: true, Points: 17}) {
		t.Fatalf("got %+v %v", res, err)
	}
	_, _ = award.Execute(ctx, AwardPointsRequest{"o-2", "c-1", 500})
	_, _ = award.Execute(ctx, AwardPointsRequest{"o-3", "c-2", 9900})
	if res, _ := NewGetPoints(awards).Execute(ctx, "c-1"); res != (GetPointsResponse{CustomerID: "c-1", Points: 22}) {
		t.Fatalf("got %+v", res)
	}
}

func TestCountsAnOrderOnceHoweverManyTimesItsEventArrives(t *testing.T) {
	ctx, awards := context.Background(), awards{}
	award := NewAwardPoints(awards)
	_, _ = award.Execute(ctx, AwardPointsRequest{"o-1", "c-1", 1000})
	if res, _ := award.Execute(ctx, AwardPointsRequest{"o-1", "c-1", 1000}); res != (AwardPointsResponse{Awarded: false, Points: 10}) {
		t.Fatalf("got %+v", res)
	}
	if points, _ := awards.PointsOf(ctx, "c-1"); points != 10 {
		t.Fatalf("got %d points", points)
	}
}

func TestAnswers0PointsForACustomerItNeverHeardOf(t *testing.T) {
	if res, _ := NewGetPoints(awards{}).Execute(context.Background(), "ghost"); res.Points != 0 {
		t.Fatalf("got %+v", res)
	}
}
