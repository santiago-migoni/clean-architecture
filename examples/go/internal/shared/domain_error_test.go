package shared

import (
	"errors"
	"fmt"
	"testing"
)

// The shared kernel is tested on its own: no module is imported here.
func TestAModuleErrorWrappingTheBaseIsABusinessRuleViolation(t *testing.T) {
	errInvalidThing := fmt.Errorf("invalid thing: %w", ErrBusinessRule)
	err := fmt.Errorf("%w: a rule was broken", errInvalidThing)
	if !errors.Is(err, ErrBusinessRule) || !errors.Is(err, errInvalidThing) {
		t.Fatalf("%v should match both the base and the module error", err)
	}
}
