package bootstrap

// Locales are the languages the app speaks. The first one is the default. A product decision, so it is made in the
// composition root: platform/web negotiates among these, and every module catalog provides each of them.
var Locales = []string{"en", "es"}
