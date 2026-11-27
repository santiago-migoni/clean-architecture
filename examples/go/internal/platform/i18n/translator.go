// Package i18n turns a message key into text for a locale. A driver, like the database: a project that adopts an
// i18n library (go-i18n, x/text/message) replaces this package, and no module changes. Each module keeps its own
// catalog beside the adapter that writes the text; bootstrap builds one translator per catalog.
package i18n

import "regexp"

// Catalog maps locale → key → text. Parameters are written as {name}. An alias, so a module's plain map fits.
type Catalog = map[string]map[string]string

var param = regexp.MustCompile(`\{(\w+)\}`)

// New returns a translator. A missing locale or key falls back to fallbackLocale, then to the key itself (never to
// an empty text). The result is an unnamed func type, so it fits the Translate type each module declares.
func New(catalog Catalog, fallbackLocale string) func(locale, key string, params map[string]string) string {
	return func(locale, key string, params map[string]string) string {
		text, ok := catalog[locale][key]
		if !ok {
			if text, ok = catalog[fallbackLocale][key]; !ok {
				text = key
			}
		}
		return param.ReplaceAllStringFunc(text, func(whole string) string {
			if v, ok := params[whole[1:len(whole)-1]]; ok {
				return v
			}
			return whole
		})
	}
}
