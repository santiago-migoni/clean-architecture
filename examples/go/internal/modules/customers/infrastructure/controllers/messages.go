package controllers

// Messages are the texts the customers controllers send, by locale. Keys are the codes of domain and application
// failures. The catalog belongs to the module: removing the module removes its texts. In Go the controller also
// answers a malformed body itself (it decodes the JSON), so its catalog has that text too.
var Messages = map[string]map[string]string{
	"en": {
		"INVALID_CUSTOMER.NAME_REQUIRED": "Customer name must not be empty",
		"INVALID_CUSTOMER.INVALID_EMAIL": "Customer email is not valid",
		"EMAIL_ALREADY_REGISTERED":       "Email {email} is already registered",
		"CUSTOMER_NOT_FOUND":             "Customer {customerId} not found",
		"MALFORMED_JSON":                 "Malformed JSON",
	},
	"es": {
		"INVALID_CUSTOMER.NAME_REQUIRED": "El nombre del cliente no puede estar vacío",
		"INVALID_CUSTOMER.INVALID_EMAIL": "El email del cliente no es válido",
		"EMAIL_ALREADY_REGISTERED":       "El email {email} ya está registrado",
		"CUSTOMER_NOT_FOUND":             "No existe el cliente {customerId}",
		"MALFORMED_JSON":                 "JSON mal formado",
	},
}

// Translate is what the controllers need to turn a key into text. bootstrap injects an implementation (platform/i18n).
type Translate func(locale, key string, params map[string]string) string
