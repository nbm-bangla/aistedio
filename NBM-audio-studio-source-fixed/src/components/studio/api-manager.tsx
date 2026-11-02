"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, KeyRound, LoaderCircle, Plus, Save, ShieldCheck, Trash2, Wifi } from "lucide-react";
import { Dialog } from "./dialog";
import { bn } from "@/lib/studio/format";

type Service = "translation" | "tts";
type PublicConfig = { id: string; name: string; projectId: string; translationModel: string; ttsModel: string; enabled: boolean; keyConfigured: boolean; maskedKey: string };
type Limits = { requestsPerMinute: number; requestsPerHour: number; requestsPerDay: number; maxConcurrent: number; minDelaySeconds: number; maxChunkCharacters: number };
type State = { configurations: PublicConfig[]; selected: Record<Service, string | null>; limits: Limits; sharedProjects: string[]; configured: boolean; usage?: Record<string, { requests: number; completed: number; failed: number; characters: number }> };
const emptyForm = { id: "", name: "", projectId: "", apiKey: "", translationModel: "gemini-3.5-flash-lite", ttsModel: "gemini-3.8-flash-tts", enabled: true };
const LIMIT_LABELS: { key: keyof Limits; label: string }[] = [
  { key: "requestsPerMinute", label: "প্রতি মিনিটে সর্বোচ্চ অনুরোধ" }, { key: "requestsPerHour", label: "প্রতি ঘণ্টায় সর্বোচ্চ অনুরোধ" },
  { key: "requestsPerDay", label: "প্রতিদিন সর্বোচ্চ অনুরোধ" }, { key: "maxConcurrent", label: "সর্বোচ্চ একসঙ্গে অনুরোধ" },
  { key: "minDelaySeconds", label: "অনুরোধের মাঝে বিরতি (সেকেন্ড)" }, { key: "maxChunkCharacters", label: "প্রতি অংশে সর্বোচ্চ অক্ষর" },
];

export function ApiManager({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState("");
  const [state, setState] = useState<State | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selectionVersion = useRef<Record<Service, number>>({ translation: 0, tts: 0 });
  const selectionQueue = useRef<Record<Service, Promise<void>>>({ translation: Promise.resolve(), tts: Promise.resolve() });
  const confirmedSelection = useRef<Record<Service, string | null>>({ translation: null, tts: null });

  async function call(action: string, payload: Record<string, unknown> = {}) {
    const response = await fetch("/api/studio/manager", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }), cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "API Manager request failed.");
    if (data.configurations && action !== "select") {
      confirmedSelection.current = data.selected;
      setState(data as State);
    }
    return data;
  }
  async function load() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/studio/manager", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "API Manager could not be loaded.");
      confirmedSelection.current = data.selected;
      setState(data as State);
    } catch (error) { setMessage(error instanceof Error ? error.message : "API Manager could not be loaded."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await call("save", form); setForm(emptyForm); setMessage("কনফিগারেশন নিরাপদভাবে সংরক্ষিত হয়েছে।"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "সংরক্ষণ হয়নি।"); }
    finally { setBusy(false); }
  }
  async function update(action: string, payload: Record<string, unknown>, success?: string) {
    setBusy(true); setMessage("");
    try { const data = await call(action, payload); if (data.ok) setMessage(data.note); else if (success) setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "অনুরোধটি সম্পন্ন হয়নি।"); }
    finally { setBusy(false); }
  }
  function selectApi(service: Service, id: string | null, selector: HTMLSelectElement) {
    if (!state) return;
    const version = ++selectionVersion.current[service];
    setState((current) => current ? { ...current, selected: { ...current.selected, [service]: id } } : current);
    setMessage("নির্বাচন সংরক্ষণ হচ্ছে…");
    requestAnimationFrame(() => { if (selector.isConnected && !selector.disabled) selector.focus(); });
    selectionQueue.current[service] = selectionQueue.current[service].then(async () => {
      try {
        const data = await call("select", { service, id }) as State;
        confirmedSelection.current[service] = data.selected[service];
        if (selectionVersion.current[service] !== version) return;
        setState((current) => current ? { ...current, selected: { ...current.selected, [service]: data.selected[service] } } : data);
        setMessage("নির্বাচন সংরক্ষিত হয়েছে।");
      } catch (error) {
        if (selectionVersion.current[service] !== version) return;
        setState((current) => current ? { ...current, selected: { ...current.selected, [service]: confirmedSelection.current[service] } } : current);
        setMessage(error instanceof Error ? error.message : "নির্বাচন সংরক্ষণ হয়নি। আগের নির্বাচন ফিরিয়ে দেওয়া হয়েছে।");
      }
    });
  }
  function edit(item: PublicConfig) { setForm({ ...emptyForm, ...item, apiKey: "" }); }

  return <Dialog title="API Manager" eyebrow="MANUAL API CONTROL" onClose={onClose} wide>
    <p className="dialog-description">অনুবাদ ও বাংলা TTS-এর API আলাদাভাবে বেছে নিন। কোনো স্বয়ংক্রিয় পরিবর্তন, রোটেশন বা ফলব্যাক নেই।</p>
    {!state ? <div className="api-manager-access">
      <label className="form-label" htmlFor="manager-token">সার্ভার অ্যাডমিন টোকেন</label>
      <div className="api-token-row"><KeyRound size={16} /><input id="manager-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="NBM_ADMIN_TOKEN" /><button className="primary-button" onClick={() => void load()} disabled={!token || busy}>{busy ? <LoaderCircle size={15} className="spin" /> : "খুলুন"}</button></div>
      {message && <p className="api-manager-message" role="alert">{message}</p>}
      <p className="api-manager-security"><ShieldCheck size={15} />এই টোকেন শুধু এই ডায়ালগ খোলা থাকা পর্যন্ত মেমরিতে থাকে। API key কখনো ব্রাউজারে সংরক্ষিত হয় না।</p>
    </div> : <>
      {state.sharedProjects.length > 0 && <div className="api-warning" role="status">একই Google Cloud Project ID-তে একাধিক কনফিগারেশন রয়েছে। সেগুলো একই কোটা ভাগ করতে পারে: {state.sharedProjects.join(", ")}</div>}
      <section className="api-selectors">
        {(["translation", "tts"] as Service[]).map((service) => <label key={service} className="api-selector-label">{service === "translation" ? "অনুবাদ API নির্বাচন" : "বাংলা TTS API নির্বাচন"}<select aria-label={service === "translation" ? "অনুবাদ API নির্বাচন" : "বাংলা TTS API নির্বাচন"} value={state.selected[service] ?? ""} disabled={busy} onChange={(event) => void selectApi(service, event.target.value || null, event.currentTarget)}><option value="">নির্বাচিত নয় · NOT CONNECTED</option>{state.configurations.filter((item) => item.enabled && item.keyConfigured).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.projectId}</option>)}</select></label>)}
      </section>
      <p className="api-manager-message" role="status" aria-live="polite">{busy ? <LoaderCircle size={14} className="spin" /> : message && <Check size={14} />}{message}</p>
      <section className="api-config-list"><div className="api-section-heading"><h3>API কনফিগারেশন</h3><button className="secondary-button" onClick={() => setForm(emptyForm)}><Plus size={14} />নতুন API যোগ করুন</button></div>
        {state.configurations.length === 0 && <p className="api-empty">এখনো কোনো API যোগ করা হয়নি।</p>}
        {state.configurations.map((item) => <article key={item.id} className="api-config-card"><div className="api-config-main"><strong>{item.name}</strong><span>{item.projectId}</span><code>{item.maskedKey || "কী নেই"}</code><small>{item.enabled ? "সক্রিয়" : "নিষ্ক্রিয়"} · {item.keyConfigured ? "Key সংরক্ষিত" : "NOT CONNECTED"}</small></div><div className="api-config-actions"><button className="secondary-button" onClick={() => edit(item)}>সম্পাদনা</button><button className="secondary-button" onClick={() => void update("toggle", { id: item.id, enabled: !item.enabled }, "অবস্থা হালনাগাদ হয়েছে।")}>{item.enabled ? "নিষ্ক্রিয়" : "সক্রিয়"}</button><button className="secondary-button" onClick={() => void update("test", { id: item.id, service: "translation" })} title="অনুবাদ মডেলের metadata সংযোগ পরীক্ষা করুন"><Wifi size={14} />অনুবাদ পরীক্ষা</button><button className="secondary-button" onClick={() => void update("test", { id: item.id, service: "tts" })} title="TTS মডেলের metadata সংযোগ পরীক্ষা করুন"><Wifi size={14} />TTS পরীক্ষা</button><button className="icon-button" aria-label={`${item.name} মুছুন`} onClick={() => { if (window.confirm(`${item.name} মুছবেন? এই ক্রিয়া ফিরিয়ে আনা যাবে না।`)) void update("delete", { id: item.id }); }}><Trash2 size={14} /></button></div></article>)}
      </section>
      <section className="api-usage"><h3>ব্যবহার · গত ২৪ ঘণ্টা</h3><p>এগুলো অ্যাপের অনুরোধ ও অক্ষরের গণনা; Google-এর প্রকৃত টোকেন/বিলিং ডেটা নয়। Provider data পাওয়া গেলে আলাদাভাবে যোগ হবে।</p><div>{(["translation", "tts"] as Service[]).map((service) => { const row = state.usage?.[service]; return <span key={service}><strong>{service === "tts" ? "বাংলা TTS" : "অনুবাদ"}</strong>{row ? `${bn(row.requests)} অনুরোধ · ${bn(row.completed)} সম্পন্ন · ${bn(row.failed)} ব্যর্থ · ${bn(row.characters)} অক্ষর` : "কোনো অনুরোধ নেই"}</span>; })}</div></section>
      <form className="api-config-form" onSubmit={submit}><h3>{form.id ? "কনফিগারেশন সম্পাদনা" : "নতুন কনফিগারেশন"}</h3><div className="api-form-grid">
        <label className="form-label">নাম<input className="form-input" required maxLength={40} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="API 01" /></label>
        <label className="form-label">Google Cloud Project ID<input className="form-input" required maxLength={200} value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })} /></label>
        <label className="form-label">API key<input className="form-input" type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={form.id ? "আগের key রাখতে ফাঁকা রাখুন" : "Google API key"} /></label>
        <label className="form-label">অনুবাদ মডেল<input className="form-input" required value={form.translationModel} onChange={(event) => setForm({ ...form, translationModel: event.target.value })} /></label>
        <label className="form-label">TTS মডেল<input className="form-input" required value={form.ttsModel} onChange={(event) => setForm({ ...form, ttsModel: event.target.value })} /></label>
        <label className="api-enabled"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />এই কনফিগারেশন সক্রিয়</label>
      </div><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setForm(emptyForm)}>ফর্ম পরিষ্কার</button><button className="primary-button" disabled={busy}><Save size={15} />নিরাপদে সংরক্ষণ</button></div></form>
      <section className="api-limits"><h3>ব্যবহার নিরাপত্তা সীমা</h3><div className="api-limits-grid">{LIMIT_LABELS.map(({ key, label }) => <label key={key}>{label}<input type="number" min={1} value={state.limits[key]} onChange={(event) => setState({ ...state, limits: { ...state.limits, [key]: Number(event.target.value) } })} /></label>)}</div><button className="secondary-button" onClick={() => void update("limits", { limits: state.limits }, "নিরাপত্তা সীমা সংরক্ষিত হয়েছে।")}>সীমা সংরক্ষণ</button></section>
      <p className="api-manager-security"><ShieldCheck size={15} />Key AES-256-GCM দিয়ে সার্ভারের encrypted vault-এ থাকে। Vault key হারালে সংরক্ষিত key উদ্ধার করা যাবে না।</p>
    </>}
  </Dialog>;
}
