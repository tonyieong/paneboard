package main

import (
	"bytes"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
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
	if mode != "tailscale" && mode != "direct" {
		return nil, nil, errors.New("Unknown connection mode")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || strings.Contains(raw, "#") || (u.Path != "" && u.Path != "/") {
		return nil, nil, errors.New("Use an HTTPS server address without a path or credentials")
	}
	ip, err := netip.ParseAddr(u.Hostname())
	if mode == "tailscale" && (err != nil || !(netip.MustParsePrefix("100.64.0.0/10").Contains(ip) || netip.MustParsePrefix("fd7a:115c:a1e0::/48").Contains(ip))) {
		return nil, nil, errors.New("Embedded Tailscale requires a Tailscale IP address")
	}
	port := 443
	if strings.HasSuffix(u.Host, ":") {
		return nil, nil, errors.New("Enter a valid HTTPS port")
	}
	if u.Port() != "" {
		port, err = strconv.Atoi(u.Port())
		if err != nil || port < 1 || port > 65535 {
			return nil, nil, errors.New("HTTPS port must be between 1 and 65535")
		}
	}
	u.Host = net.JoinHostPort(u.Hostname(), strconv.Itoa(port))
	pin, err := hex.DecodeString(strings.Join(strings.Fields(strings.ReplaceAll(fingerprint, ":", "")), ""))
	if err != nil || len(pin) != sha256.Size {
		return nil, nil, errors.New("A verified SHA-256 certificate fingerprint is required")
	}
	return u, pin, nil
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
