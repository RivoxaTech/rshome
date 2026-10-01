"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

type BellState = "checking" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

/** iOS Safari only supports web push once added to the Home Screen (iOS 16.4+), never in-tab. */
function isIosNotInstalled(): boolean {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return isIos && nav.standalone !== true;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function postJson(url: string, method: "POST" | "DELETE", body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * The panel header's bell (BUILD_PLAN.md S21): shown only to an `order.view` holder (the caller
 * checks). The service worker is registered here, only inside the panel, never the storefront.
 */
export function NotificationBell({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<BellState>("checking");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (isIosNotInstalled()) {
      setState("ios-install");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription ? "on" : "off");
    } catch {
      setState("unsupported");
    }
  }, [vapidPublicKey]);

  useEffect(() => {
    // One-shot check of this browser's current support/permission/subscription state, not a
    // subscription to an external store, so the usual "no setState in effects" shape doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
      });
      const json = subscription.toJSON();
      const response = await postJson("/api/push/subscribe", "POST", { endpoint: json.endpoint, keys: json.keys });
      if (!response.ok) throw new Error();
      setState("on");
    } catch {
      setMessage("Could not enable notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await postJson("/api/push/subscribe", "DELETE", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await postJson("/api/push/test", "POST");
      const body = (await response.json()) as { ok?: boolean; sent?: number; error?: string };
      setMessage(response.ok ? `Sent to ${body.sent} device${body.sent === 1 ? "" : "s"}.` : (body.error ?? "Could not send the test notification."));
    } catch {
      setMessage("Could not send the test notification.");
    } finally {
      setBusy(false);
    }
  }

  const dotClass = state === "on" ? "bg-emerald-500" : state === "blocked" ? "bg-destructive" : "";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Notifications"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-muted-foreground hover:bg-secondary hover:text-foreground relative rounded-md p-2 transition-colors"
      >
        <Icon d={ICON_PATHS.bell} className="h-[18px] w-[18px]" />
        {dotClass && <span className={`absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${dotClass}`} />}
      </button>

      {open && (
        <div
          role="menu"
          className="bg-popover border-border shadow-soft absolute top-full right-0 z-50 mt-1.5 w-72 rounded-lg border p-3 text-sm"
        >
          {state === "checking" && <p className="text-muted-foreground">Checking this browser…</p>}

          {state === "unsupported" && <p className="text-muted-foreground">Notifications aren&apos;t supported in this browser.</p>}

          {state === "ios-install" && (
            <p className="text-muted-foreground">
              Add this panel to your Home Screen (Share → Add to Home Screen) to enable notifications. Requires iOS 16.4 or later.
            </p>
          )}

          {state === "blocked" && (
            <p className="text-muted-foreground">
              Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload this page.
            </p>
          )}

          {state === "off" && (
            <>
              <p className="text-muted-foreground mb-2">Get notified here when a new order or screenshot needs your review.</p>
              <button
                type="button"
                onClick={enable}
                disabled={busy}
                className="bg-primary text-primary-foreground w-full rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
              >
                Enable notifications
              </button>
            </>
          )}

          {state === "on" && (
            <>
              <p className="mb-2 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Notifications are on
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={busy}
                  className="border-border hover:bg-secondary rounded-md border px-3 py-1.5 text-left disabled:opacity-60"
                >
                  Send test notification
                </button>
                <button
                  type="button"
                  onClick={disable}
                  disabled={busy}
                  className="text-destructive hover:bg-destructive/10 rounded-md px-3 py-1.5 text-left disabled:opacity-60"
                >
                  Turn off
                </button>
              </div>
            </>
          )}

          {message && <p className="text-muted-foreground mt-2 text-xs">{message}</p>}
        </div>
      )}
    </div>
  );
}
