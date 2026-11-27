package web

import "example.com/shop/internal/platform/i18n"

// Messages are the answers platform/web writes itself (no module is involved in them).
var Messages = i18n.Catalog{
	"en": {"MALFORMED_JSON": "Malformed JSON", "UNKNOWN_ERROR": "Unexpected error"},
	"es": {"MALFORMED_JSON": "JSON mal formado", "UNKNOWN_ERROR": "Error inesperado"},
}
