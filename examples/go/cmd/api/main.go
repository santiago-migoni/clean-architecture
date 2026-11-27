// Entry point: reads the environment, builds the app through internal/bootstrap and serves it. No wiring here.
package main

import (
	"log"
	"net/http"
	"os"

	"example.com/shop/internal/bootstrap"
)

func main() {
	dsn := os.Getenv("DB_PATH")
	if dsn == "" {
		dsn = ":memory:"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	handler, conn, err := bootstrap.New(bootstrap.Config{DatabaseDSN: dsn, AuditLog: func(line string) { log.Printf("audit %s", line) }})
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	log.Printf("Server running on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
