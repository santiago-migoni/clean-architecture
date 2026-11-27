package bootstrap

import (
	"strings"
	"testing"
)

// The settings are a pure function of the lookup they are given: no os.Getenv here.
func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestLoadSettingsUsesTheDefaultsWhenNothingIsSet(t *testing.T) {
	got, err := LoadSettings(env(nil))
	if err != nil || got != (Settings{DatabaseDSN: ":memory:", Port: 8080}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestLoadSettingsReadsDBPathAndPort(t *testing.T) {
	got, err := LoadSettings(env(map[string]string{"DB_PATH": "shop.db", "PORT": "8081"}))
	if err != nil || got != (Settings{DatabaseDSN: "shop.db", Port: 8081}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestLoadSettingsTreatsAnEmptyValueAsUnset(t *testing.T) {
	got, err := LoadSettings(env(map[string]string{"DB_PATH": " ", "PORT": ""}))
	if err != nil || got != (Settings{DatabaseDSN: ":memory:", Port: 8080}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestLoadSettingsStopsAtStartupOnABadPortNamingTheSetting(t *testing.T) {
	for _, port := range []string{"abc", "0", "65536", "-1", "80.5", "1e3"} {
		if _, err := LoadSettings(env(map[string]string{"PORT": port})); err == nil || !strings.Contains(err.Error(), "PORT") {
			t.Errorf("PORT=%q: got %v, want an error naming PORT", port, err)
		}
	}
}
