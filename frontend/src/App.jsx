import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Command,
  FileText,
  Gauge,
  ImagePlus,
  Layers3,
  Loader2,
  LockKeyhole,
  Radio,
  RefreshCcw,
  SendHorizonal,
  ShieldAlert,
  Siren,
  TimerReset,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

const ACTIVE_VIEW_STORAGE_KEY = "delhi-dashboard-active-view";

const views = [
  {
    id: "citizen",
    label: "Citizen Portal",
    eyebrow: "Ingress",
    icon: UserRound,
  },
  {
    id: "officer",
    label: "Field Officer Workspace",
    eyebrow: "Resolution",
    icon: BadgeCheck,
  },
  {
    id: "executive",
    label: "CM Office Executive Hub",
    eyebrow: "Oversight",
    icon: Command,
  },
];

const districts = [
  { id: 1, name: "New Delhi" },
  { id: 2, name: "North Delhi" },
  { id: 3, name: "South Delhi" },
  { id: 4, name: "East Delhi" },
  { id: 5, name: "West Delhi" },
];

const wards = [
  { id: 1, districtId: 2, name: "Rohini Ward 11" },
  { id: 2, districtId: 2, name: "Rohini Ward 12" },
  { id: 3, districtId: 3, name: "Saket Ward 45" },
];

const subcategories = [
  { id: 1, name: "Major Pothole / Road Collapse", department: "PWD" },
  { id: 2, name: "Water Contamination / Supply Outage", department: "DJB" },
  { id: 3, name: "Streetlight Malfunction", department: "PWD" },
];

const priorityRank = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const priorityTone = {
  Critical: "border-rose-200/50 bg-rose-100/60 text-rose-900",
  High: "border-amber-200/50 bg-amber-100/50 text-amber-900",
  Medium: "border-sky-200/50 bg-sky-100/50 text-sky-900",
  Low: "border-emerald-200/50 bg-emerald-100/50 text-emerald-900",
};

const cx = (...classes) => classes.filter(Boolean).join(" ");

const inputClass =
  "w-full rounded-lg border border-[#eae8e0] bg-white px-3 py-2 text-sm " +
  "text-zinc-900 outline-none transition placeholder:text-zinc-400 " +
  "focus:border-[#1a2332] focus:bg-white focus:ring-4 focus:ring-[#1a2332]/5";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(resolveApiError(payload));
  }

  return payload;
}

function resolveApiError(payload) {
  if (!payload) {
    return "Request failed. The API did not return a response body.";
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (Array.isArray(payload.detail)) {
    return payload.detail
      .map((item) => item.msg || item.detail || JSON.stringify(item))
      .join(" ");
  }

  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return "Request failed. Check the API logs for details.";
}

function formatDateTime(value) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function useCountdown(targetDate) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (!targetDate) {
      return {
        expired: false,
        text: "Awaiting SLA",
        seconds: 0,
        progress: 0,
      };
    }

    const target = new Date(targetDate).getTime();
    const remaining = Math.max(0, target - now);
    const seconds = Math.floor(remaining / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const progress = Math.max(
      5,
      Math.min(100, (remaining / (72 * 60 * 60 * 1000)) * 100),
    );

    return {
      expired: remaining === 0,
      text: `${days}d ${hours}h ${minutes}m ${secs}s`,
      seconds,
      progress,
    };
  }, [now, targetDate]);
}

function getSlaMeta(value) {
  const target = new Date(value).getTime();
  const diffHours = (target - Date.now()) / (1000 * 60 * 60);

  if (diffHours < 0) {
    return {
      label: "Breached",
      tone: "border-amber-200/50 bg-amber-100/60 text-amber-900",
      urgency: 100,
    };
  }

  if (diffHours <= 6) {
    return {
      label: `${Math.ceil(diffHours)}h left`,
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      urgency: 80,
    };
  }

  return {
    label: formatDateTime(value),
    tone: "border-[#eae8e0] bg-[#efeee8] text-zinc-700",
    urgency: Math.max(5, 60 - diffHours),
  };
}

function normalizeAlert(alert) {
  if (typeof alert === "string") {
    return {
      type: "general",
      severity: "medium",
      message: alert,
    };
  }

  return {
    type: alert.type || "general",
    severity: alert.severity || "medium",
    message: alert.message || "Administrative signal detected.",
    ...alert,
  };
}

function App() {
  const [activeView, setActiveView] = useState(() => {
    if (typeof window === "undefined") {
      return "citizen";
    }

    const storedView = window.localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    return views.some((view) => view.id === storedView) ? storedView : "citizen";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeView);
    }
  }, [activeView]);

  const activeViewConfig = views.find((view) => view.id === activeView);

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-zinc-900 selection:bg-[#eae8e0]/80">
      <div className="border-b border-[#eae8e0] bg-[#f9f9f7]/85 shadow-sm shadow-[#eae8e0]/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#eae8e0] bg-zinc-900 text-[#f9f9f7] shadow-sm shadow-[#eae8e0]/60">
                <Layers3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  Delhi Accountability Monitoring System
                </p>
                <h1 className="truncate text-lg font-semibold text-zinc-900">
                  {activeViewConfig?.label}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-2 rounded-lg border border-[#eae8e0] bg-[#f9f9f7]/80 px-3 py-2 shadow-sm shadow-[#eae8e0]/50">
                <Radio className="h-3.5 w-3.5 text-emerald-600" />
                API {API_BASE_URL}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-[#eae8e0] bg-[#f9f9f7]/80 px-3 py-2 shadow-sm shadow-[#eae8e0]/50">
                <Activity className="h-3.5 w-3.5 text-sky-600" />
                Live demo controls
              </span>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-[#eae8e0] bg-[#efeee8]/70 p-1.5 shadow-sm shadow-[#eae8e0]/50 backdrop-blur md:grid-cols-3">
            {views.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.id;

              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveView(view.id)}
                  className={cx(
                    "flex items-center justify-between rounded-md px-3 py-2.5 text-left transition",
                    isActive
                      ? "scale-[1.01] bg-zinc-950 text-[#f9f9f7] shadow-md shadow-zinc-950/10"
                      : "text-zinc-600 hover:bg-[#f9f9f7]/80 hover:text-zinc-900",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {view.label}
                      </span>
                      <span
                        className={cx(
                          "block text-xs",
                          isActive ? "text-zinc-300" : "text-zinc-500",
                        )}
                      >
                        {view.eyebrow}
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    className={cx(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-white" : "text-zinc-400",
                    )}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        {activeView === "citizen" && <CitizenPortal />}
        {activeView === "officer" && <FieldOfficerDesk />}
        {activeView === "executive" && <ExecutiveHub />}
      </div>
    </main>
  );
}

function CitizenPortal() {
  const [form, setForm] = useState({
    citizen_id: "1",
    district_id: "2",
    ward_id: "1",
    subcategory_id: "1",
    latitude: "28.613900",
    longitude: "77.209000",
    title: "Road surface failure near school gate",
    description:
      "Large pothole and loose debris are blocking the left lane during peak hours.",
    intake_photo_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [reopenForm, setReopenForm] = useState({
    ticket_id: "",
    remarks: "Issue remains unresolved at the reported location.",
  });
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenError, setReopenError] = useState("");
  const [reopenResult, setReopenResult] = useState(null);
  const countdown = useCountdown(result?.sla_due_date);

  const districtWardOptions = wards.filter(
    (ward) => ward.districtId === Number(form.district_id),
  );

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "district_id") {
        const firstWard = wards.find((ward) => ward.districtId === Number(value));
        next.ward_id = String(firstWard?.id || "");
      }

      return next;
    });
  }

  async function submitIntake(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const payload = {
        citizen_id: Number(form.citizen_id),
        subcategory_id: Number(form.subcategory_id),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        district_id: Number(form.district_id),
        ward_id: Number(form.ward_id),
        title: form.title.trim(),
        description: form.description.trim(),
        intake_photo_url: form.intake_photo_url.trim() || undefined,
      };
      const data = await apiRequest("/api/v1/grievances/intake", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setResult(data);
      const syncPayload = {
        ticket_id: data.ticket_id,
        title: form.title.trim(),
        priority: data.priority,
        sla_due_date: data.sla_due_date,
      };
      window.localStorage.setItem(
        "delhi_latest_ticket",
        JSON.stringify(syncPayload),
      );
      setReopenForm((current) => ({
        ...current,
        ticket_id: data.ticket_id || current.ticket_id,
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitReopen(event) {
    event.preventDefault();
    setReopenLoading(true);
    setReopenError("");
    setReopenResult(null);

    try {
      const data = await apiRequest(
        `/api/v1/grievances/${encodeURIComponent(reopenForm.ticket_id)}/reopen`,
        {
          method: "POST",
          body: JSON.stringify({ remarks: reopenForm.remarks.trim() }),
        },
      );
      setReopenResult(data);
    } catch (requestError) {
      setReopenError(requestError.message);
    } finally {
      setReopenLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_0.85fr]">
      <section className="rounded-lg border border-[#eae8e0] bg-[#f9f9f7] p-5 shadow-sm shadow-[#eae8e0]/50">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              Citizen Ingress
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-900">
              New grievance intake
            </h2>
          </div>
          <div className="rounded-lg border border-[#1a2332]/10 bg-[#1a2332]/5 p-2 text-[#1a2332]">
            <SendHorizonal className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        <form className="grid gap-4" onSubmit={submitIntake}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Citizen ID">
              <input
                className={inputClass}
                min="1"
                type="number"
                value={form.citizen_id}
                onChange={(event) => updateForm("citizen_id", event.target.value)}
              />
            </Field>
            <Field label="District">
              <select
                className={inputClass}
                value={form.district_id}
                onChange={(event) => updateForm("district_id", event.target.value)}
              >
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ward">
              <select
                className={inputClass}
                value={form.ward_id}
                onChange={(event) => updateForm("ward_id", event.target.value)}
              >
                {districtWardOptions.map((ward) => (
                  <option key={ward.id} value={ward.id}>
                    {ward.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Subcategory">
              <select
                className={inputClass}
                value={form.subcategory_id}
                onChange={(event) =>
                  updateForm("subcategory_id", event.target.value)
                }
              >
                {subcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.id}>
                    {subcategory.name} - {subcategory.department}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Latitude">
              <input
                className={inputClass}
                step="0.000001"
                type="number"
                value={form.latitude}
                onChange={(event) => updateForm("latitude", event.target.value)}
              />
            </Field>
            <Field label="Longitude">
              <input
                className={inputClass}
                step="0.000001"
                type="number"
                value={form.longitude}
                onChange={(event) => updateForm("longitude", event.target.value)}
              />
            </Field>
          </div>

          <Field label="Title">
            <input
              className={inputClass}
              maxLength={150}
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
            />
          </Field>

          <Field label="Description">
            <textarea
              className={cx(inputClass, "min-h-28 resize-none")}
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
            />
          </Field>

          <Field label="Photo URL">
            <input
              className={inputClass}
              placeholder="https://..."
              value={form.intake_photo_url}
              onChange={(event) =>
                updateForm("intake_photo_url", event.target.value)
              }
            />
          </Field>

          {error && <InlineError message={error} />}

          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1a2332] px-4 text-sm font-bold text-[#f9f9f7] shadow-md shadow-[#1a2332]/10 transition-all duration-200 hover:bg-[#233044] disabled:cursor-not-allowed disabled:bg-zinc-200"
            disabled={loading}
            type="submit"
            >
            
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <SendHorizonal className="h-4 w-4" aria-hidden="true" />
            )}
            Submit grievance
          </button>
        </form>
      </section>

      <div className="grid gap-5">
        <section className="rounded-lg border border-[#eae8e0] bg-[#f9f9f7] p-5 shadow-sm shadow-[#eae8e0]/50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                Intake Result
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                Live ticket state
              </h2>
            </div>
            <TimerReset className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          </div>

          {result ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-emerald-100/80 bg-emerald-50/50 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 text-emerald-700"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-900">
                      Ticket registered
                    </p>
                    <p className="mt-1 break-all font-mono text-sm text-emerald-800">
                      {result.ticket_id}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricPill label="Status" value={result.status} />
                <MetricPill label="Priority" value={result.priority} />
              </div>

              <div className="rounded-lg border border-[#eae8e0] bg-[#efeee8] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-zinc-600">
                    SLA countdown
                  </span>
                  <Clock3 className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold text-zinc-900">
                  {countdown.expired ? "Breached" : countdown.text}
                </p>
                <div className="mt-3 h-2 rounded-full bg-[#eae8e0]">
                  <div
                    className={cx(
                      "h-2 rounded-full transition-all duration-500",
                      countdown.expired ? "bg-rose-500" : "bg-emerald-500",
                    )}
                    style={{ width: `${countdown.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Due {formatDateTime(result.sla_due_date)}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No ticket submitted"
              detail="The registered ticket will appear here."
            />
          )}
        </section>

        <section className="rounded-lg border border-[#eae8e0] bg-[#f9f9f7] p-5 shadow-sm shadow-[#eae8e0]/50">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                Track & Intervene
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                Citizen veto route
              </h2>
            </div>
            <ShieldAlert className="h-5 w-5 text-rose-600" aria-hidden="true" />
          </div>

          <form className="grid gap-3" onSubmit={submitReopen}>
            <Field label="Resolved Ticket ID">
              <input
                className={cx(inputClass, "font-mono")}
                value={reopenForm.ticket_id}
                onChange={(event) =>
                  setReopenForm((current) => ({
                    ...current,
                    ticket_id: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Remarks">
              <textarea
                className={cx(inputClass, "min-h-24 resize-none")}
                value={reopenForm.remarks}
                onChange={(event) =>
                  setReopenForm((current) => ({
                    ...current,
                    remarks: event.target.value,
                  }))
                }
              />
            </Field>

            {reopenError && <InlineError message={reopenError} />}
            {reopenResult && (
              <InlineSuccess
                message={`Reopened with SLA due ${formatDateTime(
                  reopenResult.sla_due_date,
                )}`}
              />
            )}

            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#eae8e0] bg-[#efeee8] px-4 text-sm font-semibold text-rose-800 transition hover:bg-[#eae8e0]/70 disabled:cursor-not-allowed disabled:border-[#eae8e0] disabled:bg-[#efeee8]/70 disabled:text-zinc-400"
              disabled={
                reopenLoading
                || !reopenForm.ticket_id.trim()
                || !reopenForm.remarks.trim()
              }
              type="submit"
            >
              {reopenLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              )}
              Reopen ticket
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function FieldOfficerDesk() {
  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [officerId, setOfficerId] = useState("1");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolutionPhotoUrl, setResolutionPhotoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timerId = window.setTimeout(executeQueueSync, 0);

    async function executeQueueSync() {
      const normalizedOfficerId = officerId.trim();

      if (!normalizedOfficerId) {
        if (!controller.signal.aborted) {
          setQueue([]);
          setLoadingQueue(false);
        }
        return;
      }

      setLoadingQueue(true);
      setError("");

      try {
        const data = await apiRequest(
          `/api/v1/officer/${encodeURIComponent(normalizedOfficerId)}/queue`,
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setQueue(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message);
          setQueue([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingQueue(false);
        }
      }
    }

    return () => {
      controller.abort();
      window.clearTimeout(timerId);
    };
  }, [officerId, success]);

  const sortedQueue = useMemo(() => {
    return [...queue].sort((left, right) => {
      const leftSla = new Date(left.sla_due_date).getTime();
      const rightSla = new Date(right.sla_due_date).getTime();
      const priorityDelta =
        priorityRank[right.priority] - priorityRank[left.priority];

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return leftSla - rightSla;
    });
  }, [queue]);


  function openResolution(ticket) {
    setSelectedTicket(ticket);
    setResolutionNotes("");
    setResolutionPhotoUrl("");
    setError("");
    setSuccess("");
  }

  function closeResolution() {
    if (!loading) {
      setSelectedTicket(null);
      setError("");
    }
  }

  async function submitResolution(event) {
    event.preventDefault();

    if (!selectedTicket) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await apiRequest(
        `/api/v1/grievances/${encodeURIComponent(
          selectedTicket.ticket_id,
        )}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({
            officer_id: Number(officerId),
            resolution_notes: resolutionNotes.trim(),
            resolution_photo_url: resolutionPhotoUrl.trim(),
          }),
        },
      );

      setQueue((current) =>
        current.filter((ticket) => ticket.ticket_id !== selectedTicket.ticket_id),
      );
      setSuccess(
        `Ticket ${data.ticket_id} moved to ${data.new_status} successfully.`,
      );
      setSelectedTicket(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-[#eae8e0] bg-[#f9f9f7] p-5 shadow-sm shadow-[#eae8e0]/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              Field Operations
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-900">
              Evidence-enforced work queue
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-[#eae8e0] bg-[#efeee8] px-3 py-2 text-sm text-zinc-600">
              <LockKeyhole className="h-4 w-4 text-zinc-500" />
              Officer ID
              <input
                className="h-7 w-20 rounded-md border border-[#eae8e0] bg-[#f9f9f7] px-2 text-sm font-semibold text-zinc-900 outline-none focus:border-[#d9d5c8] focus:ring-2 focus:ring-[#eae8e0]/70"
                min="1"
                type="number"
                value={officerId}
                onChange={(event) => setOfficerId(event.target.value)}
              />
            </label>
            <span className="inline-flex items-center gap-2 rounded-lg border border-[#eae8e0] bg-[#efeee8] px-3 py-2 text-sm text-zinc-600">
              <CircleDot className="h-4 w-4 text-emerald-600" />
              {queue.length} active
            </span>
          </div>
        </div>

        {success && (
          <div className="mt-4">
            <InlineSuccess message={success} />
          </div>
        )}
        {error && !selectedTicket && (
          <div className="mt-4">
            <InlineError message={error} />
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-lg border border-[#eae8e0] bg-[#f9f9f7] shadow-sm shadow-[#eae8e0]/50">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1.25fr_2fr_0.85fr_1fr_0.9fr] gap-3 bg-[#eae8e0] border-b border-[#eae8e0] px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-600">
              <span>Ticket ID</span>
              <span>Title</span>
              <span>Priority</span>
              <span>SLA Target</span>
              <span className="text-right">Action</span>
            </div>

            <div className="divide-y divide-[#eae8e0] bg-[#f9f9f7]">
              {loadingQueue ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm font-medium text-zinc-500">
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Syncing live departmental queue...
                </div>
              ) : queue.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm font-medium text-zinc-500">
                  No open complaints assigned to this officer ward.
                </div>
              ) : (
                sortedQueue.map((ticket, idx) => {
                  const sla = getSlaMeta(ticket.sla_due_date);

                  return (
                    <div
                      key={ticket.ticket_id}
                      className={cx(
                        "grid grid-cols-[1.25fr_2fr_0.85fr_1fr_0.9fr] items-center gap-3 px-4 py-3 text-sm transition hover:bg-[#eae8e0]/60",
                        idx % 2 === 0 ? "bg-[#f9f9f7]" : "bg-[#efeee8]",
                      )}
                    >
                      <span className="min-w-0 break-all font-mono text-xs font-medium text-zinc-700">
                        {ticket.ticket_id}
                      </span>
                      <span className="min-w-0 text-zinc-900">
                        {ticket.title}
                      </span>
                      <span>
                        <Badge className={priorityTone[ticket.priority]}>
                          {ticket.priority}
                        </Badge>
                      </span>
                      <span>
                        <Badge className={sla.tone}>{sla.label}</Badge>
                      </span>
                      <span className="flex justify-end">
                        <button
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1a2332] px-3.5 text-xs font-bold text-[#f9f9f7] shadow-sm shadow-[#1a2332]/10 transition-all duration-200 hover:bg-[#233044]"
                          onClick={() => openResolution(ticket)}
                          type="button"
                        >
                          Resolve
                          <ArrowRight
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </button>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {selectedTicket && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-lg border border-[#eae8e0] bg-[#f9f9f7] shadow-2xl shadow-zinc-950/10 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-[#eae8e0] bg-[#efeee8] p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                  Resolution Evidence
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                  {selectedTicket.ticket_id}
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {selectedTicket.title}
                </p>
              </div>
              <button
                aria-label="Close resolution modal"
                className="grid h-9 w-9 place-items-center rounded-lg border border-[#eae8e0] bg-[#f9f9f7] text-zinc-500 transition hover:bg-[#efeee8] hover:text-zinc-900"
                onClick={closeResolution}
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="grid gap-4 p-5" onSubmit={submitResolution}>
              <Field label="Resolution Notes">
                <textarea
                  className={cx(inputClass, "min-h-32 resize-none")}
                  value={resolutionNotes}
                  onChange={(event) => setResolutionNotes(event.target.value)}
                />
              </Field>

              <Field label="Validation Image URL">
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    placeholder="https://..."
                    value={resolutionPhotoUrl}
                    onChange={(event) =>
                      setResolutionPhotoUrl(event.target.value)
                    }
                  />
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#eae8e0] bg-[#efeee8] text-zinc-500">
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
              </Field>

              {error && <InlineError message={error} />}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  className="h-10 rounded-lg border border-[#eae8e0] bg-[#f9f9f7] px-4 text-sm font-semibold text-zinc-700 transition hover:bg-[#efeee8]"
                  onClick={closeResolution}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  disabled={
                    loading
                    || !resolutionNotes.trim()
                    || !resolutionPhotoUrl.trim()
                  }
                  type="submit"
                >
                  {loading ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Confirm Resolution
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function ExecutiveHub() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadExecutiveAlerts() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/api/v1/admin/executive-alerts");
      setPayload(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  // Side-effect isolated initial layout fetch
  useEffect(() => {
    const controller = new AbortController();

    async function fetchInitialExecutiveAlerts() {
      try {
        const data = await apiRequest("/api/v1/admin/executive-alerts", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setPayload(data);
          setError("");
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchInitialExecutiveAlerts();

    return () => controller.abort();
  }, []);

  const metrics = payload?.metrics || {
    total_complaints: 0,
    pending_count: 0,
    in_progress_count: 0,
    resolved_count: 0,
    reopened_count: 0,
  };
  const alerts = (payload?.alert_details || []).map(normalizeAlert);
  const activePending =
    Number(metrics.pending_count || 0) + Number(metrics.in_progress_count || 0);
  const departmentLoadData = alerts
    .filter((alert) => alert.type === "administrative_sla_breach")
    .map((alert) => ({
      department: alert.department_code || alert.department_name || "Branch",
      Active: Number(alert.active_count || 0),
      Overdue: Number(alert.overdue_count || 0),
    }));
  const chartData = departmentLoadData.length
    ? departmentLoadData
    : [
        {
          department: "All",
          Active: activePending + Number(metrics.reopened_count || 0),
          Overdue: 0,
        },
      ];

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-[#eae8e0] bg-[#f9f9f7] p-5 shadow-sm shadow-[#eae8e0]/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              CM Office Command
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-900">
              Executive alerts and compliance telemetry
            </h2>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#eae8e0] bg-[#f9f9f7] px-4 text-sm font-semibold text-zinc-700 shadow-sm shadow-[#eae8e0]/50 transition hover:bg-[#efeee8] disabled:cursor-not-allowed disabled:text-zinc-400"
            disabled={loading}
            onClick={loadExecutiveAlerts}
            type="button"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            )}
            Refresh
          </button>
        </div>

        {error && <div className="mt-4"><InlineError message={error} /></div>}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={Gauge}
            label="Total Grievances"
            surface="bg-[#efeee8] border-[#eae8e0] shadow-sm shadow-[#eae8e0]/40"
            tone="text-zinc-900"
            value={metrics.total_complaints}
          />
          <KpiCard
            icon={Clock3}
            label="Active Pending"
            surface="bg-amber-50/40 border-amber-200/60 text-amber-900"
            tone="text-amber-900"
            value={activePending}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Verified Resolved"
            surface="bg-emerald-50/40 border-emerald-200/60 text-emerald-900"
            tone="text-emerald-900"
            value={metrics.resolved_count}
          />
          <KpiCard
            icon={RefreshCcw}
            label="Reopened Tickets"
            surface="bg-rose-50/40 border-rose-200/60 text-rose-900"
            tone="text-rose-900"
            value={metrics.reopened_count}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-[#eae8e0] bg-[#f9f9f7] p-5 shadow-sm shadow-[#eae8e0]/50">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                Alert Stream
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                Proactive administrative warnings
              </h2>
            </div>
            <Bell className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          </div>

          {loading && !payload ? (
            <EmptyState
              icon={Loader2}
              title="Loading executive feed"
              detail="Fetching active signals."
              spinning
            />
          ) : alerts.length ? (
            <div className="grid gap-3">
              {alerts.map((alert, index) => (
                <AlertCard
                  alert={alert}
                  key={`${alert.type}-${alert.message}-${index}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BadgeCheck}
              title="No active alerts"
              detail="All monitored rules are currently clear."
            />
          )}
        </section>

        <section className="rounded-lg border border-[#eae8e0] bg-[#f9f9f7] p-5 shadow-sm shadow-[#eae8e0]/50">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                Infrastructure Load
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                Active vs overdue by branch
              </h2>
            </div>
            <Building2 className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          </div>

          <div className="h-80 rounded-lg border border-[#eae8e0] bg-[#efeee8]/70 p-3">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="department"
                  fontSize={12}
                  stroke="#71717a"
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  fontSize={12}
                  stroke="#71717a"
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#f9f9f7",
                    border: "1px solid #eae8e0",
                    borderRadius: 8,
                    boxShadow: "0 10px 30px rgba(24, 24, 27, 0.08)",
                  }}
                />
                <Legend />
                <Bar dataKey="Active" fill="#18181b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Overdue" fill="#e11d48" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

function AlertCard({ alert }) {
  const isCluster = alert.type === "geographic_cluster_surge";
  const isSla = alert.type === "administrative_sla_breach";
  const Icon = isSla ? Siren : AlertTriangle;
  const tone = isSla
    ? "border-rose-100/80 bg-rose-50/50 text-rose-900"
    : isCluster
      ? "border-amber-100/80 bg-amber-50/50 text-amber-900"
      : "border-[#eae8e0] bg-[#efeee8] text-zinc-900";
  const iconTone = isSla
    ? "bg-rose-100/70 text-rose-700"
    : isCluster
      ? "bg-amber-100/70 text-amber-700"
      : "bg-[#f9f9f7] text-zinc-700";

  return (
    <article className={cx("rounded-lg border p-4 shadow-sm shadow-[#eae8e0]/40", tone)}>
      <div className="flex items-start gap-3">
        <div className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", iconTone)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {isSla
                ? "Administrative SLA breach"
                : isCluster
                  ? "Geographic cluster surge"
                  : "Executive signal"}
            </p>
            <span className="rounded-md border border-[#eae8e0] bg-[#f9f9f7]/80 px-2 py-0.5 text-xs font-medium">
              {alert.severity}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6">{alert.message}</p>

          {isSla && (
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <AlertDatum
                label="Department"
                value={alert.department_code || alert.department_name || "N/A"}
              />
              <AlertDatum
                label="Overdue"
                value={String(alert.overdue_count ?? 0)}
              />
              <AlertDatum
                label="Compliance"
                value={`${Math.round(Number(alert.compliance_rate || 0) * 100)}%`}
              />
            </div>
          )}

          {isCluster && (
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <AlertDatum label="Ward" value={alert.ward_name || "N/A"} />
              <AlertDatum
                label="Subcategory"
                value={alert.subcategory_name || "N/A"}
              />
              <AlertDatum
                label="Active"
                value={String(alert.active_count ?? 0)}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function AlertDatum({ label, value }) {
  return (
    <div className="rounded-md border border-[#eae8e0] bg-[#f9f9f7]/80 px-3 py-2">
      <p className="font-medium uppercase tracking-[0.12em] opacity-60">
        {label}
      </p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, surface, tone }) {
  return (
    <article className={cx("rounded-lg border p-4", surface)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-600">{label}</p>
        <Icon className={cx("h-4 w-4", tone)} aria-hidden="true" />
      </div>
      <p className={cx("mt-3 text-3xl font-semibold tabular-nums", tone)}>
        {Number(value || 0).toLocaleString("en-IN")}
      </p>
    </article>
  );
}

function MetricPill({ label, value }) {
  return (
    <div className="rounded-lg border border-[#eae8e0] bg-[#efeee8] p-3">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function Badge({ children, className }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

function InlineError({ message }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-100/80 bg-rose-50/60 px-3 py-2 text-sm text-rose-700">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function InlineSuccess({ message }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-100/80 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-700">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, detail, spinning = false }) {
  return (
    <div className="mt-5 grid min-h-44 place-items-center rounded-lg border border-dashed border-[#eae8e0] bg-[#efeee8]/70 p-6 text-center">
      <div>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg border border-[#eae8e0] bg-[#f9f9f7] text-zinc-500 shadow-sm shadow-[#eae8e0]/50">
          <Icon
            className={cx("h-5 w-5", spinning && "animate-spin")}
            aria-hidden="true"
          />
        </div>
        <p className="mt-3 text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-1 text-sm text-zinc-500">{detail}</p>
      </div>
    </div>
  );
}

export default App;
