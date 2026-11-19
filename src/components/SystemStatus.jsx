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
      ? "text-risk-low"
      : status === "offline"
      ? "text-risk-high"
      : "text-gray-400";

  return (
    <div
      className="flex items-center gap-1.5 font-display text-xs text-ink/60"
      title={status === "online" ? `Backend v${info?.version ?? "?"}` : undefined}
    >
      <span className={dotColor} aria-hidden="true">
        ●
      </span>
      <span>
        {status === "checking" && "Checking…"}
        {status === "online" && "Online"}
        {status === "offline" && "Offline"}
      </span>
    </div>
  );
}
