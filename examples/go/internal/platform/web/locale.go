package web

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var qParam = regexp.MustCompile(`^\s*q=([\d.]+)\s*$`)

// NegotiateLocale returns the first supported language in the client's order of preference (q weights, then
// position), matched by its primary subtag ("es-AR" → "es"). supported[0] is the default: no header, "*", or
// nothing supported. Reading Accept-Language is an HTTP detail, so it lives here.
func NegotiateLocale(acceptLanguage string, supported []string) string {
	type wish struct {
		language string
		q        float64
	}
	var wanted []wish
	for _, part := range strings.Split(acceptLanguage, ",") {
		fields := strings.Split(strings.TrimSpace(part), ";")
		q := 1.0
		for _, p := range fields[1:] {
			if m := qParam.FindStringSubmatch(p); m != nil {
				if v, err := strconv.ParseFloat(m[1], 64); err == nil {
					q = v
				} else {
					q = 0
				}
				break
			}
		}
		language := strings.ToLower(strings.SplitN(strings.TrimSpace(fields[0]), "-", 2)[0])
		if language != "" && q > 0 {
			wanted = append(wanted, wish{language, q})
		}
	}
	sort.SliceStable(wanted, func(i, j int) bool { return wanted[i].q > wanted[j].q })
	for _, w := range wanted {
		for _, s := range supported {
			if w.language == s {
				return s
			}
		}
	}
	return supported[0]
}
