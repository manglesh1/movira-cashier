import React, { useEffect, useRef } from "react";
import { useGetTerminalReadersQuery } from "../../features/payments/terminalApi";
import { Icon } from "./Icon";

// Read-only assignment confirmation; Cashier cannot choose another device.
export default function TerminalReaderPicker({ posDeviceId, locationId, currency, autoUseDefault = false, onSelect, onClose }) {
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const { currentData, isFetching, error, refetch } = useGetTerminalReadersQuery(
    { posDeviceId, locationId, currency },
    { skip: !posDeviceId, refetchOnMountOrArgChange: true },
  );
  const data = currentData?.data;
  const reader = data?.readers?.find(row => String(row.terminalId) === String(data.defaultTerminalId));
  const problem = !posDeviceId ? "Pair this POS station before taking card payments."
    : error ? error?.data?.message || "Could not load the assigned reader."
    : !isFetching && !reader ? "No compatible reader assigned. Contact your Movira Control administrator." : null;
  useEffect(() => {
    if (!autoUseDefault || !posDeviceId) return;
    let closed = false;
    refetch().unwrap().then(response => {
      const assigned = response?.data?.readers?.find(row => String(row.terminalId) === String(response.data.defaultTerminalId));
      if (!closed && assigned?.selectable) onSelectRef.current(assigned);
    }).catch(() => {});
    return () => { closed = true; };
  }, [autoUseDefault, posDeviceId, refetch]);
  return <div style={{ textAlign: "left" }}>
    <h2 style={{ fontSize: 20, margin: "0 0 16px" }}>Assigned card reader</h2>
    <div style={{ fontWeight: 700 }}>{reader?.displayName || (isFetching ? "Loading..." : "Not assigned")}</div>
    {reader && <div style={{ marginTop: 8, fontSize: 13, overflowWrap: "anywhere" }}>
      <div>{[reader.model, reader.serialNumber].filter(Boolean).join(" / ") || reader.providerTerminalId}</div>
      <div role="status">{reader.availabilityLabel}</div>
    </div>}
    <p style={{ fontSize: 13 }}>Managed in Movira Control</p>
    {problem && <p role="alert" style={{ color: "#B91C1C", fontSize: 13 }}>{problem}</p>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
      <button type="button" className="a-btn" onClick={onClose}>Close</button>
      <button type="button" className="a-btn" title="Refresh assigned reader" aria-label="Refresh assigned reader"
        disabled={!posDeviceId || isFetching} onClick={() => refetch()}><Icon name="refresh-cw" size={18} /></button>
      <button type="button" className="a-btn a-btn--primary" disabled={!!problem || isFetching || !reader?.selectable}
        onClick={() => onSelect(reader)}>Continue payment</button>
    </div>
  </div>;
}
