"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, AudioLines, BookOpen, Clock3, FileText, FolderOpen, Headphones, Languages, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { bn, shortDate, translationProgress } from "@/lib/studio/format";
import type { DocumentKind, StudioDocument } from "@/lib/studio/types";

export function SavedWork({ documents, onOpen, onDelete, onNew }: { documents: StudioDocument[]; onOpen: (doc: StudioDocument) => void; onDelete: (doc: StudioDocument) => void; onNew: () => void }) {
  const [filter, setFilter] = useState<"all" | DocumentKind>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const filtered = useMemo(() => documents.filter((doc) => (filter === "all" || doc.kind === filter) && `${doc.title} ${doc.text} ${doc.sourceText}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, "bn") : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [documents, filter, search, sort]);

  return <section className="saved-work" aria-label="সংরক্ষিত কাজ">
    <div className="work-collection-heading"><h2><FolderOpen size={17} />আপনার সংগ্রহ <span>{bn(documents.length)}</span></h2><button className="primary-button small" onClick={onNew}><Plus size={15} />নতুন কাজ</button></div>
    <div className="work-toolbar"><div className="work-filters" role="group" aria-label="কাজের ধরন">{([{ id: "all", title: "সব কাজ" }, { id: "audio", title: "বাংলা অডিও" }, { id: "translation", title: "অনুবাদ ও অডিও" }] as const).map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.title}</button>)}</div><div className="work-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="আপনার কাজ খুঁজুন…" aria-label="সংরক্ষিত কাজ খুঁজুন" /></div><select className="work-sort" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="কাজ সাজান"><option value="recent">সাম্প্রতিক আগে</option><option value="name">নাম অনুসারে</option></select></div>
    {filtered.length ? <div className="work-grid">{filtered.map((doc) => {
      const progress = translationProgress(doc);
      return <article className="work-card panel" key={doc.id}>
        <div className="work-card-top"><span className={`work-type-icon ${doc.kind}`}>{doc.kind === "audio" ? <AudioLines size={21} /> : <Languages size={21} />}</span><span className="work-language">{doc.sourceLanguage === "bn" ? "বাংলা" : doc.sourceLanguage === "en" ? "ইংরেজি → বাংলা" : "উর্দু → বাংলা"}</span><button className="icon-button work-delete" onClick={() => onDelete(doc)} aria-label={`‘${doc.title}’ মুছে ফেলুন`} title="কাজ মুছে ফেলুন"><Trash2 size={14} /></button></div>
        <div className="work-card-title"><h3><button onClick={() => onOpen(doc)}>{doc.title || "শিরোনামহীন লেখা"}</button></h3>{doc.isExample && <span className="tiny-tag">নমুনা</span>}</div><p className="work-excerpt" dir={doc.sourceLanguage === "ur" && !doc.text ? "rtl" : "ltr"}>{doc.text || doc.sourceText || "আপনার নতুন গল্পের প্রথম শব্দটির অপেক্ষায়…"}</p>
        <div className="work-status-area">{doc.kind === "translation" ? <><div className="work-progress-label"><span>{doc.translationStatus === "complete" ? "অনুবাদ সম্পূর্ণ" : doc.translationStatus === "paused" ? "অনুবাদ বিরত আছে" : doc.translationStatus === "failed" ? "অনুবাদে আবার চেষ্টা প্রয়োজন" : doc.translationStatus === "processing" ? "অনুবাদ হচ্ছে" : "অনুবাদ শুরু হয়নি"}</span><strong>{bn(progress)}%</strong></div><div className="translation-progress"><span style={{ width: `${progress}%` }} /></div></> : <div className="original-text-status"><FileText size={12} />মূল বাংলা লেখা সংরক্ষিত<ShieldCheck size={12} /></div>}<div className={`work-audio-status${doc.audioStatus === "ready" ? " ready" : ""}`}><i />{doc.audioStatus === "ready" ? "অডিও প্রস্তুত" : doc.audioStatus === "generating" ? "অডিও তৈরি হচ্ছে" : doc.audioStatus === "failed" ? "অডিও অংশে আবার চেষ্টা দরকার" : "অডিও তৈরি হয়নি"}</div></div>
        <div className="work-card-footer"><span><Headphones size={12} />{doc.voiceId}<i /><Clock3 size={11} />{shortDate(doc.updatedAt)}</span><button onClick={() => onOpen(doc)}>কাজ খুলুন<ArrowUpRight size={15} /></button></div>
      </article>;
    })}</div> : <div className="work-empty"><BookOpen size={38} strokeWidth={1} /><h3>{search ? "মিলে যায় এমন কোনো কাজ নেই।" : "এখানে নতুন গল্পের জায়গা আছে।"}</h3><p>{search ? "অন্য কোনো নাম বা শব্দ দিয়ে খুঁজে দেখুন।" : "একটি নতুন লেখা দিয়ে আপনার সংগ্রহের শুরু হোক।"}</p>{!search && <button className="secondary-button" onClick={onNew}><Plus size={15} />নতুন কাজ তৈরি করুন</button>}</div>}
    <div className="local-storage-note"><ShieldCheck size={15} /><p>কাজ এই ব্রাউজারের IndexedDB-তে সংরক্ষিত থাকে।<span>অডিও সার্ভারের স্থানীয় ডেটা ফোল্ডারে থাকে; এই সেটআপে ক্লাউড সংরক্ষণ বা বহু-ডিভাইস সিঙ্ক নেই।</span></p></div>
  </section>;
}
