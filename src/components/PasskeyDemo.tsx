"use client";

import { useEffect, useState } from "react";
import LiveLedger from "./LiveLedger";

/**
 * The real-human beat: a genuine WebAuthn passkey assertion redeemed through the same conditional write.
 * Register a passkey once, cast your one claim, then watch a replay of that exact assertion get denied.
 * Falls back gracefully where passkeys are unavailable — the simulated demo on the home page covers the
 * mechanism either way.
 */

interface StoredCred {
  credentialId: string;
  publicKey: string;
  attestation: string;
  alg: "ES256" | "Ed25519";
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const KEY = "halisi-passkey";

export default function PasskeyDemo() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [cred, setCred] = useState<StoredCred | null>(null);
  const [contextId, setContextId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [lastAssertion, setLastAssertion] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
    setContextId(`passkey_${Math.random().toString(36).slice(2)}`);
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) setCred(JSON.parse(raw));
  }, []);

  async function registerPasskey() {
    setBusy(true);
    setStatus(null);
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const created = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Halisi", id: location.hostname },
          user: { id: userId, name: "halisi-user", displayName: "Halisi user" },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -8 },
          ],
          authenticatorSelection: { userVerification: "preferred", residentKey: "preferred" },
          timeout: 60_000,
          attestation: "none",
        },
      })) as PublicKeyCredential;

      const response = created.response as AuthenticatorAttestationResponse;
      if (typeof response.getPublicKey !== "function") {
        throw new Error("this browser cannot export the passkey public key");
      }
      const spki = response.getPublicKey();
      if (!spki) throw new Error("no public key returned");
      const algNum = response.getPublicKeyAlgorithm();
      const stored: StoredCred = {
        credentialId: bufToB64url(created.rawId),
        publicKey: bufToB64url(spki),
        attestation: "",
        alg: algNum === -8 ? "Ed25519" : "ES256",
      };

      const res = await fetch("/api/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: stored.credentialId, publicKey: stored.publicKey }),
      });
      const reg = await res.json();
      stored.attestation = reg.attestation;
      localStorage.setItem(KEY, JSON.stringify(stored));
      setCred(stored);
      setStatus("Passkey registered. Cast your one claim.");
    } catch (e) {
      setStatus(`Registration cancelled or unsupported: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  async function cast() {
    if (!cred) return;
    setBusy(true);
    setStatus(null);
    try {
      const ch = await (
        await fetch("/api/webauthn/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextId }),
        })
      ).json();

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: b64urlToBuf(ch.challenge),
          allowCredentials: [{ type: "public-key", id: b64urlToBuf(cred.credentialId) }],
          userVerification: "preferred",
          rpId: location.hostname,
          timeout: 60_000,
        },
      })) as PublicKeyCredential;
      const r = assertion.response as AuthenticatorAssertionResponse;

      const payload = {
        tokenId: ch.tokenId,
        contextId,
        credentialId: cred.credentialId,
        clientDataJSON: bufToB64url(r.clientDataJSON),
        authenticatorData: bufToB64url(r.authenticatorData),
        signature: bufToB64url(r.signature),
        publicKey: cred.publicKey,
        attestation: cred.attestation,
        alg: cred.alg,
      };
      setLastAssertion(payload);

      const out = await (
        await fetch("/api/webauthn/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assertion: payload }),
        })
      ).json();
      setStatus(`Claim → ${out.decision}${out.fingerprint ? ` · credential ${out.fingerprint}` : ""}`);
    } catch (e) {
      setStatus(`Assertion cancelled: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  async function replay() {
    if (!lastAssertion) return;
    setBusy(true);
    try {
      const out = await (
        await fetch("/api/webauthn/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assertion: lastAssertion }),
        })
      ).json();
      setStatus(`Replay of the same passkey assertion → ${out.decision}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 22, display: "grid", gap: 16, maxWidth: 640 }}>
      <div>
        <div className="eyebrow">Real passkey</div>
        <h2 style={{ fontSize: 22, marginTop: 6 }}>One claim from a genuine passkey</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>
          This uses your device&apos;s real WebAuthn authenticator. The server verifies the signature, then
          the same conditional write decides your claim — accepted once, replay denied.
        </p>
      </div>

      {supported === false && (
        <div style={{ color: "var(--replay)", fontSize: 14 }}>
          Passkeys aren&apos;t available in this browser. The{" "}
          <a href="/" style={{ color: "var(--accent)" }}>simulated demo</a> shows the same mechanism.
        </div>
      )}

      {supported && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button className="btn btn-primary" onClick={registerPasskey} disabled={busy}>
            {cred ? "Re-register passkey" : "Register a passkey"}
          </button>
          <button className="btn" onClick={cast} disabled={busy || !cred}>
            Cast your one claim
          </button>
          <button className="btn" onClick={replay} disabled={busy || !lastAssertion}>
            Replay the assertion
          </button>
        </div>
      )}

      {status && (
        <div className="mono rise" style={{ fontSize: 13, color: "var(--text)" }}>
          {status}
        </div>
      )}
      {contextId && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <LiveLedger contextId={contextId} />
        </div>
      )}
    </div>
  );
}
