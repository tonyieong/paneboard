// Paneboard's connection-only Android prototype. Communication with the Activity
// uses private stdin/stdout pipes, not an unauthenticated localhost listener.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/wlynxg/anet"
	"tailscale.com/ipn"
	"tailscale.com/net/netmon"
	"tailscale.com/tsnet"
)

var outputMu sync.Mutex

func emit(kind, value string) {
	outputMu.Lock()
	defer outputMu.Unlock()
	_ = json.NewEncoder(os.Stdout).Encode(map[string]string{"type": kind, "value": value})
}

// Android blocks ordinary netlink interface enumeration for modern target SDKs.
func interfaces() ([]netmon.Interface, error) {
	all, err := anet.Interfaces()
	if err != nil {
		return nil, err
	}
	result := make([]netmon.Interface, 0, len(all))
	for i := range all {
		addresses, err := anet.InterfaceAddrsByInterface(&all[i])
		if err != nil {
			return nil, err
		}
		result = append(result, netmon.Interface{Interface: &all[i], AltAddrs: addresses})
	}
	return result, nil
}

func probe(dial tailnetDial, raw, fingerprint, mode string) error {
	u, pin, err := connectionTarget(raw, fingerprint, mode)
	if err != nil {
		return err
	}
	transport := pinnedTransport(dial, u, pin)
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u.Scheme+"://"+u.Host+"/api/config", nil)
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("HTTPS probe failed: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTPS returned %d", res.StatusCode)
	}
	var config struct {
		AuthRequired bool `json:"authRequired"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&config); err != nil {
		return errors.New("Server did not return valid configuration JSON")
	}
	emit("result", fmt.Sprintf("HTTPS OK; server login required: %t", config.AuthRequired))
	if !config.AuthRequired {
		return errors.New("WebSocket probe requires server authentication to be enabled; no pane will be opened")
	}
	ws, _, err := websocket.Dial(ctx, "wss://"+u.Host+"/ws?paneId=paneboard-connection-probe", &websocket.DialOptions{
		HTTPClient: client, HTTPHeader: http.Header{"Origin": []string{u.Scheme + "://" + u.Host}},
	})
	if err != nil {
		return fmt.Errorf("WebSocket upgrade failed: %w", err)
	}
	defer ws.CloseNow()
	_, _, err = ws.Read(ctx)
	var closeError websocket.CloseError
	if !errors.As(err, &closeError) || closeError.Code != websocket.StatusPolicyViolation || closeError.Reason != "Login required" {
		return errors.New("Expected authentication rejection (1008) from WebSocket")
	}
	emit("result", "WebSocket OK; unauthenticated access correctly rejected (1008). No terminal opened.")
	return nil
}

func main() {
	log.SetOutput(io.Discard)
	if len(os.Args) != 2 {
		emit("error", "Missing app-private state directory")
		return
	}
	mode := os.Getenv("PANEBOARD_CONNECTION_MODE")
	if mode != "tailscale" && mode != "direct" {
		emit("error", "Unknown connection mode")
		return
	}
	if mode == "direct" {
		emit("state", "DirectReady")
		runCommands((&net.Dialer{Timeout: 20 * time.Second}).DialContext, mode, nil)
		return
	}
	// CGO is disabled, so anet cannot autodetect Android's API level.
	// Its setter takes an Android release, not an SDK number, and only
	// distinguishes releases before/after Android 11 (API 30).
	sdk, err := strconv.Atoi(os.Getenv("PANEBOARD_ANDROID_SDK"))
	if err != nil || sdk < 26 {
		emit("error", "Missing or unsupported Android SDK version")
		return
	}
	if sdk >= 30 {
		anet.SetAndroidVersion(11)
	} else {
		anet.SetAndroidVersion(10)
	}
	netmon.RegisterInterfaceGetter(interfaces)
	s := &tsnet.Server{Dir: os.Args[1], Hostname: "paneboard-android-probe", Logf: func(string, ...any) {}, UserLogf: func(string, ...any) {}}
	if err := s.Start(); err != nil {
		emit("error", err.Error())
		return
	}
	defer s.Close()
	lc, err := s.LocalClient()
	if err != nil {
		emit("error", err.Error())
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher, err := lc.WatchIPNBus(ctx, ipn.NotifyInitialState)
	if err != nil {
		emit("error", err.Error())
		return
	}
	defer watcher.Close()
	go func() {
		for {
			n, err := watcher.Next()
			if err != nil {
				return
			}
			if n.State != nil {
				emit("state", n.State.String())
			}
			if n.BrowseToURL != nil && *n.BrowseToURL != "" {
				emit("auth", *n.BrowseToURL)
			}
		}
	}()
	runCommands(s.Dial, mode, func() error { return lc.StartLoginInteractive(ctx) })
}

func runCommands(dial tailnetDial, mode string, login func() error) {
	scanner := bufio.NewScanner(os.Stdin)
	var closeBridge func()
	defer func() {
		if closeBridge != nil {
			closeBridge()
		}
	}()
	scanner.Buffer(make([]byte, 4096), 16384)
	for scanner.Scan() {
		var cmd struct{ Op, URL, Pin string }
		if json.Unmarshal(scanner.Bytes(), &cmd) != nil {
			emit("error", "Invalid command")
			continue
		}
		switch cmd.Op {
		case "login":
			if login == nil {
				emit("error", "Tailscale login is not used in direct mode")
			} else if err := login(); err != nil {
				emit("error", err.Error())
			}
		case "probe":
			if err := probe(dial, cmd.URL, cmd.Pin, mode); err != nil {
				emit("error", err.Error())
			}
		case "workspace":
			if closeBridge != nil {
				closeBridge()
				closeBridge = nil
			}
			// Running describes the node, not reachability of the selected server.
			// Verify TLS and server authentication before handing a page to WebView.
			if err := probe(dial, cmd.URL, cmd.Pin, mode); err != nil {
				emit("error", err.Error())
				continue
			}
			address, capability, stop, err := startBridge(dial, cmd.URL, cmd.Pin, mode)
			if err != nil {
				emit("error", err.Error())
				continue
			}
			closeBridge = stop
			payload, _ := json.Marshal(map[string]string{"url": address, "capability": capability})
			emit("workspace", string(payload))
		case "close-workspace":
			if closeBridge != nil {
				closeBridge()
				closeBridge = nil
			}
		case "stop":
			return
		}
	}
}
