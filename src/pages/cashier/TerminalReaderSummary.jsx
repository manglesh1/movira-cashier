import React from "react";
import { useGetTerminalReadersQuery } from "../../features/payments/terminalApi";

export default function TerminalReaderSummary({ posDeviceId, locationId, locked }) {
  const { currentData, error, isFetching } = useGetTerminalReadersQuery(
    { posDeviceId, locationId },
    { skip: !posDeviceId, refetchOnMountOrArgChange: true, pollingInterval: locked ? 0 : 15000, skipPollingIfUnfocused: true },
  );
  const data = currentData?.data;
  const reader = data?.readers?.find(row => String(row.terminalId) === String(data.defaultTerminalId));
  return <div style={{ marginTop: 10, fontSize: 12, fontWeight: 400, overflowWrap: "anywhere" }}>
    <div style={{ fontWeight: 700 }}>Assigned card reader</div>
    <div>{reader?.displayName || (error ? "Reader settings unavailable" : isFetching ? "Loading reader..." : !posDeviceId ? "POS station not selected" : !data ? "Reader settings unavailable" : "No assigned reader")}</div>
    {reader && <div>{[reader.model, reader.serialNumber].filter(Boolean).join(" / ") || reader.providerTerminalId}</div>}
    <div style={{ marginTop: 4 }}>{error ? "Could not refresh reader settings." : locked ? "Payment attempt open" : reader?.availabilityLabel || data?.defaultReaderIssue}</div>
    <div style={{ marginTop: 4 }}>Managed in Movira Control</div>
  </div>;
}
