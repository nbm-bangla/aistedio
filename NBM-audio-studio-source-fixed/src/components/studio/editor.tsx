"use client";

import { useState } from "react";
import { ArrowRight, BookOpen, Check, FileText, Languages, LoaderCircle, LockKeyhole, Maximize2, Minimize2, Pause, PencilLine, Play, RotateCcw, Trash2, Upload } from "lucide-react";
import { bn, characterCount, translationProgress, wordCount } from "@/lib/studio/format";
import { STUDIO_CONFIG } from "@/lib/studio/config";
import type { StudioDocument } from "@/lib/studio/types";

interface EditorProps {
  document: StudioDocument;
  importing: string | null;
  onPatch: (patch: Partial<StudioDocument>) => void;
  onImport: () => void;
  onSample: () => void;
  onClear: () => void;
}

function DocumentToolbar({ document: doc, onPatch, onSample, onClear, expanded, onExpand, disabled }: EditorProps & { expanded: boolean; onExpand: () => void; disabled: boolean }) {
  return <div className="document-toolbar">
    <div className="document-title"><span className="document-title-icon"><FileText size={17} /></span><input aria-label="কাজের নাম" value={doc.title} maxLength={120} onChange={(event) => onPatch({ title: event.target.value })} placeholder="আপনার কাজের নাম" /><PencilLine size={12} className="title-pencil" /></div>
    <div className="editor-tools"><button className="sample-button" onClick={onSample} disabled={disabled}><BookOpen size={13} /><span>নমুনা লেখা</span></button><span className="tool-divider" /><button className="icon-button clear-button" title="লেখা মুছুন" aria-label="লেখা মুছুন" disabled={disabled} onClick={onClear}><Trash2 size={14} /></button><button className="icon-button expand-button" title={expanded ? "এডিটর ছোট করুন" : "এডিটর বড় করুন"} aria-label={expanded ? "এডিটর ছোট করুন" : "এডিটর বড় করুন"} onClick={onExpand}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></div>
  </div>;
}

function TextStatistics({ text }: { text: string }) {
  return <span className="text-statistics"><span>{bn(wordCount(text))} শব্দ</span><i /><span>{bn(characterCount(text))} অক্ষর</span></span>;
}

export function BengaliEditor(props: EditorProps) {
  const [expanded, setExpanded] = useState(false);
  const busy = props.document.audioStatus === "generating";
  return <section className={`editor-panel panel${expanded ? " expanded" : ""}`} aria-label="বাংলা টেক্সট এডিটর">
    <DocumentToolbar {...props} expanded={expanded} onExpand={() => setExpanded(!expanded)} disabled={busy || !!props.importing} />
    <div className="editor-caption"><label htmlFor="bengali-text">আপনার বাংলা লেখা</label><span><LockKeyhole size={11} />হুবহু পাঠ, কোনো পরিবর্তন নয়</span></div>
    <textarea id="bengali-text" className="bengali-textarea" lang="bn" dir="ltr" spellCheck={false} value={props.document.text} maxLength={STUDIO_CONFIG.maxDocumentCharacters} readOnly={busy || !!props.importing} onChange={(event) => props.onPatch({ text: event.target.value, isExample: false })} placeholder={"এখানে আপনার বাংলা লেখা লিখুন বা পেস্ট করুন…\n\nএকটি গল্প, একটি কবিতা, কিংবা আপনার প্রিয় বইয়ের কিছু পাতা।"} />
    <div className="editor-footer"><button className="upload-button" onClick={props.onImport} disabled={busy || !!props.importing}>{props.importing ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}<span>{props.importing || "ফাইল যোগ করুন"}</span>{!props.importing && <small>PDF / TXT</small>}</button><TextStatistics text={props.document.text} /></div>
    {props.document.importName && <div className="imported-file"><FileText size={12} />{props.document.importName}{props.document.pageCount ? ` · ${bn(props.document.pageCount)} পৃষ্ঠা` : ""}<Check size={12} /></div>}
  </section>;
}

interface TranslationEditorProps extends EditorProps {
  onTranslate: () => void;
  onApprove: () => void;
  onPause: () => void;
  onResetSource: () => void;
  onLanguage: (language: "en" | "ur") => void;
}

export function TranslationEditor(props: TranslationEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const doc = props.document;
  const processing = doc.translationStatus === "processing";
  const busy = processing || doc.audioStatus === "generating";
  const locked = doc.sourceSnapshot !== null;
  const progress = translationProgress(doc);
  const completed = doc.segments.filter((segment) => segment.status === "complete").length;
  return <section className={`editor-panel translation-editor panel${expanded ? " expanded" : ""}`} aria-label="ইংরেজি অথবা উর্দু থেকে বাংলা অনুবাদ">
    <DocumentToolbar {...props} expanded={expanded} onExpand={() => setExpanded(!expanded)} disabled={busy || !!props.importing} />
    <div className="translation-language-bar"><div><span className="language-indicator">A</span><select value={doc.sourceLanguage} aria-label="উৎস ভাষা" onChange={(event) => props.onLanguage(event.target.value as "en" | "ur")} disabled={locked || busy || !!props.importing}><option value="en">ইংরেজি · English</option><option value="ur">উর্দু · اردو</option></select></div><ArrowRight size={17} /><div><span className="language-indicator bengali-letter">অ</span><span>বাংলা · Bengali</span><span className="target-tag">অনুবাদ</span></div></div>
    <div className="translation-panes">
      <div className="translation-pane source-pane"><div className="pane-caption"><label htmlFor="source-text">মূল লেখা</label>{locked ? <button className="source-lock" onClick={props.onResetSource} disabled={busy} title="মূল লেখা অক্ষত রেখে নতুন উৎস যোগ করুন"><LockKeyhole size={11} />সংরক্ষিত উৎস</button> : <span>ইংরেজি অথবা উর্দু লিখুন</span>}</div><textarea id="source-text" lang={doc.sourceLanguage} dir={doc.sourceLanguage === "ur" ? "rtl" : "ltr"} spellCheck={false} readOnly={locked || busy || !!props.importing} value={doc.sourceText} maxLength={STUDIO_CONFIG.maxDocumentCharacters} onChange={(event) => props.onPatch({ sourceText: event.target.value, isExample: false })} placeholder={doc.sourceLanguage === "ur" ? "یہاں اصل اردو متن لکھیں یا پیسٹ کریں…" : "Paste your original English text here…"} /><div className="pane-bottom"><TextStatistics text={doc.sourceText} />{locked && <LockKeyhole size={11} />}</div></div>
      <div className="translation-pane target-pane"><div className="pane-caption"><label htmlFor="translation-text">বাংলা অনুবাদ</label><span><PencilLine size={10} />সম্পাদনাযোগ্য</span></div><textarea id="translation-text" className="bengali-translation" lang="bn" dir="ltr" spellCheck={false} readOnly={busy} value={doc.text} maxLength={STUDIO_CONFIG.maxDocumentCharacters} onChange={(event) => props.onPatch({ text: event.target.value, translationEdited: true, translationApproved: false, translationApprovalProof: undefined })} placeholder={"আপনার বাংলা অনুবাদ এখানে দেখা যাবে।\n\nঅনুবাদের পরে নিজের মতো সম্পাদনা করতে পারবেন। চাইলে নিজেও অনুবাদ লিখতে পারেন।"} /><div className="pane-bottom"><TextStatistics text={doc.text} />{doc.text.trim() && <Check size={12} />}</div></div>
    </div>
    {doc.segments.length > 0 && <div className={`translation-job ${doc.translationStatus}`}><div className="translation-job-label">{processing ? <LoaderCircle size={12} className="spin" /> : doc.translationStatus === "complete" ? <Check size={12} /> : <Pause size={12} />}<span>{doc.translationStatus === "complete" ? "অনুবাদ সম্পূর্ণ" : doc.translationStatus === "failed" ? "অনুবাদ থেমেছে · কোনো অংশ বাদ যায়নি" : processing ? "অনুবাদ হচ্ছে" : "অনুবাদ বিরত আছে"}</span><strong>{bn(completed)}/{bn(doc.segments.length)} অংশ</strong></div><div className="translation-progress" role="progressbar" aria-label="অনুবাদের অগ্রগতি" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div></div>}
    {doc.importName && <div className="imported-file"><FileText size={12} />{doc.importName}{doc.pageCount ? ` · ${bn(doc.pageCount)} পৃষ্ঠা` : ""}<Check size={12} /></div>}
    {doc.translationStatus === "failed" && <p className="translation-error" role="alert">{doc.segments.find((segment) => segment.status === "failed")?.error || "অংশটি অনুবাদ করা যায়নি। আবার চেষ্টা করুন।"}</p>}
    <div className="editor-footer translation-footer"><button className="upload-button" onClick={props.onImport} disabled={locked || busy || !!props.importing}>{props.importing ? <LoaderCircle size={13} className="spin" /> : <Upload size={13} />}<span>{props.importing || "ফাইল যোগ করুন"}</span>{!props.importing && <small>PDF / TXT</small>}</button><button className="translate-button" onClick={processing ? props.onPause : props.onTranslate} disabled={(!doc.sourceText.trim() && !processing) || doc.audioStatus === "generating" || !!props.importing}>{processing ? <Pause size={14} /> : doc.translationStatus === "paused" ? <Play size={13} /> : doc.translationStatus === "failed" || doc.translationStatus === "complete" ? <RotateCcw size={13} /> : <Languages size={15} />}{processing ? "বিরতি দিন" : doc.translationStatus === "paused" ? "আবার চালু করুন" : doc.translationStatus === "failed" ? "আবার চেষ্টা করুন" : doc.translationStatus === "complete" ? "আবার অনুবাদ" : "বাংলায় অনুবাদ করুন"}</button></div>
    <div className="translation-approval"><div><strong>{doc.translationApproved ? "বাংলা পাঠ অনুমোদিত" : "অডিওর আগে অনুবাদ পর্যালোচনা করুন"}</strong><span>{doc.translationApproved ? "অনুমোদনের পর লেখা বদলালে আবার অনুমোদন লাগবে।" : "নাম, ঘটনা ও অনুচ্ছেদ মিলিয়ে সম্পাদনা করুন। অনুমোদন ছাড়া অডিও তৈরি হবে না।"}</span></div><button className={doc.translationApproved ? "secondary-button approved" : "primary-button"} onClick={props.onApprove} disabled={!doc.text.trim() || busy}>{doc.translationApproved ? <Check size={14} /> : <LockKeyhole size={14} />}{doc.translationApproved ? "অনুমোদিত" : "পর্যালোচনা করে অনুমোদন"}</button></div>
    <div className="translation-fidelity"><LockKeyhole size={11} />মূল লেখা অপরিবর্তিত · অনুবাদ অংশ ধরে সংরক্ষিত · অডিওর আগে অনুমোদন আবশ্যক</div>
  </section>;
}
