package output

// PlaceOrderResult is the response model: plain data, no framework objects.
type PlaceOrderResult struct {
	OrderID    string
	Status     string
	TotalCents int
}

// PlaceOrderOutput is the Output Port: implemented by the presenter, called by the interactor.
type PlaceOrderOutput interface {
	Present(result PlaceOrderResult)
	PresentError(err error)
}
