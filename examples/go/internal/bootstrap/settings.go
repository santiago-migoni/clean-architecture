package bootstrap

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Settings are the values the process is configured with. The environment is read once, at startup, by the entry
// point (cmd/api), which hands its lookup function to LoadSettings: this package never calls os.Getenv. Every value
// is validated here, so a wrong setting stops the process before it serves anything.
type Settings struct {
	DatabaseDSN string // ":memory:" or a file path
	Port        int
}

var digits = regexp.MustCompile(`^\d+$`)

// LoadSettings reads DB_PATH and PORT through getenv (os.Getenv in production, a map in tests).
func LoadSettings(getenv func(string) string) (Settings, error) {
	dsn := strings.TrimSpace(getenv("DB_PATH"))
	if dsn == "" {
		dsn = ":memory:"
	}
	portText := strings.TrimSpace(getenv("PORT"))
	if portText == "" {
		portText = "8080"
	}
	port := 0
	if digits.MatchString(portText) {
		port, _ = strconv.Atoi(portText)
	}
	if port < 1 || port > 65535 {
		return Settings{}, fmt.Errorf("invalid configuration: PORT must be a whole number from 1 to 65535, got %q", portText)
	}
	return Settings{DatabaseDSN: dsn, Port: port}, nil
}
