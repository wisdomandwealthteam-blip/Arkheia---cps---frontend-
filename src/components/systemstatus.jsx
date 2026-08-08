// src/components/SystemStatus.jsx
import { useEffect, useState } from "react";
import { api } from "../utils/apiClient";

export default function SystemStatus() {
  const [status, setStatus] = useState("checking");
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((res) => {
        if (!cancelled) {
          setStatus("online");
          setInfo(res);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dotColor =
    status === "online"
      ? "bg-risk-low"
      : status === "offline"
      ? "bg-risk-high"
      : "bg-gray-400";

  return (
    <div className="flex items-center gap-2 font-display text-xs text-ink/60">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
      <span>
        {status === "checking" && "Checking backend..."}
        {status === "online" && `Backend online — v${info?.version ?? "?"}`}
        {status === "offline" && "Backend unreachable"}
      </span>
    </div>
  );
}
