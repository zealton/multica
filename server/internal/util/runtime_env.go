package util

import (
	"os"
	"strings"
)

func IsHostedRuntime() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("VERCEL_ENV")), "production") {
		return true
	}
	return strings.TrimSpace(os.Getenv("RAILWAY_ENVIRONMENT_NAME")) != ""
}
