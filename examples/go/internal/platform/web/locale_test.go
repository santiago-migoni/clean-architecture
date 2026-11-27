package web

import "testing"

func TestNegotiateLocale(t *testing.T) {
	for header, want := range map[string]string{
		"":                   "en",
		"es":                 "es",
		"es-AR":              "es",
		"ES-ar":              "es",
		"fr, es;q=0.5":       "es",
		"en;q=0.4, es;q=0.8": "es",
		"es;q=0, en":         "en",
		"*":                  "en",
		"fr-FR, de;q=0.8":    "en",
	} {
		if got := NegotiateLocale(header, []string{"en", "es"}); got != want {
			t.Errorf("Accept-Language %q: got %s, want %s", header, got, want)
		}
	}
}
