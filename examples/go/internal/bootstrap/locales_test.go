package bootstrap

import (
	"slices"
	"testing"

	customerscontrollers "example.com/shop/internal/modules/customers/infrastructure/controllers"
	orderspresenters "example.com/shop/internal/modules/orders/infrastructure/presenters"
	"example.com/shop/internal/platform/web"
)

// The composition root promises that every locale the app speaks is spoken everywhere: no text falls back by accident.
func TestEveryCatalogHasExactlyTheAppLocalesEachWithTheSameKeys(t *testing.T) {
	sorted := func(m map[string]string) []string {
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		slices.Sort(keys)
		return keys
	}
	for name, catalog := range map[string]map[string]map[string]string{
		"customers": customerscontrollers.Messages, "orders": orderspresenters.Messages, "platform/web": web.Messages,
	} {
		if len(catalog) != len(Locales) {
			t.Errorf("%s: has %d locales, the app speaks %d", name, len(catalog), len(Locales))
		}
		want := sorted(catalog[Locales[0]])
		for _, locale := range Locales {
			if got := sorted(catalog[locale]); len(got) == 0 || !slices.Equal(got, want) {
				t.Errorf("%s/%s: keys %v, want %v", name, locale, got, want)
			}
		}
	}
}
