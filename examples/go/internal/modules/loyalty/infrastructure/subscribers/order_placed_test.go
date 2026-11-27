package subscribers

import (
	"context"
	"testing"

	"example.com/shop/internal/modules/loyalty/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/published"
)

type recording struct {
	requests []interactors.AwardPointsRequest
}

func (r *recording) Execute(_ context.Context, req interactors.AwardPointsRequest) (interactors.AwardPointsResponse, error) {
	r.requests = append(r.requests, req)
	return interactors.AwardPointsResponse{}, nil
}

func TestTranslatesOrdersEventIntoLoyaltysOwnRequest(t *testing.T) {
	useCase := &recording{}
	_ = NewOrderPlaced(useCase).Handle(context.Background(), published.OrderPlacedV1{OrderID: "o-1", CustomerID: "c-1", TotalCents: 1750})
	if len(useCase.requests) != 1 || useCase.requests[0] != (interactors.AwardPointsRequest{OrderID: "o-1", CustomerID: "c-1", TotalCents: 1750}) {
		t.Fatalf("got %+v", useCase.requests)
	}
}
