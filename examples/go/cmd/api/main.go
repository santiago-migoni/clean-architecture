// Entry point: reads the environment, builds the app through internal/bootstrap and serves it. No wiring here.
// The only file of the project that touches os.Getenv.
package main

import (
	"log"
	"net/http"
	"os"
	"strconv"

	"example.com/shop/internal/bootstrap"
)

func main() {
	settings, err := bootstrap.LoadSettings(os.Getenv) // a wrong setting stops here, before anything starts
	if err != nil {
		log.Fatal(err)
	}
	handler, conn, err := bootstrap.New(bootstrap.Config{DatabaseDSN: settings.DatabaseDSN, AuditLog: func(line string) { log.Printf("audit %s", line) }})
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	log.Printf("Server running on port %d", settings.Port)
	log.Fatal(http.ListenAndServe(":"+strconv.Itoa(settings.Port), handler))
}
