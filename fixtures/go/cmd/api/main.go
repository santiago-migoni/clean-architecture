// Entry point: builds the app through the composition root and runs one use case.
package main

import (
	"fmt"

	"example.com/shop/internal/bootstrap"
)

func main() {
	app := bootstrap.New()
	id, err := app.PlaceOrder.Execute("c-1", 3)
	fmt.Println(id, err)
}
