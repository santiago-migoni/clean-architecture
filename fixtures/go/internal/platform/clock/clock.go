// Package clock is a driver: the system clock, injected from the composition root.
package clock

import "time"

type System struct{}

func (System) Now() time.Time { return time.Now() }
