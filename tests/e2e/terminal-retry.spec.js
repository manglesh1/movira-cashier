import { test, expect } from "@playwright/test";
test.use({ channel: "chrome" });

const configuredReader = { terminalId: 2, displayName: "Front desk", providerTerminalId: "TID-2", model: "T650c", serialNumber: "806-504-444",
  isDefault: true, selectable: true, availability: "unknown", availabilityLabel: "Configured - connectivity unknown" };

test("unknown provider status retains the attempt and never automatically sends another sale or cancellation", async ({ page }) => {
  await page.clock.install();
  let starts = 0, cancels = 0, approved = false;
  await mount(page, "terminal", async path => {
    if (path.endsWith("/start")) { starts++; return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/cancel")) { cancels++; return { status: "pending" }; }
    if (path.endsWith("/status")) return approved ? { status: "captured" } : {
      transactionId: 99, status: "pending", reviewRequired: false, reason: "session_unknown:NOTF",
      message: "The existing payment needs review before another attempt.",
    };
  });
  await expect(page.getByRole("heading", { name: "Payment outcome unknown" })).toBeVisible();
  await page.clock.fastForward(95000);
  expect(starts).toBe(1);
  expect(cancels).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Payment outcome unknown" })).toBeVisible();
  expect(starts).toBe(1);
  await page.screenshot({ path: "test-results/terminal-unknown-outcome.png" });
  approved = true;
  await page.clock.fastForward(11000);
  await expect(page.getByText("Verified approval")).toBeVisible();
  expect(starts).toBe(1);
});

test("locked reader summary still loads the actual assignment", async ({ page }) => {
  await mount(page, "summary", async () => null);
  await expect(page.getByText("Front desk", { exact: true })).toBeVisible();
  await expect(page.getByText("T650c / 806-504-444")).toBeVisible();
  await expect(page.getByText("No assigned reader", { exact: true })).toHaveCount(0);
});

test("reader lookup errors do not claim the POS is unassigned", async ({ page }) => {
  await mount(page, "summary", async path => path.endsWith("/readers") ? { httpStatus: 503, body: { message: "Unavailable" } } : null);
  await expect(page.getByText("Reader settings unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("No assigned reader", { exact: true })).toHaveCount(0);
});

async function mount(page, fixture, handler) {
  page.on("pageerror", error => console.error("Browser error:", error.message));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    const response = await handler(path, route.request()) || (path.endsWith("/readers") ? { data: { defaultTerminalId: 2, readers: [configuredReader] } } : null);
    await route.fulfill({ status: response?.httpStatus || 200, json: response?.body || response || { success: true, data: {} } });
  });
  await page.goto(`/tests/e2e/terminal-harness.html?fixture=${fixture}`);
}

test("uncertain cancellation stays open, then a late approval completes once", async ({ page }) => {
  let starts = 0, approved = false;
  await mount(page, "terminal", async path => {
    if (path.endsWith("/start")) { starts++; return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/cancel")) return { transactionId: 99, status: "pending" };
    if (path.endsWith("/status")) return { transactionId: 99, status: approved ? "captured" : "pending" };
  });
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel payment", exact: true }).click();
  await expect(page.getByText(/Cancellation is not confirmed/)).toBeVisible();
  expect(starts).toBe(1);
  await page.screenshot({ path: "test-results/terminal-pending-cancel.png" });
  approved = true;
  await expect(page.getByText("Verified approval")).toBeVisible();
  expect(starts).toBe(1);
});

test("reader selection preserves the existing on-device tipping flow", async ({ page }) => {
  const starts = [];
  await mount(page, "terminal&tips=1", async (path, request) => {
    if (path.endsWith("/start")) { starts.push(request.postDataJSON()); return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/status")) return { transactionId: 99, status: "pending" };
  }, { autoStart: false });
  await expect(page.getByText("Add a tip on the card reader?")).toBeVisible();
  expect(starts).toHaveLength(0);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  expect(starts).toHaveLength(1);
  expect(starts[0].terminalId).toBe(2);
  expect(starts[0].tip.allocation).toBe("booking_host");
});

test("refresh resumes the saved transaction instead of starting another charge", async ({ page }) => {
  let starts = 0;
  await mount(page, "terminal", async path => {
    if (path.endsWith("/start")) { starts++; return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/status")) return { transactionId: 99, status: "pending" };
  });
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  expect(starts).toBe(1);
});

test("confirmed decline allows a fresh payment attempt", async ({ page }) => {
  const keys = [];
  await mount(page, "terminal", async (path, request) => {
    if (path.endsWith("/start")) { keys.push(request.postDataJSON().idempotencyKey); return { transactionId: keys.length, status: "pending" }; }
    if (path.endsWith("/status")) return { transactionId: keys.length, status: keys.length === 1 ? "failed" : "captured" };
  });
  await expect(page.getByRole("heading", { name: "Declined" })).toBeVisible();
  await page.getByRole("button", { name: "Retry payment", exact: true }).click();
  await expect(page.getByText("Verified approval")).toBeVisible();
  expect(keys).toHaveLength(2); expect(keys[0]).not.toBe(keys[1]);
});

test("existing saved booking resumes without calling createBooking", async ({ page }) => {
  let creates = 0, starts = 0;
  await mount(page, "checkout", async path => {
    if (path.endsWith("/checkout")) return { booking: { bookingId: 10, bookingNumber: "BK-TEST", totalAmount: 550, balanceDue: 550, status: "pending" }, pendingPayment: null };
    if (path.endsWith("/bookings")) { creates++; return { bookingId: 11 }; }
    if (path.endsWith("/start")) { starts++; return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/status")) return { transactionId: 99, status: "pending" };
  });
  await page.getByRole("button", { name: /Complete The Order/i }).click();
  await expect(page.getByText(/Continuing saved order BK-TEST/)).toBeVisible();
  expect(creates).toBe(0); expect(starts).toBe(0);
  await page.getByRole("button", { name: /Complete The Order/i }).click();
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  expect(creates).toBe(0); expect(starts).toBe(1);
});

test("secondary payment modal does not close on an unconfirmed cancel", async ({ page }) => {
  await mount(page, "progress", async path => path.endsWith("/cancel") || path.endsWith("/status") ? { transactionId: 99, status: "pending" } : null);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText(/Cancellation is not confirmed/)).toBeVisible();
});

test("a lost start response retries the same payment identity", async ({ page }) => {
  const keys = [];
  await mount(page, "terminal", async (path, request) => {
    if (path.endsWith("/start")) {
      keys.push(request.postDataJSON().idempotencyKey);
      return keys.length === 1 ? { httpStatus: 502, body: { message: "Reply lost" } }
        : { transactionId: 99, status: "captured" };
    }
  });
  await expect(page.getByText("Reply lost")).toBeVisible();
  await page.getByRole("button", { name: "Check / retry payment" }).click();
  await expect(page.getByText("Verified approval")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test("pending recovery controls fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mount(page, "terminal", async path => path.endsWith("/start") || path.endsWith("/status")
    ? { transactionId: 99, status: "pending" } : null);
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  for (const name of ["Leave pending", "Cancel payment"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
  }
  await page.screenshot({ path: "test-results/terminal-mobile.png" });
});

test("a different saved total cannot silently replace the current checkout", async ({ page }) => {
  let starts = 0;
  await mount(page, "checkout", async path => {
    if (path.endsWith("/checkout")) return { booking: { bookingId: 10, bookingNumber: "BK-OLD", totalAmount: 15.4, balanceDue: 15.4, status: "confirmed" }, pendingPayment: null };
    if (path.endsWith("/start") || path.endsWith("/bookings")) starts++;
  });
  await page.getByRole("button", { name: /Complete The Order/i }).click();
  await expect(page.getByRole("alertdialog", { name: "Different saved order" })).toBeVisible();
  await expect(page.getByText(/Saved order BK-OLD/)).toBeVisible();
  await page.screenshot({ path: "test-results/checkout-mismatch.png" });
  expect(starts).toBe(0);
  await page.getByRole("button", { name: "Start separate sale" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(starts).toBe(0);
});

test("changing products at the same total requires explicit separate checkout", async ({ page }) => {
  let starts = 0;
  await mount(page, "checkout&changed=1", async path => {
    if (path.endsWith("/checkout")) return { booking: { bookingId: 10, bookingNumber: "BK-SAME-PRICE", totalAmount: 550, balanceDue: 550, status: "confirmed" }, pendingPayment: null };
    if (path.endsWith("/start") || path.endsWith("/bookings")) starts++;
  });
  await page.getByRole("button", { name: /Complete The Order/i }).click();
  await expect(page.getByRole("alertdialog", { name: "Different saved order" })).toBeVisible();
  expect(starts).toBe(0);
});

test("Cashier shows only its assigned reader and cannot choose another", async ({ page }) => {
  const requests = [];
  let available = false;
  await mount(page, "terminal", async (path, request) => {
    if (path.endsWith("/readers")) return { data: { defaultTerminalId: 2, readers: [{ ...configuredReader, selectable: available },
      { ...configuredReader, terminalId: 3, displayName: "Other station" }] } };
    if (path.endsWith("/start")) { requests.push(request.postDataJSON()); return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/status")) return { transactionId: 99, status: "pending" };
  });
  await expect(page.getByText("T650c / 806-504-444")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText("Other station")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  available = true;
  await page.getByRole("button", { name: "Refresh assigned reader" }).click();
  await page.getByRole("button", { name: "Continue payment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  expect(requests[0].terminalId).toBe(2);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("reader list failure blocks new payment and refresh recovers", async ({ page }) => {
  let failure = true, starts = 0;
  await mount(page, "terminal", async path => {
    if (path.endsWith("/readers")) return failure ? { httpStatus: 503, body: { message: "Reader list unavailable" } } : { data: { defaultTerminalId: 2, readers: [configuredReader] } };
    if (path.endsWith("/start")) starts++;
  }, { autoStart: false });
  await expect(page.getByRole("alert")).toHaveText("Reader list unavailable");
  await expect(page.getByRole("button", { name: "Continue payment", exact: true })).toBeDisabled();
  failure = false;
  await page.getByRole("button", { name: "Refresh assigned reader" }).click();
  await expect(page.getByRole("button", { name: "Continue payment", exact: true })).toBeEnabled();
  expect(starts).toBe(0);
});

test("no readers and busy default cannot silently start or switch a payment", async ({ page }) => {
  let empty = true, starts = 0;
  await mount(page, "terminal", async path => {
    if (path.endsWith("/readers")) return { data: { defaultTerminalId: 2, readers: empty ? [] : [
      { ...configuredReader, selectable: false, availabilityLabel: "Busy - unresolved payment" },
      { ...configuredReader, terminalId: 3, displayName: "Backup reader", isDefault: false }] } };
    if (path.endsWith("/start")) starts++;
  }, { autoStart: false });
  await expect(page.getByRole("alert")).toContainText("No compatible reader assigned");
  await expect(page.getByRole("button", { name: "Continue payment", exact: true })).toBeDisabled();
  empty = false;
  await page.getByRole("button", { name: "Refresh assigned reader" }).click();
  await expect(page.getByRole("status")).toHaveText("Busy - unresolved payment");
  await expect(page.getByRole("button", { name: "Continue payment", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  expect(starts).toBe(0);
});

test("a busy-reader race cannot expose a Cashier override", async ({ page }) => {
  const requests = [];
  await mount(page, "terminal", async (path, request) => {
    if (path.endsWith("/start")) {
      requests.push(request.postDataJSON());
      return requests.length === 1 ? { httpStatus: 409, body: { error: "terminal_busy", message: "Reader became busy" } }
        : { transactionId: 99, status: "captured" };
    }
  });
  await expect(page.getByText("Reader became busy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change reader", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Check / retry payment", exact: true }).click();
  await expect(page.getByText("Verified approval")).toBeVisible();
  expect(requests.map(r => r.terminalId)).toEqual([2, 2]);
});

test("read-only reader confirmation fits a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mount(page, "terminal", async path => path.endsWith("/readers") ? { data: { defaultTerminalId: 2, readers: [{ ...configuredReader,
    selectable: false, displayName: "Front desk physical terminal with a long venue-specific name" }] } } : null);
  await expect(page.getByRole("button", { name: "Continue payment", exact: true })).toBeDisabled();
  for (const locator of [page.getByRole("button", { name: "Continue payment", exact: true }), page.getByRole("button", { name: "Refresh assigned reader" })]) {
    const box = await locator.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
  }
  await page.screenshot({ path: "test-results/reader-readonly-mobile.png" });
});

test("Control assignment starts automatically and a later default change cannot redirect recovery", async ({ page }) => {
  let defaultTerminalId = 3;
  const starts = [];
  await mount(page, "terminal", async (path, request) => {
    if (path.endsWith("/readers")) return { data: { defaultTerminalId, readers: [configuredReader,
      { ...configuredReader, terminalId: 3, displayName: "Control-assigned reader", isDefault: false }] } };
    if (path.endsWith("/start")) { starts.push(request.postDataJSON()); return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/status")) return { transactionId: 99, status: "pending" };
  });
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  expect(starts).toHaveLength(1);
  expect(starts[0].terminalId).toBe(3);
  await expect(page.getByRole("button", { name: "Change reader", exact: true })).toHaveCount(0);
  defaultTerminalId = 2;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  await expect(page.getByText("Control-assigned reader", { exact: true })).toBeVisible();
  expect(starts).toHaveLength(1);
});

test("checkout uses the Control assignment with no one-sale override", async ({ page }) => {
  const starts = [];
  await mount(page, "checkout", async (path, request) => {
    if (path.endsWith("/checkout")) return { booking: { bookingId: 10, bookingNumber: "BK-TEST", totalAmount: 550, balanceDue: 550, status: "pending" }, pendingPayment: null };
    if (path.endsWith("/start")) { starts.push(request.postDataJSON()); return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/status")) return { transactionId: 99, status: "pending" };
  });
  await expect(page.getByText("Front desk", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change reader", exact: true })).toHaveCount(0);
  await expect(page.getByText("Managed in Movira Control")).toBeVisible();
  await page.getByRole("button", { name: /Complete The Order/i }).click();
  await expect(page.getByText(/Continuing saved order BK-TEST/)).toBeVisible();
  await page.getByRole("button", { name: /Complete The Order/i }).click();
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  expect(starts).toHaveLength(1);
  expect(starts[0].terminalId).toBe(2);
  await page.getByRole("button", { name: "Leave pending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change reader", exact: true })).toHaveCount(0);
});

test("Complete Order refreshes the Control assignment rather than using the panel's cached reader", async ({ page }) => {
  let defaultTerminalId = 2;
  const starts = [];
  await mount(page, "checkout", async (path, request) => {
    if (path.endsWith("/readers")) return { data: { defaultTerminalId, readers: [configuredReader,
      { ...configuredReader, terminalId: 3, displayName: "Updated default", isDefault: false }] } };
    if (path.endsWith("/checkout")) return { booking: { bookingId: 10, bookingNumber: "BK-TEST", totalAmount: 550, balanceDue: 550, status: "pending" }, pendingPayment: null };
    if (path.endsWith("/start")) { starts.push(request.postDataJSON()); return { transactionId: 99, status: "pending" }; }
    if (path.endsWith("/status")) return { transactionId: 99, status: "pending" };
  });
  await expect(page.getByText("Front desk", { exact: true })).toBeVisible();
  defaultTerminalId = 3;
  await page.getByRole("button", { name: /Complete The Order/i }).click();
  await expect(page.getByText(/Continuing saved order BK-TEST/)).toBeVisible();
  await page.getByRole("button", { name: /Complete The Order/i }).click();
  await expect(page.getByRole("heading", { name: "Waiting for card" })).toBeVisible();
  expect(starts).toHaveLength(1);
  expect(starts[0].terminalId).toBe(3);
});
