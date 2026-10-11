import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { Toaster } from "sonner";
import { createIcons, icons } from "lucide";
import "../../src/theme.css";
import "../../src/pages/cashier/cashier.css";
import { baseApi } from "../../src/api/baseApi";
import TerminalPaymentModal from "../../src/pages/cashier/TerminalPaymentModal";
import TerminalProgressModal from "../../src/pages/cashier/TerminalProgressModal";
import SellPaymentOverlay from "../../src/pages/cashier/SellPaymentOverlay";
import TerminalReaderSummary from "../../src/pages/cashier/TerminalReaderSummary";

const store = configureStore({ reducer: { [baseApi.reducerPath]: baseApi.reducer,
  auth: () => ({ locations: [{ locationId: 3 }] }), pos: () => ({}) },
  middleware: get => get().concat(baseApi.middleware) });
window.lucide = { icons, createIcons: options => createIcons({ icons, ...options }) };

function Harness() {
  const [open, setOpen] = useState(true);
  const [approved, setApproved] = useState(false);
  const fixture = window.testFixture || "terminal";
  const props = { open, onClose: () => setOpen(false), amount: 550, locationId: 3,
    posDeviceId: 4, sourceType: "booking", sourceId: 10,
    onApproved: () => { setApproved(true); setOpen(false); } };
  return <><Toaster /><button onClick={() => setOpen(true)}>Reopen payment</button>
    {approved && <p>Verified approval</p>}
    {fixture === "summary" && <TerminalReaderSummary posDeviceId={4} locationId={3} locked />}
    {fixture === "terminal" && open && <TerminalPaymentModal {...props} />}
    {fixture === "progress" && open && <TerminalProgressModal transactionId={99} amount={550}
      onComplete={props.onApproved} onCancelled={() => setOpen(false)} onFailed={() => setOpen(false)} />}
    {fixture === "checkout" && open && <SellPaymentOverlay open={open} onClose={() => setOpen(false)}
      onSeparateSale={() => setOpen(false)}
      onComplete={() => setOpen(false)} draftPayment={{ totalAmount: 550, subTotal: 500, taxAmount: 50,
        draft: { checkoutKey: "co_recovery", checkoutCartChanged: new URLSearchParams(window.location.search).get("changed") === "1", guestName: "Test Guest", regularItems: [{}],
          payload: { locationId: 3, guestInfo: { guestName: "Test Guest" } } } }} />}
  </>;
}

createRoot(document.getElementById("root")).render(<Provider store={store}><div data-app="cashier"><Harness /></div></Provider>);
