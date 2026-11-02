"use client";

import { AudioLines, Check, CircleHelp, Clock3, Info, LoaderCircle, LockKeyhole, Play, SlidersHorizontal } from "lucide-react";
import { VOICE_CANDIDATES } from "@/lib/studio/config";
import { readingTime } from "@/lib/studio/format";
import type { SpeechSpeed, StudioDocument, VoiceId } from "@/lib/studio/types";

interface VoicePanelProps {
  document: StudioDocument;
  progress: number;
  disabled?: boolean;
  canGenerate?: boolean;
  onVoice: (voice: VoiceId) => void;
  onSpeed: (speed: SpeechSpeed) => void;
  onGenerate: () => void;
  onPreview: (voice: VoiceId) => void;
  onInfo: () => void;
}

export function VoicePanel({ document: doc, progress, disabled = false, canGenerate = true, onVoice, onSpeed, onGenerate, onPreview, onInfo }: VoicePanelProps) {
  const generating = doc.audioStatus === "generating";
  const busy = disabled || generating || doc.translationStatus === "processing";
  return (
    <aside className="voice-panel panel" aria-label="কণ্ঠ ও অডিও সেটিংস">
      <div className="panel-heading"><h2><SlidersHorizontal size={17} />কণ্ঠের সেটিংস</h2><span className="tiny-tag">Gemini TTS</span></div>
      <fieldset className="voice-fieldset" disabled={busy}>
        <legend>কণ্ঠস্বর <button type="button" className="inline-help" onClick={onInfo} aria-label="কণ্ঠের সমর্থন সম্পর্কে জানুন"><CircleHelp size={13} /></button></legend>
        <p className="field-description">আপনার গল্পের কণ্ঠ বেছে নিন</p>
        <div className="voice-list">
          {VOICE_CANDIDATES.map((voice) => (
            <div key={voice.id} className={`voice-option${doc.voiceId === voice.id ? " selected" : ""}`}>
              <input className="sr-only voice-radio" type="radio" name="narration-voice" id={`voice-${voice.id}`} checked={doc.voiceId === voice.id} onChange={() => onVoice(voice.id)} />
              <label htmlFor={`voice-${voice.id}`} className="voice-label">
                <span className="voice-avatar" style={{ color: voice.color }}><AudioLines size={18} strokeWidth={1.5} /></span>
                <span className="voice-copy"><strong lang="en">{voice.id}</strong><span>{voice.description}</span></span>
                <span className="radio-indicator">{doc.voiceId === voice.id && <Check size={10} strokeWidth={3} />}</span>
              </label>
              <button className="voice-preview" onClick={() => onPreview(voice.id)} title="লাইভ কণ্ঠ প্রিভিউ পরবর্তী পর্যায়ে যুক্ত হবে" aria-label={`${voice.id} কণ্ঠের প্রিভিউ সম্পর্কে`}><Play size={11} fill="currentColor" /></button>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="speed-fieldset" disabled={busy}>
        <legend>পাঠের গতি <span>স্বাভাবিক ছন্দে শুনুন</span></legend>
        <div className="speed-options">
          {([0.8, 1, 1.25] as SpeechSpeed[]).map((speed) => <button key={speed} type="button" className={doc.speed === speed ? "selected" : ""} aria-pressed={doc.speed === speed} onClick={() => onSpeed(speed)}><span>{speed === 1 ? "1.0" : speed}×</span><small>{speed === .8 ? "ধীর" : speed === 1 ? "স্বাভাবিক" : "দ্রুত"}</small></button>)}
        </div>
      </fieldset>
      <div className="time-estimate"><span><Clock3 size={13} />আনুমানিক সময়</span><strong>{doc.text.trim() ? readingTime(doc.text, doc.speed) : "—"}</strong></div>
      <button className="primary-button generate-button" onClick={onGenerate} disabled={!doc.text.trim() || busy || !canGenerate}>
        {generating ? <LoaderCircle className="spin" size={17} /> : <AudioLines size={18} />}
        {generating ? "অডিও তৈরি হচ্ছে…" : doc.audioStatus === "ready" ? "আবার অডিও তৈরি করুন" : doc.audioStatus === "failed" ? "অসম্পূর্ণ অংশ আবার চালু করুন" : "বাংলা অডিও তৈরি করুন"}
      </button>
      {generating && <div className="generation-progress" role="progressbar" aria-label="অডিও তৈরির অগ্রগতি" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>}
      <p className="exact-text-note"><LockKeyhole size={11} />লেখার একটি শব্দও বদলাবে না</p>
      {!canGenerate && <p className="translation-fidelity">অনুবাদ পর্যালোচনা ও অনুমোদনের পর অডিও তৈরি হবে।</p>}
      <button className="voice-disclaimer" onClick={onInfo}><Info size={12} /><span>প্রার্থী কণ্ঠ · বাংলা মান যাচাই বাকি</span></button>
    </aside>
  );
}
