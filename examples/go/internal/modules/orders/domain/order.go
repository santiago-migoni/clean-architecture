// Package domain holds the orders module's enterprise business rules. The customer is referenced by id only.
package domain

type Status string

const (
	StatusPending   Status = "PENDING"
	StatusCancelled Status = "CANCELLED"
)

type Line struct {
	ProductID      string
	Quantity       int
	UnitPriceCents int
}

type Order struct {
	id         string
	customerID string
	lines      []Line
	status     Status
}

// NewOrder creates a pending order and enforces its invariants.
func NewOrder(id, customerID string, lines []Line) (*Order, error) {
	return Reconstitute(id, customerID, lines, StatusPending)
}

// Reconstitute rebuilds an order from persistence: the same invariants, no creation-time effects.
func Reconstitute(id, customerID string, lines []Line, status Status) (*Order, error) {
	o := &Order{id: id, customerID: customerID, lines: append([]Line(nil), lines...), status: status}
	if err := o.validate(); err != nil {
		return nil, err
	}
	return o, nil
}

func (o *Order) ID() string         { return o.id }
func (o *Order) CustomerID() string { return o.customerID }
func (o *Order) Status() Status     { return o.status }
func (o *Order) Lines() []Line      { return append([]Line(nil), o.lines...) }

func (o *Order) TotalCents() int {
	total := 0
	for _, l := range o.lines {
		total += l.Quantity * l.UnitPriceCents
	}
	return total
}

// CanBeCancelled is a Critical Business Rule.
func (o *Order) CanBeCancelled() bool { return o.status == StatusPending }

func (o *Order) validate() error {
	invalid := func(reason InvalidOrderReason, detail string) error {
		return &InvalidOrderError{Reason: reason, Detail: detail}
	}
	if o.customerID == "" {
		return invalid(ReasonCustomerRequired, "Order must reference a customer")
	}
	if len(o.lines) == 0 {
		return invalid(ReasonNoLines, "Order must have at least one line")
	}
	for _, l := range o.lines {
		switch {
		case l.ProductID == "":
			return invalid(ReasonProductRequired, "Line product id must not be empty")
		case l.Quantity <= 0:
			return invalid(ReasonInvalidQuantity, "Line quantity must be a positive integer")
		case l.UnitPriceCents < 0:
			return invalid(ReasonInvalidUnitPrice, "Unit price must be a non-negative integer (cents)")
		}
	}
	return nil
}
