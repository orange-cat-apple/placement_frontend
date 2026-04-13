"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function ChatbotPage() {
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Floating Avatar Refs
  const circleRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // Added to track playing audio
  
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'Hello! I am ARIA, the MIT Bengaluru Voice AI. How can I assist you with your placement prep today?' }
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState("");
  
  // Login & Audio States
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [isMuted, setIsMuted] = useState(false); // New Mute State

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // High-Res Image Processing
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const processImage = () => {
      if (img.naturalWidth === 0) return; 
      
      const targetResolution = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = targetResolution;
      canvas.height = targetResolution;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return; 
      
      try {
        ctx.drawImage(img, 0, 0, targetResolution, targetResolution);
        const data = ctx.getImageData(0, 0, targetResolution, targetResolution);
        const d = data.data;
        
        for(let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i+1], b = d[i+2];
          const isGrey = Math.abs(r-g) < 22 && Math.abs(g-b) < 22 && Math.abs(r-b) < 22 && r > 160 && r < 230;
          const isCream = r > 235 && g > 230 && b > 215;
          if(isGrey || isCream) d[i+3] = 0; 
        }
        
        ctx.putImageData(data, 0, 0);
        img.src = canvas.toDataURL('image/png');
      } catch (e) {
        console.error("Canvas draw failed", e);
      }
    };

    if (img.complete && img.naturalWidth !== 0) {
      processImage();
    } else {
      img.onload = processImage;
    }
  }, []);

  const playAudioAndAnimate = (base64String: string) => {
    // If muted, don't even create the audio
    if (isMuted) return;

    const audio = new Audio(`data:audio/mp3;base64,${base64String}`);
    currentAudioRef.current = audio; // Store reference so we can mute mid-sentence
    
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const audioCtx = audioContextRef.current;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (!analyserRef.current) {
      analyserRef.current = audioCtx.createAnalyser();
      analyserRef.current.fftSize = 256;
    }

    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyserRef.current);
    analyserRef.current.connect(audioCtx.destination);

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const animateAvatar = () => {
      if (!analyserRef.current || !circleRef.current || !imgRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length;
      
      const glowSize = average * 0.6; 
      circleRef.current.style.boxShadow = `
        0 0 ${glowSize}px ${glowSize / 2}px rgba(235, 94, 40, 0.4),
        0 0 ${glowSize * 1.5}px ${glowSize / 3}px rgba(255, 120, 80, 0.2),
        0 0 ${glowSize * 2}px ${glowSize / 4}px rgba(255, 255, 255, 0.1)
      `;
      
      const scale = 1 + (average / 255) * 0.08;
      imgRef.current.style.transform = `scale(${scale})`;
      
      animationFrameRef.current = requestAnimationFrame(animateAvatar);
    };

    audio.onplay = () => animateAvatar();
    audio.onended = () => {
      cancelAnimationFrame(animationFrameRef.current);
      if (circleRef.current) circleRef.current.style.boxShadow = 'none';
      if (imgRef.current) imgRef.current.style.transform = 'scale(1)';
      source.disconnect();
    };

    audio.play();
  };

  const toggleMute = () => {
    setIsMuted(prev => {
      const newMutedState = !prev;
      // If we are muting and audio is currently playing, kill it immediately
      if (newMutedState && currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        cancelAnimationFrame(animationFrameRef.current);
        if (circleRef.current) circleRef.current.style.boxShadow = 'none';
        if (imgRef.current) imgRef.current.style.transform = 'scale(1)';
      }
      return newMutedState;
    });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputText(transcript);
          if (event.results[0].isFinal) handleSendMessage(transcript);
        };
        recognitionRef.current.onend = () => setIsRecording(false);
      }
    }
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInputText("");
    setIsTyping(true);

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_API_URL || "https://placement-help.onrender.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text })
      });
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.text || "Processed." }]);
      
      // Only trigger audio if we are not muted
      if (data.audio_base64 && !isMuted) {
        playAudioAndAnimate(data.audio_base64);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: "Connection error. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <main className="relative flex w-full h-screen p-4 md:p-6 gap-4 lg:gap-6 overflow-hidden bg-[#FFFCF2] font-sans">
      
      {/* Background Gradient */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(-45deg,#FFFCF2,#FFE3D8,#FAD0C4,#FFD1FF,#FFFCF2)] bg-[length:400%_400%] animate-[gradientFlow_15s_ease_infinite]"></div>

      {/* --- PANE 1: Slim Navigation --- */}
      <nav className="relative z-10 w-20 hidden md:flex flex-col items-center py-6 gap-8 bg-white/40 backdrop-blur-2xl border border-white/60 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <button onClick={() => setShowLoginModal(true)} className="w-10 h-10 rounded-full bg-[#252422] text-white flex items-center justify-center font-bold text-xl shadow-md hover:bg-[#EB5E28] transition-colors">
          M
        </button>
        <div className="flex flex-col gap-6 mt-4">
          <Link href="/" className="w-10 h-10 flex items-center justify-center text-[#252422] opacity-50 hover:opacity-100 hover:bg-white/50 rounded-full transition-all">🏠</Link>
          <Link href="/chatbot" className="w-10 h-10 flex items-center justify-center bg-white shadow-sm text-[#252422] rounded-full border border-white/60 transition-all">🎙️</Link>
          <Link href="/questions" className="w-10 h-10 flex items-center justify-center text-[#252422] opacity-50 hover:opacity-100 hover:bg-white/50 rounded-full transition-all">📂</Link>
          <Link href="/stats" className="w-10 h-10 flex items-center justify-center text-[#252422] opacity-50 hover:opacity-100 hover:bg-white/50 rounded-full transition-all">📊</Link>
        </div>
      </nav>

      {/* --- PANE 2: Center Chat Area --- */}
      <section className="relative z-10 flex-1 flex flex-col bg-white/40 backdrop-blur-2xl border border-white/60 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        
        {/* Header with Mute Button */}
        <header className="w-full pt-6 pb-2 flex items-center justify-between px-8">
          <div className="w-10"></div> {/* Spacer for perfect centering */}
          <h2 className="text-[#252422] font-bold tracking-widest uppercase text-sm drop-shadow-sm">Placement Intelligence</h2>
          <button 
            onClick={toggleMute} 
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all shadow-sm border ${
              isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-white/60 border-white/80 text-[#252422]'
            }`}
            title={isMuted ? "Unmute Voice" : "Mute Voice"}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </header>

        {/* Chat Transcript Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scroll-smooth z-10 relative pb-40" ref={chatContainerRef}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] p-4 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                msg.role === 'user' ? 'bg-[#1c1c1e] text-white rounded-tr-sm' : 'bg-white/80 text-[#252422] rounded-tl-sm border border-white/50'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Floating Avatar Anchor */}
        <div className="absolute bottom-[100px] right-6 md:right-12 z-20 flex flex-col items-end gap-2 pointer-events-none">
          {isTyping && (
            <div className="bg-white text-[#252422] text-xs font-medium px-4 py-3 rounded-2xl rounded-br-sm shadow-xl border border-black/5 animate-bounce pointer-events-auto">
              Analyzing query...
            </div>
          )}
          <div ref={circleRef} className="w-24 h-24 md:w-32 md:h-32 rounded-full border-[3px] border-white/80 shadow-2xl bg-white/50 backdrop-blur-md relative flex items-center justify-center pointer-events-auto transition-transform duration-300 hover:scale-105">
            <img ref={imgRef} src="/avatar.png" crossOrigin="anonymous" alt="ARIA" className={`w-full h-full rounded-full object-cover z-10 transition-transform duration-75 ${isMuted ? 'opacity-70 grayscale-[50%]' : ''}`} />
            <span className={`absolute bottom-2 right-2 w-4 h-4 rounded-full z-20 shadow-sm border-2 border-white ${isMuted ? 'bg-orange-500' : 'bg-green-500'}`}></span>
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-6 bg-gradient-to-t from-white/40 to-transparent z-10">
          <div className="max-w-3xl mx-auto flex items-center gap-3 bg-white p-2 rounded-full shadow-lg border border-white/80">
            <input 
              type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
              placeholder="Type your message..."
              className="flex-1 bg-transparent border-none px-6 text-[#252422] outline-none font-medium placeholder-[#403D39]/50"
            />
            <button 
              onMouseDown={() => { setIsRecording(true); recognitionRef.current?.start(); }} onMouseUp={() => recognitionRef.current?.stop()} onMouseLeave={() => { if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); } }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse shadow-md' : 'bg-gray-100 hover:bg-gray-200 text-[#252422]'}`}
            >
              <span>{isRecording ? '🎙️' : '🎤'}</span>
            </button>
            <button onClick={() => handleSendMessage(inputText)} className="bg-[#1c1c1e] text-white w-12 h-12 rounded-full flex items-center justify-center font-bold hover:bg-[#EB5E28] transition-colors shadow-md">
              ➤
            </button>
          </div>
        </div>
      </section>

      {/* --- PANE 3: Permanent History Sidebar --- */}
      <aside className="relative z-10 w-80 hidden xl:flex flex-col bg-white/40 backdrop-blur-2xl border border-white/60 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="p-6 border-b border-black/5 flex items-center justify-between">
          <div className="bg-white/60 px-4 py-2 rounded-xl text-sm font-bold text-[#252422] shadow-sm border border-white">Agent ARIA v2.0 ▾</div>
        </div>
        <div className="p-6 border-b border-black/5 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-sm text-[#252422] opacity-80 cursor-pointer hover:opacity-100 transition-opacity"><span>📅</span> Calendar & Deadlines</div>
          <div className="flex items-center gap-3 text-sm text-[#252422] opacity-80 cursor-pointer hover:opacity-100 transition-opacity"><span>📄</span> Resume Review</div>
          <button className="w-full mt-2 bg-[#1c1c1e] text-white py-3 rounded-xl text-sm font-bold shadow-md hover:bg-[#333] transition-colors">↑ Share Transcript</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div>
            <h4 className="text-xs font-bold text-[#403D39] uppercase tracking-wider mb-3">Today</h4>
            <ul className="space-y-3">
              <li className="text-sm text-[#252422] opacity-80 truncate cursor-pointer hover:text-[#EB5E28]">💬 Interview prep for Amazon</li>
              <li className="text-sm text-[#252422] opacity-80 truncate cursor-pointer hover:text-[#EB5E28]">💬 CSE Cutoff scores</li>
            </ul>
          </div>
        </div>
      </aside>

      {/* --- Login Modal Overlay --- */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#252422]/40 backdrop-blur-sm p-4 transition-all duration-300">
          <div className="bg-white/80 backdrop-blur-2xl border border-white/60 shadow-2xl rounded-3xl w-full max-w-sm p-8 flex flex-col relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setShowLoginModal(false)} className="absolute top-4 right-4 text-[#252422] opacity-50 hover:opacity-100 text-xl font-bold p-2">✕</button>
            <h2 className="text-2xl font-bold text-[#252422] mb-2">Connect</h2>
            <p className="text-sm text-[#403D39] opacity-80 mb-6">Sign in to save your chat history and preferences.</p>
            <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="student@manipal.edu" className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-[#252422] outline-none mb-4 focus:bg-white/80 focus:ring-2 focus:ring-[#EB5E28]/50 transition-all placeholder-[#403D39]/50" />
            <button onClick={() => { setShowLoginModal(false); setEmailInput(""); }} className="w-full bg-[#1c1c1e] text-white font-bold py-3 rounded-xl shadow-lg hover:bg-[#EB5E28] transition-colors">Continue</button>
          </div>
        </div>
      )}
    </main>
  );
}