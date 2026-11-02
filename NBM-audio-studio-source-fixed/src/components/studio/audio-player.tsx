"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Headphones, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { bn, clock } from "@/lib/studio/format";
import type { StudioDocument } from "@/lib/studio/types";

const BARS = Array.from({ length: 83 }, (_, i) => Number((5 + Math.abs(Math.sin(i * 1.71) * Math.cos(i * .23)) * 27 + Math.abs(Math.sin(i * .53)) * 9).toFixed(4)));

export function AudioPlayer({ document: doc, onNotify }: { document: StudioDocument; onNotify: (message: string) => void; onAttribution?: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(.85);
  const [format, setFormat] = useState("wav");
  const [error, setError] = useState(false);
  const [merging, setMerging] = useState(false);
  const allSegments = doc.audioSegments.slice().sort((a, b) => a.order - b.order);
  const segments = doc.audioSegments.filter((segment) => segment.status === "complete" && segment.wavUrl).slice().sort((a, b) => a.order - b.order);
  const ready = segments.length > 0;
  const segment = segments[segmentIndex];

  useEffect(() => { if (audio.current) { audio.current.playbackRate = doc.speed; audio.current.volume = volume; } }, [doc.speed, volume, segmentIndex]);
  useEffect(() => {
    if (!playing || !audio.current) return;
    const player = audio.current;
    void player.play().catch(() => { setPlaying(false); setError(true); onNotify("অডিও লোড হয়নি। আবার প্লে করুন।"); });
  }, [segmentIndex, playing, onNotify]);

  async function togglePlayback() {
    if (!audio.current || !ready) return;
    if (playing) { audio.current.pause(); setPlaying(false); return; }
    if (segmentIndex >= segments.length) setSegmentIndex(0);
    setError(false); setPlaying(true);
  }
  function seek(value: number) { if (audio.current && ready) { audio.current.currentTime = value; setCurrentTime(value); } }
  async function downloadBook() {
    if (!ready || merging) return;
    setMerging(true);
    try {
      const response = await fetch("/api/studio/audio/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioIds: segments.map((item) => item.audioId), speed: doc.speed }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "অডিও একত্র করা যায়নি।");
      const link = window.document.createElement("a"); link.href = format === "mp3" ? data.mp3Url : data.url; link.download = `NBM-audio-book.${format}`; link.click();
      onNotify(`সম্পূর্ণ বই ${format.toUpperCase()} আকারে ডাউনলোড হচ্ছে।`);
    } catch (reason) { onNotify(reason instanceof Error ? reason.message : "ডাউনলোড প্রস্তুত হয়নি।"); }
    finally { setMerging(false); }
  }

  return <section className={`audio-player panel${ready ? " ready" : ""}`} aria-label="অডিও প্লেব্যাক ও ডাউনলোড">
    <div className="player-heading"><h2><Headphones size={16} />অডিও প্লেয়ার<span className={`player-status${ready ? " is-ready" : ""}`}><i />{ready ? `${bn(segments.length)}টি অংশ প্রস্তুত` : doc.audioStatus === "generating" ? "প্রস্তুত হচ্ছে" : doc.audioStatus === "failed" ? "কাজ থেমেছে · পুনরায় চালু করুন" : "শোনার অপেক্ষায়"}</span></h2><div className="download-controls"><select aria-label="ডাউনলোডের অডিও ফরম্যাট" value={format} onChange={(event) => setFormat(event.target.value)}><option value="wav">WAV</option><option value="mp3">MP3</option></select><button className="download-button" onClick={() => void downloadBook()} disabled={!ready || merging} aria-label={`সম্পূর্ণ বই ${format.toUpperCase()} ডাউনলোড করুন`}>{merging ? <span className="spin">◌</span> : <Download size={13} />}<span>{merging ? "একত্র হচ্ছে…" : "সম্পূর্ণ বই"}</span></button></div></div>
    <div className="player-body"><button className="play-button" disabled={!ready} onClick={() => void togglePlayback()} aria-label={playing ? "অডিও বিরতি দিন" : "সম্পূর্ণ অডিও শুনুন"}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><button className="rewind-button icon-button" aria-label="১০ সেকেন্ড পিছিয়ে যান" disabled={!ready} onClick={() => seek(Math.max(0, currentTime - 10))}><RotateCcw size={19} /><small>10</small></button><div className="player-timeline"><div className={`waveform${playing ? " is-playing" : ""}`}><div className="waveform-bars" aria-hidden="true">{BARS.map((height, index) => <span key={index} className={ready && index / BARS.length <= currentTime / (duration || 1) ? "elapsed" : ""} style={{ height: `${height}px` }} />)}</div><input type="range" min={0} max={duration || 1} step={.1} value={currentTime} onChange={(event) => seek(Number(event.target.value))} aria-label="বর্তমান অংশের অবস্থান" disabled={!ready} /></div><div className="timeline-labels"><span>{clock(currentTime)}</span><span>{ready ? `অংশ ${bn(segmentIndex + 1)}/${bn(segments.length)} · ${doc.voiceId} · ${doc.speed}×` : "বাংলা অডিও তৈরি হলে এখানে শুনতে পারবেন"}</span><span>{clock(duration)}</span></div></div><button className="volume-button icon-button" aria-label={muted ? "শব্দ চালু করুন" : "নিঃশব্দ করুন"} aria-pressed={muted} disabled={!ready} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><input className="volume-range" type="range" min="0" max="1" step=".05" value={muted ? 0 : volume} aria-label="ভলিউম" onChange={(event) => { setVolume(Number(event.target.value)); setMuted(Number(event.target.value) === 0); }} disabled={!ready} /></div>
    {error && <p className="player-note error">অডিও লোড হয়নি। প্লে বোতামে আবার চেষ্টা করুন।</p>}
    {allSegments.length > 0 && <div className="audio-segment-list"><strong>অডিও অংশ · সঠিক ক্রম</strong>{allSegments.map((item, index) => { const playerIndex = segments.findIndex((readyItem) => readyItem.id === item.id); return <div key={item.id} className={`${item.status}${playerIndex === segmentIndex ? " current" : ""}`} title={item.error}><span>অংশ {bn(index + 1)} · {item.status === "complete" ? "সম্পন্ন" : item.status === "failed" ? `ব্যর্থ: ${item.error ?? "আবার চেষ্টা করুন"}` : "অপেক্ষায়"}</span>{item.status === "complete" && playerIndex >= 0 && <><button onClick={() => { setPlaying(false); setSegmentIndex(playerIndex); setCurrentTime(0); }} aria-current={playerIndex === segmentIndex ? "true" : undefined}><Play size={11} />শুনুন</button><a href={`${item.wavUrl}&speed=${doc.speed}`} download={`NBM-segment-${index + 1}.wav`}>WAV <Download size={11} /></a></>}</div>; })}</div>}
    <audio key={segment?.audioId ?? "empty"} ref={audio} src={segment?.wavUrl} preload="metadata" muted={muted} onTimeUpdate={() => setCurrentTime(audio.current?.currentTime ?? 0)} onLoadedMetadata={() => { if (audio.current && Number.isFinite(audio.current.duration)) { setDuration(audio.current.duration); audio.current.playbackRate = doc.speed; audio.current.volume = volume; } }} onPlay={() => setPlaying(true)} onPause={() => { if (!audio.current?.ended) setPlaying(false); }} onEnded={() => { if (segmentIndex < segments.length - 1) { setSegmentIndex((index) => index + 1); setCurrentTime(0); } else { setPlaying(false); setCurrentTime(duration); } }} onError={() => { if (ready) { setError(true); setPlaying(false); } }} />
  </section>;
}
