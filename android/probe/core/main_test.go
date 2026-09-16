package main

import (
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"strings"
	"testing"
	"time"
)

func TestTargetRestrictions(t *testing.T) {
	pin := strings.Repeat("ab", 32)
	for _, address := range []string{"http://100.93.254.50:5001", "https://100.93.254.50:0", "https://127.0.0.1:5001", "https://example.com:5001", "https://user:password@100.93.254.50:5001", "https://100.93.254.50:5001/private", "https://100.93.254.50:5001/?query=1"} {
		if _, _, err := target(address, pin); err == nil {
			t.Errorf("Accepted unsafe target: %s", address)
		}
	}
	if _, _, err := target("https://100.93.254.50:5001/", pin); err != nil {
		t.Fatal(err)
	}
	if _, _, err := target("https://100.93.254.50:5023/", pin); err != nil {
		t.Fatal(err)
	}
	for _, address := range []string{"https://100.93.254.50", "https://100.93.254.50:8443/", "https://[fd7a:115c:a1e0::1]:8443"} {
		if _, _, err := target(address, pin); err != nil {
			t.Fatalf("Rejected configurable HTTPS endpoint %s: %v", address, err)
		}
	}
	if _, _, err := target("https://100.93.254.50:5001/", "bad-pin"); err == nil {
		t.Fatal("Accepted invalid pin")
	}
}

func TestCertificatePinAndValidity(t *testing.T) {
	now := time.Now()
	cert := &x509.Certificate{Raw: []byte("test certificate"), NotBefore: now.Add(-time.Hour), NotAfter: now.Add(time.Hour)}
	state := tls.ConnectionState{PeerCertificates: []*x509.Certificate{cert}}
	pin := sha256.Sum256(cert.Raw)
	if err := checkCertificate(state, pin[:], now); err != nil {
		t.Fatal(err)
	}
	if err := checkCertificate(state, make([]byte, 32), now); err == nil {
		t.Fatal("Accepted wrong certificate")
	}
	if err := checkCertificate(state, pin[:], now.Add(2*time.Hour)); err == nil {
		t.Fatal("Accepted expired certificate")
	}
	if err := checkCertificate(state, pin[:], now.Add(-2*time.Hour)); err == nil {
		t.Fatal("Accepted future certificate")
	}
	if err := checkCertificate(tls.ConnectionState{}, pin[:], now); err == nil {
		t.Fatal("Accepted missing certificate")
	}
}

func TestDirectTargetKeepsHTTPSAndPinRequirements(t *testing.T) {
	pin := strings.Repeat("ab", 32)
	for _, address := range []string{"https://192.168.1.20:5023", "https://server.example:5023", "https://100.93.254.50:5023"} {
		if _, _, err := connectionTarget(address, pin, "direct"); err != nil {
			t.Fatalf("direct target %s: %v", address, err)
		}
	}
	for _, address := range []string{"http://192.168.1.20:5023", "https://:5023", "https://user:secret@server.example:5023", "https://server.example:5023/path", "https://server.example:65536", "https://server.example:0", "https://server.example:", "https://server.example/?", "https://server.example/#"} {
		if _, _, err := connectionTarget(address, pin, "direct"); err == nil {
			t.Errorf("accepted unsafe direct target %s", address)
		}
	}
	if _, _, err := connectionTarget("https://server.example:5023", "", "direct"); err == nil {
		t.Fatal("direct mode accepted missing pin")
	}
	if _, _, err := connectionTarget("https://100.93.254.50:5023", pin, "automatic"); err == nil {
		t.Fatal("accepted unknown mode")
	}
}
