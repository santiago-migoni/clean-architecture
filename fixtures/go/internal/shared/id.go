// Package shared is the shared kernel: pure and minimal, imports nothing from the project.
package shared

import "fmt"

type ID string

func NewID(prefix string, n int) ID { return ID(fmt.Sprintf("%s-%d", prefix, n)) }
