package handlers

import (
	"net/http"

	"github.com/openstatushq/openstatus/apps/checker/pkg/timescale"
)

type Handler struct {
	TimescaleClient timescale.Client
	Secret          string
	CloudProvider   string
	Region          string
}

// Authorization could be handle by middleware

func NewHTTPClient() *http.Client {
	return &http.Client{}
}
