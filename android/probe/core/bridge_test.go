package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestBridgeRejectsUntrustedRequests(t *testing.T) {
	u, _ := url.Parse("https://100.93.254.50:5001")
	handler := bridgeHandler("127.0.0.1:12345", "secret", u, nil)
	for _, tc := range []struct{ name, host, origin, cookie, method, path string }{
		{"missing capability", "127.0.0.1:12345", "", "", "GET", "/"},
		{"wrong capability", "127.0.0.1:12345", "", "wrong", "GET", "/"},
		{"rebinding host", "evil.example", "", "secret", "GET", "/"},
		{"cross origin", "127.0.0.1:12345", "https://evil.example", "secret", "POST", "/api/login"},
		{"null origin", "127.0.0.1:12345", "null", "secret", "POST", "/api/login"},
		{"websocket without origin", "127.0.0.1:12345", "", "secret", "GET", "/ws"},
		{"connect proxy", "127.0.0.1:12345", "", "secret", "CONNECT", "/"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, tc.path, nil)
			r.Host = tc.host
			r.Header.Set("Origin", tc.origin)
			r.AddCookie(&http.Cookie{Name: bridgeCookie, Value: tc.cookie})
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != 403 {
				t.Fatalf("status %d", w.Code)
			}
		})
	}
}

func TestBridgeForwardsHTTPWithoutLeakingCapability(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cookie") != "" {
			t.Error("capability leaked upstream")
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("bearer token changed")
		}
		if r.Header.Get("Origin") != "http://"+r.Host {
			t.Error("origin not mapped to upstream host")
		}
		body, _ := io.ReadAll(r.Body)
		if string(body) != "test-body" {
			t.Error("POST body changed")
		}
		w.Header().Set("Set-Cookie", "paneboard_bridge=attacker")
		w.Header().Set("Content-Security-Policy", "default-src 'self'")
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()
	u, _ := url.Parse(upstream.URL)
	r := httptest.NewRequest("POST", "/api/login", strings.NewReader("test-body"))
	r.Host = "127.0.0.1:12345"
	r.Header.Set("Origin", "http://"+r.Host)
	r.Header.Set("Authorization", "Bearer test-token")
	r.AddCookie(&http.Cookie{Name: bridgeCookie, Value: "secret"})
	w := httptest.NewRecorder()
	bridgeHandler(r.Host, "secret", u, http.DefaultTransport).ServeHTTP(w, r)
	if w.Code != 200 || w.Body.String() != "ok" {
		t.Fatalf("unexpected response %d %s", w.Code, w.Body.String())
	}
	if w.Header().Get("Set-Cookie") != "" {
		t.Fatal("remote cookie reached WebView")
	}
	if len(w.Header().Values("Content-Security-Policy")) != 2 {
		t.Fatal("server CSP not preserved")
	}
}

func TestBridgeWebSocketEcho(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cookie") != "" || r.Header.Get("Origin") != "http://"+r.Host {
			t.Error("unsafe upgrade headers")
			return
		}
		ws, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer ws.CloseNow()
		kind, body, err := ws.Read(r.Context())
		if err != nil {
			return
		}
		_ = ws.Write(r.Context(), kind, body)
	}))
	defer upstream.Close()
	u, _ := url.Parse(upstream.URL)
	bridge := httptest.NewUnstartedServer(nil)
	bridge.Config.Handler = bridgeHandler(bridge.Listener.Addr().String(), "secret", u, http.DefaultTransport)
	bridge.Start()
	defer bridge.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(bridge.URL, "http")+"/ws", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {bridge.URL}, "Cookie": {bridgeCookie + "=secret"}}})
	if err != nil {
		t.Fatal(err)
	}
	defer ws.CloseNow()
	if err := ws.Write(ctx, websocket.MessageText, []byte("terminal-test")); err != nil {
		t.Fatal(err)
	}
	_, body, err := ws.Read(ctx)
	if err != nil || string(body) != "terminal-test" {
		t.Fatalf("echo %q: %v", body, err)
	}
}

func TestPinnedTransportFailsClosed(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("ok")) }))
	defer server.Close()
	u, _ := url.Parse("https://100.93.254.50:5001")
	pin := sha256.Sum256(server.Certificate().Raw)
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		if address != u.Host {
			t.Errorf("wrong destination %s", address)
		}
		return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
	}
	for _, good := range []bool{true, false} {
		selected := pin[:]
		if !good {
			selected = make([]byte, 32)
		}
		transport := pinnedTransport(dial, u, selected)
		client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
		res, err := client.Get(u.String())
		if good && err != nil {
			t.Fatal(err)
		}
		if !good && err == nil {
			t.Error("wrong pin accepted")
		}
		if res != nil {
			res.Body.Close()
		}
		transport.CloseIdleConnections()
	}
	transport := pinnedTransport(func(context.Context, string, string) (net.Conn, error) { return nil, errors.New("tunnel unavailable") }, u, pin[:])
	defer transport.CloseIdleConnections()
	_, err := (&http.Client{Transport: transport}).Get(u.String())
	if err == nil || !strings.Contains(err.Error(), "tunnel unavailable") {
		t.Fatal("did not fail with tunnel error")
	}
}

func TestDirectBridgeUsesSelectedDialAndRejectsWrongPin(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("direct connection"))
	}))
	defer server.Close()
	pin := sha256.Sum256(server.Certificate().Raw)
	for _, fingerprint := range []string{hex.EncodeToString(pin[:]), strings.Repeat("00", 32)} {
		calls := 0
		dial := func(ctx context.Context, network, address string) (net.Conn, error) {
			calls++
			if address != "server.example:5023" {
				t.Errorf("unexpected direct destination %s", address)
			}
			return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
		}
		address, capability, stop, err := startBridge(dial, "https://server.example:5023", fingerprint, "direct")
		if err != nil {
			t.Fatal(err)
		}
		req, _ := http.NewRequest(http.MethodGet, address+"/", nil)
		req.AddCookie(&http.Cookie{Name: bridgeCookie, Value: capability})
		res, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
		if err != nil {
			stop()
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		stop()
		if fingerprint == hex.EncodeToString(pin[:]) {
			if res.StatusCode != 200 || string(body) != "direct connection" {
				t.Fatalf("direct forwarding failed: %d %s", res.StatusCode, body)
			}
		} else if res.StatusCode != http.StatusBadGateway {
			t.Fatalf("incorrect direct pin accepted: %d", res.StatusCode)
		}
		if calls != 1 {
			t.Fatalf("expected exactly one selected transport call, got %d", calls)
		}
	}
}
