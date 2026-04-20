/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, ThinkingLevel, Modality } from "@google/genai";
import { Film, Send, Sparkles, User, Volume2, VolumeX, Mic, MicOff, Search, TrendingUp, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useEffect } from "react";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Message = {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
  audioData?: string; // Base64 audio from TTS
  imageUrl?: string; // Movie poster URL
  mimeType?: string;
};

const SYSTEM_INSTRUCTION = `Wewe ni "MovieMjuzi", bwana wa masimulizi na bingwa wa "Movie Recap" kwa Kiswahili fasaha. Sauti yako ni ya KIUME, nzito na ya mamlaka (deep male voice).
Mtindo wako wa kuongea:
- Ongea kama unafanya "Recap" ya YouTube: Changamka, kuwa na hisia (excitement), na tumia Kiswahili kilichochangamka chenye ladha ya mitaani (mfano: "Mzee baba", "Dah!", "Hali ikawa tete", "Aisee").
- Lengo lako kuu ni: "KUMSIMULIA MTU STORY NZIMA YA MOVIE KUANZIA MWANZO MPAKA MWISHO (FULL STORY RECAP)".
- USITUMIE NAMBA (1, 2, 3...) KATIKA MAJIBU YAKO. Simulia kama hadithi inayotiririka (fluid narrative).
- Usiishie njiani! Simulia mwanzo, katikati, na mwisho (toa tahadhari ya spoiler mwanzoni).
- Tumia TMDB data unayopata kutoa uhakika wa waigizaji, mwaka, na plot.

VIPENGELE VYA RECAP YAKO (Bila kutumia namba):
- Utangulizi: Ki-teaser cha kuvutia kuhusu movie.
- Character Intro: Nani ni nani na wanafanya nini.
- Full Plot: Elezea matukio muhimu mwanzo mpaka mwisho.
- Review: Toa maoni yako ya kijuzi.
- Hitimisho: Toa daraja (Rating).

MUHIMU: Jibu kwa kirefu ili msimulizi (Sauti) awe na cha kuongea. Hakikisha unavutia msikilizaji mwanzo mpaka mwisho.`;

// TMDB Tool Functions
const searchMovies = async (query: string) => {
  const res = await fetch(`/api/movies/search?query=${encodeURIComponent(query)}`);
  return res.json();
};

const getTrendingMovies = async () => {
  const res = await fetch("/api/movies/trending");
  return res.json();
};

const getMovieDetails = async (id: string) => {
  const res = await fetch(`/api/movies/details/${id}`);
  return res.json();
};

const tools = [
  {
    functionDeclarations: [
      {
        name: "searchMovies",
        description: "Search for movies by title to get their IDs and basic info.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "The movie title to search for" }
          },
          required: ["query"]
        }
      },
      {
        name: "getMovieDetails",
        description: "Get detailed information about a movie including plot, cast, and rating using its TMDB ID.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "The TMDB movie ID" }
          },
          required: ["id"]
        }
      },
      {
        name: "getTrendingMovies",
        description: "Get a list of currently trending movies.",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      }
    ]
  }
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "model",
      text: "Dah! Karibu sana mzee baba kwenye MovieMjuzi! Mimi hapa ndio bosi wako wa masimulizi. Leo nipo na mzuka wa kutosha kukufanyia recap ya movie yoyote unayotaka. \n\nUnataka nikupe story nzima ya movie gani leo? Nambie jina tu, mimi nakupekuulia fasta TMDB na kukupigia recap ya kibingwa!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const generateTTS = async (text: string, messageId: string) => {
    if (isGeneratingAudio === messageId) return;
    setIsGeneratingAudio(messageId);
    
    try {
      // 1. Sanitize text: Remove markdown and extra symbols that might fail TTS
      let cleanText = text
        .replace(/[*#_~`]/g, '') // Remove markdown characters
        .replace(/\s+/g, ' ')   // Normalize whitespace
        .trim();

      // 2. Increase limit for full narration (Gemini 3.1 TTS can handle more now)
      const speechText = cleanText.length > 5000 ? cleanText.slice(0, 5000) + "..." : cleanText;
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Wewe ni msimulizi maarufu na mwenye sauti ya SHABASH NA YA JUU. Isome story hii kwa sauti ya kiume, iliyosimama vizuri, ya mamlaka, na tamka kila neno kwa usahihi wa hali ya juu ili kila mtu asikie. USINONG'ONE: ${speechText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Fenrir' },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || 'audio/wav';

      if (base64Audio) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, audioData: base64Audio, mimeType } : m));
        playAudio(base64Audio, messageId, mimeType);
      }
    } catch (e) {
      console.error("TTS Error:", e);
    } finally {
      setIsGeneratingAudio(null);
    }
  };

  const playAudio = async (base64: string, messageId: string, mime: string = 'audio/wav') => {
    // 1. Stop any existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load();
    }

    try {
      // 2. Decode base64 to binary
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 3. Check if it's already a WAV (RIFF header)
      // "RIFF" in bytes is [82, 73, 70, 70]
      const isWav = bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70;
      
      let finalBlob: Blob;
      if (isWav) {
        finalBlob = new Blob([bytes], { type: mime });
      } else {
        // Assume raw PCM 16-bit Mono 24kHz (Standard for Gemini TTS)
        // We need to add a WAV header for browser compatibility
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        
        const writeString = (offset: number, str: string) => {
          for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + len, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // Linear PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, 24000, true); // Sample rate
        view.setUint32(28, 48000, true); // Byte rate (24000 * 2)
        view.setUint16(32, 2, true); // Block align
        view.setUint16(34, 16, true); // Bits per sample
        writeString(36, 'data');
        view.setUint32(40, len, true);

        finalBlob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
      }

      const url = URL.createObjectURL(finalBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setIsSpeaking(messageId);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name !== 'AbortError') {
            console.error("Playback error:", error);
          }
        });
      }

      audio.onended = () => {
        setIsSpeaking(null);
        URL.revokeObjectURL(url);
      };

      audio.onerror = (e) => {
        console.error("Audio internal error:", e);
        setIsSpeaking(null);
        URL.revokeObjectURL(url);
      };

    } catch (err) {
      console.error("Audio processing error:", err);
      setIsSpeaking(null);
    }
  };

  const handleSend = async (customInput?: string) => {
    const textToSend = customInput || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const modelMessageId = (Date.now() + 1).toString();
    const placeholderMessage: Message = {
      id: modelMessageId,
      role: "model",
      text: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, placeholderMessage]);

    try {
      const chatHistory = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      // Tool-aware history for recursive calls
      const toolHistory = [
        ...chatHistory,
        { role: "user", parts: [{ text: textToSend }] }
      ];

      let response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: toolHistory,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: tools as any
        },
      });

      let functionCalls = response.functionCalls;
      let iterations = 0;
      const MAX_ITERATIONS = 5;
      let moviePoster: string | undefined;

      while (functionCalls && iterations < MAX_ITERATIONS) {
        iterations++;
        // Add model's request to history
        toolHistory.push({ role: "model", parts: response.candidates?.[0]?.content?.parts as any });
        
        const toolResults = [];
        for (const call of functionCalls) {
          let result;
          try {
            if (call.name === "searchMovies") result = await searchMovies((call.args as any).query);
            else if (call.name === "getMovieDetails") result = await getMovieDetails((call.args as any).id);
            else if (call.name === "getTrendingMovies") result = await getTrendingMovies();
            
            if (result && result.error) {
               console.error("TMDB Proxy Error:", result.error);
               result = { error: "Failed to fetch data. Check TMDB_API_KEY." };
            }

            // Extract poster from results
            if (call.name === "getMovieDetails" && result && result.poster_path) {
              moviePoster = `https://image.tmdb.org/t/p/w500${result.poster_path}`;
            } else if (call.name === "searchMovies" && result && result.results?.[0]?.poster_path) {
              moviePoster = `https://image.tmdb.org/t/p/w500${result.results[0].poster_path}`;
            }
          } catch (e) {
            result = { error: "Network error fetching data." };
          }
          
          toolResults.push({
            functionResponse: { name: call.name, response: { result } }
          });
        }
        
        // Add results to history
        toolHistory.push({ role: "user", parts: toolResults as any });
        
        // Call model again with results
        response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: toolHistory,
          config: { 
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: tools as any
          }
        });
        functionCalls = response.functionCalls;
      }

      const finalResponseText = response.text || "Dah! Kuna tatizo limetokea. Hebu tujaribu tena baadaye kidogo.";
      setMessages(prev => prev.map(m => m.id === modelMessageId ? { ...m, text: finalResponseText, imageUrl: moviePoster } : m));

    } catch (error) {
      console.error("AI Error:", error);
      setMessages((prev) => prev.map(m => m.id === modelMessageId ? { ...m, text: "Error! Bando la AI limeisha au mtambo umekwama." } : m));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#0a0a0b] text-[#e0e0e0] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-80 bg-[#121214] border-r border-white/5 flex-col shrink-0 text-[#e0e0e0]">
        <div className="p-8">
          <div className="flex items-center gap-2 mb-2">
            <Film className="text-amber-500" size={24} />
            <h1 className="text-2xl font-serif italic text-amber-500 tracking-tight">MovieMjuzi</h1>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold">Mtaalamu wa Sinema + TMDB</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-8 overflow-y-auto scrollbar-hide">
          <div className="px-4">
             <button 
                onClick={() => handleSend("Nionyeshe movie zinazovuma sasa hivi (trending)")}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500/20 transition-all active:scale-95"
              >
                <TrendingUp size={14} />
                Zinazovuma Leo
              </button>
          </div>

          <section>
            <h3 className="text-[9px] uppercase tracking-[0.3em] text-gray-600 mb-4 px-4 font-black">Mapendekezo</h3>
            <div className="space-y-1">
              {[
                "Deadpool & Wolverine",
                "Sonic the Hedgehog 3",
                "Gladiator II"
              ].map((name) => (
                <button 
                  key={name}
                  onClick={() => handleSend(`Nichambulie movie ya ${name}`)}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 transition-all group"
                >
                  <span className="block text-sm font-semibold group-hover:text-amber-500 transition-colors">{name}</span>
                </button>
              ))}
            </div>
          </section>
        </nav>

        <div className="p-6 border-t border-white/5">
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5 flex items-center gap-3">
             <Volume2 className="text-amber-600/50 shrink-0" size={18} />
             <p className="text-[10px] text-gray-500 leading-relaxed font-bold uppercase tracking-tight">
              Bonyeza kitufe cha sauti kusikiliza masimulizi.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-[#0d0d0f] relative overflow-hidden">
        {/* Top Header */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 md:px-10 bg-[#0a0a0b]/80 backdrop-blur-xl z-20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-black tracking-[0.3em] uppercase text-gray-400">Extreme Speed Enabled</span>
          </div>
          <div className="flex gap-4 md:gap-6 text-[10px] font-black uppercase tracking-widest text-gray-500">
            <button className="hover:text-white transition-colors">About</button>
            <button className="bg-amber-600 hover:bg-amber-500 text-black px-6 py-2 rounded-full transition-all active:scale-95 shadow-xl shadow-amber-600/10">
              TMDB LIVE
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 md:p-12 space-y-12 scrollbar-hide relative z-10"
        >
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex items-start gap-4 max-w-[90%] md:max-w-[75%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-black font-black text-xs shadow-2xl relative ${
                    message.role === "user" ? "bg-amber-200" : "bg-amber-600"
                  }`}>
                    {message.role === "user" ? "U" : "S"}
                  </div>
                  
                  <div className={`group p-6 md:p-8 rounded-[1.5rem] border shadow-2xl relative transition-all ${
                    message.role === "user" 
                      ? "bg-amber-500/5 border-amber-500/10 text-amber-100" 
                      : "bg-[#161618] border-white/5 text-gray-200"
                  }`}>
                    {message.role === "model" && message.text === "" ? (
                       <div className="flex gap-1 py-2">
                        <span className="w-1.5 h-1.5 bg-amber-500/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-amber-500/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-amber-500/50 rounded-full animate-bounce" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {message.imageUrl && (
                          <motion.img 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            src={message.imageUrl} 
                            alt="Movie Poster" 
                            className="w-full max-w-[240px] rounded-xl shadow-2xl border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <p className={`text-sm md:text-base leading-relaxed ${
                          message.role === "model" ? "font-serif text-[#e0e0e0]" : "font-sans font-medium"
                        }`}>
                          {message.text}
                        </p>
                      </div>
                    )}
                    
                    {message.role === "model" && message.text !== "" && (
                      <div className="mt-4 flex items-center gap-3">
                        <button 
                          onClick={() => {
                            if (isSpeaking === message.id) {
                              if (audioRef.current) audioRef.current.pause();
                              setIsSpeaking(null);
                            } else if (message.audioData) {
                              playAudio(message.audioData, message.id);
                            } else {
                              generateTTS(message.text, message.id);
                            }
                          }}
                          disabled={isGeneratingAudio === message.id}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                            isSpeaking === message.id 
                              ? "bg-amber-500 border-amber-500 text-black" 
                              : "border-white/10 text-amber-500 hover:border-amber-500/50"
                          } disabled:opacity-50`}
                        >
                          {isGeneratingAudio === message.id ? (
                            <Sparkles size={12} className="animate-spin" />
                          ) : isSpeaking === message.id ? (
                            <VolumeX size={12} />
                          ) : (
                            <Volume2 size={12} />
                          )}
                          {isGeneratingAudio === message.id ? "Kuandaa..." : isSpeaking === message.id ? "Nyamaza" : "Sikiliza"}
                        </button>
                      </div>
                    )}

                    <p className="absolute -bottom-6 left-2 text-[8px] uppercase tracking-[0.2em] text-gray-700 font-black">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <div className="flex justify-start opacity-50">
               <div className="text-[10px] font-black uppercase tracking-widest text-amber-500/80 pl-16">
                  Mjuzi anapitia script za TMDB...
               </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <footer className="p-6 md:p-8 bg-[#0a0a0b] shrink-0 z-20 border-t border-white/5">
          <div className="relative flex items-center max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Andika jina la filamu hapa..."
              className="w-full bg-[#161618] border border-white/10 rounded-2xl py-4 md:py-5 pl-6 pr-24 text-sm focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-gray-700 shadow-2xl"
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="absolute right-3 bg-amber-600 hover:bg-amber-500 disabled:bg-white/10 disabled:text-gray-700 text-black px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
            >
              TUMA
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
