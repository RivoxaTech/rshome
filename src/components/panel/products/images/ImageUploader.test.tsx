// @vitest-environment jsdom
/**
 * S22 BUG-14: when the upload itself succeeds but the Server Action that attaches the image to the
 * product rejects (a dropped connection, an expired session), the file row must show an error
 * and the batch must finish — not hang at "uploading" forever with an unhandled rejection.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageUploader } from "./ImageUploader";

const addProductImageAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/panel/(protected)/products/[id]/actions", () => ({ addProductImageAction }));

/** An XMLHttpRequest that answers every upload with a successful 201 and a well-shaped path. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 201;
  responseText = JSON.stringify({ path: `products/${"a".repeat(32)}`, width: 800, height: 600 });
  open() {}
  send() {
    FakeXhr.instances.push(this);
    setTimeout(() => this.onload?.(), 0);
  }
}

describe("ImageUploader", () => {
  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    addProductImageAction.mockReset();
    FakeXhr.instances = [];
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows an error and finishes the batch when the add action rejects", async () => {
    addProductImageAction.mockRejectedValue(new Error("network down"));
    const onAdded = vi.fn();
    const onError = vi.fn();
    render(<ImageUploader productId={1} remaining={5} onAdded={onAdded} onError={onError} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
    await userEvent.setup().upload(input, file);

    await waitFor(() => expect(screen.getByText(/couldn't be added to the product/i)).toBeInTheDocument());
    expect(addProductImageAction).toHaveBeenCalledTimes(1);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("reports success normally when the add action resolves", async () => {
    addProductImageAction.mockResolvedValue({ ok: true });
    const onAdded = vi.fn();
    render(<ImageUploader productId={1} remaining={5} onAdded={onAdded} onError={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.setup().upload(input, new File([new Uint8Array([1, 2, 3])], "ok.png", { type: "image/png" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
  });
});
