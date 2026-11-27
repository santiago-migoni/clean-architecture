package i18n

import "testing"

var translate = New(Catalog{
	"en": {"HELLO": "Hello {name}", "ONLY_EN": "Only in English"},
	"es": {"HELLO": "Hola {name}"},
}, "en")

func TestWritesTheKeyForTheLocaleWithItsParameters(t *testing.T) {
	if got := translate("es", "HELLO", map[string]string{"name": "Ada"}); got != "Hola Ada" {
		t.Fatal(got)
	}
	if got := translate("en", "HELLO", map[string]string{"name": "Ada"}); got != "Hello Ada" {
		t.Fatal(got)
	}
}

func TestFallsBackToTheDefaultLocaleThenToTheKeyItself(t *testing.T) {
	for _, tc := range []struct{ locale, key, want string }{
		{"es", "ONLY_EN", "Only in English"},
		{"fr", "ONLY_EN", "Only in English"},
		{"es", "MISSING", "MISSING"},
	} {
		if got := translate(tc.locale, tc.key, nil); got != tc.want {
			t.Errorf("%s %s: got %q, want %q", tc.locale, tc.key, got, tc.want)
		}
	}
}

func TestLeavesAParameterItWasNotGivenAsItIs(t *testing.T) {
	if got := translate("en", "HELLO", nil); got != "Hello {name}" {
		t.Fatal(got)
	}
}
