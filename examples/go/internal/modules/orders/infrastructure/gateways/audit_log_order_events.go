package gateways

import (
	"context"
	"encoding/json"

	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain/events"
)

// AuditLogOrderEvents implements OrderEvents by writing one JSON line per event to a sink bootstrap injects.
type AuditLogOrderEvents struct{ writeLine func(string) }

var _ output.OrderEvents = (*AuditLogOrderEvents)(nil)

func NewAuditLogOrderEvents(writeLine func(string)) *AuditLogOrderEvents {
	return &AuditLogOrderEvents{writeLine: writeLine}
}

func (a *AuditLogOrderEvents) Publish(_ context.Context, e events.OrderPlaced) error {
	line, err := json.Marshal(e)
	if err != nil {
		return err
	}
	a.writeLine(string(line))
	return nil
}
