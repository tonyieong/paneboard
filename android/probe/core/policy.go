package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func target(raw, fingerprint string) (*url.URL, []byte, error) {
	return connectionTarget(raw, fingerprint, "tailscale")
}

func connectionTarget(raw, fingerprint, mode string) (*url.URL, []byte, error) {
	u, err := connectionURL(raw, mode)
	if err != nil {
		return nil, nil, err
	}
	pin, err := hex.DecodeString(strings.Join(strings.Fields(strings.ReplaceAll(fingerprint, ":", "")), ""))
	if err != nil || len(pin) != sha256.Size {
		return nil, nil, errors.New("A verified SHA-256 certificate fingerprint is required")
	}
	return u, pin, nil
}

func connectionURL(raw, mode string) (*url.URL, error) {
	if mode != "tailscale" && mode != "direct" {
		return nil, errors.New("Unknown connection mode")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || strings.Contains(raw, "#") || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("Use an HTTPS server address without a path or credentials")
	}
	ip, err := netip.ParseAddr(u.Hostname())
	if mode == "tailscale" && (err != nil || !(netip.MustParsePrefix("100.64.0.0/10").Contains(ip) || netip.MustParsePrefix("fd7a:115c:a1e0::/48").Contains(ip))) {
		return nil, errors.New("Embedded Tailscale requires a Tailscale IP address")
	}
	port := 443
	if strings.HasSuffix(u.Host, ":") {
		return nil, errors.New("Enter a valid HTTPS port")
	}
	if u.Port() != "" {
		port, err = strconv.Atoi(u.Port())
		if err != nil || port < 1 || port > 65535 {
			return nil, errors.New("HTTPS port must be between 1 and 65535")
		}
	}
	u.Host = net.JoinHostPort(u.Hostname(), strconv.Itoa(port))
	return u, nil
}

func checkCertificate(state tls.ConnectionState, pin []byte, now time.Time) error {
	if len(state.PeerCertificates) == 0 {
		return errors.New("No server certificate")
	}
	cert := state.PeerCertificates[0]
	sum := sha256.Sum256(cert.Raw)
	if !bytes.Equal(sum[:], pin) {
		return errors.New("Certificate fingerprint mismatch")
	}
	if now.Before(cert.NotBefore) || now.After(cert.NotAfter) {
		return errors.New("Server certificate is outside its validity period")
	}
	return nil
}

// serverFingerprint reads the leaf certificate's SHA-256 so the user can
// confirm it once, after which it is pinned like a typed one. Only the
// embedded Tailscale dialer may offer this: WireGuard has already
// authenticated the node that owns the address, so the first connection
// cannot be intercepted. A direct connection has no such guarantee.
func serverFingerprint(dial tailnetDial, raw string, now time.Time) (string, error) {
	u, err := connectionURL(raw, "tailscale")
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	conn, err := dial(ctx, "tcp", u.Host)
	if err != nil {
		return "", fmt.Errorf("Could not reach the server: %w", err)
	}
	client := tls.Client(conn, &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: true, ServerName: u.Hostname()})
	defer client.Close()
	if err := client.HandshakeContext(ctx); err != nil {
		return "", fmt.Errorf("TLS handshake failed: %w", err)
	}
	state := client.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return "", errors.New("No server certificate")
	}
	leaf := state.PeerCertificates[0]
	if now.Before(leaf.NotBefore) || now.After(leaf.NotAfter) {
		return "", errors.New("Server certificate is outside its validity period")
	}
	sum := sha256.Sum256(leaf.Raw)
	return hex.EncodeToString(sum[:]), nil
}

// deviceHostname turns the name chosen in the app into a Tailscale hostname:
// lowercase letters, digits and single hyphens, at most one DNS label long.
// Anything unusable falls back to a generic name rather than failing to start.
func deviceHostname(name string) string {
	var b strings.Builder
	hyphen := false
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			hyphen = false
		case !hyphen && b.Len() > 0:
			b.WriteByte('-')
			hyphen = true
		}
	}
	host := strings.Trim(b.String(), "-")
	if len(host) > 63 {
		host = strings.TrimRight(host[:63], "-")
	}
	if host == "" {
		return "paneboard-android"
	}
	return host
}
