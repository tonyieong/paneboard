package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"
)

const bridgeCookie = "paneboard_bridge"

type tailnetDial func(context.Context, string, string) (net.Conn, error)

func pinnedTransport(dial tailnetDial, upstream *url.URL, pin []byte) *http.Transport {
	return &http.Transport{
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			if address != upstream.Host {
				return nil, errors.New("Unexpected destination blocked")
			}
			return dial(ctx, network, address)
		},
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
			// Only the selected endpoint: exact verified leaf pin AND validity.
			InsecureSkipVerify: true,
			VerifyConnection:   func(state tls.ConnectionState) error { return checkCertificate(state, pin, time.Now()) },
		},
		ResponseHeaderTimeout: 30 * time.Second,
	}
}

// The capability is delivered only over the Activity's private pipe, then set
// through CookieManager. Never put it in URLs, logs, JavaScript or upstream headers.
func bridgeHandler(host, capability string, upstream *url.URL, transport http.RoundTripper) http.Handler {
	origin := "http://" + host
	proxy := &httputil.ReverseProxy{
		Transport: transport,
		ErrorLog:  log.New(io.Discard, "", 0),
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			http.Error(w, "Embedded connection unavailable. Return to connection settings.", http.StatusBadGateway)
		},
		Rewrite: func(p *httputil.ProxyRequest) {
			p.SetURL(upstream)
			// Origin has already been checked against the local authority below.
			if p.In.Header.Get("Origin") != "" {
				p.Out.Header.Set("Origin", upstream.Scheme+"://"+upstream.Host)
			}
			p.Out.Header.Del("Cookie")
			p.Out.Header.Del("Referer")
		},
		ModifyResponse: func(r *http.Response) error {
			// No remote cookie may replace the local capability. Paneboard uses
			// its ordinary bearer token, untouched by this adapter.
			r.Header.Del("Set-Cookie")
			r.Header.Set("Cache-Control", "no-store")
			// Add a restrictive policy alongside (not instead of) server CSP.
			r.Header.Add("Content-Security-Policy", "connect-src 'self' ws://"+host+"; frame-src 'none'; object-src 'none'; form-action 'self'")
			if location := r.Header.Get("Location"); location != "" {
				u, err := url.Parse(location)
				if err != nil || (u.IsAbs() && (u.Scheme != upstream.Scheme || u.Host != upstream.Host)) || (!u.IsAbs() && u.Host != "") {
					return errors.New("External redirect blocked")
				}
				if u.IsAbs() {
					u.Scheme, u.Host = "http", host
					r.Header.Set("Location", u.String())
				}
			}
			return nil
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(bridgeCookie)
		if r.Host != host || r.URL.IsAbs() || r.Method == http.MethodConnect || err != nil || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(capability)) != 1 {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if value := r.Header.Get("Origin"); value != "" && value != origin {
			http.Error(w, "Forbidden origin", http.StatusForbidden)
			return
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			http.Error(w, "Cross-site request blocked", http.StatusForbidden)
			return
		}
		if r.URL.Path == "/ws" && r.Header.Get("Origin") != origin {
			http.Error(w, "WebSocket origin required", http.StatusForbidden)
			return
		}
		proxy.ServeHTTP(w, r)
	})
}

func startBridge(dial tailnetDial, raw, fingerprint, mode string) (string, string, func(), error) {
	u, pin, err := connectionTarget(raw, fingerprint, mode)
	if err != nil {
		return "", "", nil, err
	}
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return "", "", nil, err
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return "", "", nil, err
	}
	capability := hex.EncodeToString(secret[:])
	transport := pinnedTransport(dial, u, pin)
	ctx, cancel := context.WithCancel(context.Background())
	server := &http.Server{Handler: bridgeHandler(listener.Addr().String(), capability, u, transport), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second, ErrorLog: log.New(io.Discard, "", 0), BaseContext: func(net.Listener) context.Context { return ctx }}
	go func() { _ = server.Serve(listener) }()
	closeBridge := func() { cancel(); _ = server.Close(); transport.CloseIdleConnections() }
	return "http://" + listener.Addr().String(), capability, closeBridge, nil
}
