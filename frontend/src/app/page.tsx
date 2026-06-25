"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { 
  Camera, 
  CameraOff, 
  Trash2, 
  Copy, 
  Check,
  RefreshCw, 
  Keyboard,
  Undo2,
  Type,
  Hash,
  BookOpen
} from "lucide-react";

// URL endpoint API Next.js proxy yang meneruskan request ke backend Flask
const API_URL = "/api/predict";

// Mode pengenal yang didukung oleh model:
// - "alfabet": Pengenal alfabet isyarat tangan SIBI
// - "angka": Pengenal angka 0-9
// - "kata": Pengenal kosakata bahasa isyarat
type Mode = "alfabet" | "angka" | "kata";

// Daftar item untuk panduan visual panduan gerakan tangan berdasarkan mode aktif
const GUIDE_ITEMS: Record<Mode, string[]> = {
  alfabet: Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  angka: Array.from("0123456789"),
  kata: ["Bantu", "Berjuang", "Boleh", "Sama-Sama", "Selamat", "Sukses"]
};

// Menentukan path file foto sampel panduan gerakan di dalam /public/Sample
const getSampleImagePath = (mode: Mode, label: string) => {
  if (mode === "alfabet") {
    return `/Sample/alfabet/${label}.jpg`;
  } else if (mode === "angka") {
    return `/Sample/number/${label}.JPG`;
  } else { // mode === "kata"
    const filename = label === "Sama-Sama" ? "Sama sama" : label;
    return `/Sample/kata/${filename}.jpg`;
  }
};

// Struktur response dari endpoint Flask backend
interface PredictionResponse {
  prediction: string;
  confidence: number;
  clear_gesture?: boolean;
  error?: string;
}

// Wrapper Kartu Desain macOS (Gaya SaaS Premium)
// Menampilkan header bergaya panel macOS, judul kustom, dan efek glassmorphism
function MacCardWrapper({ 
  children, 
  title, 
  badge,
  className = "",
  onMouseMove,
  onMouseLeave
}: { 
  children: React.ReactNode; 
  title: string; 
  badge?: React.ReactNode;
  className?: string;
  onMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div 
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`glass-card rounded-2xl overflow-hidden border border-slate-200/60 flex flex-col transition-all duration-300 ${className}`}
    >
      {/* macOS Top Bar */}
      <div className="bg-slate-50/50 border-b border-slate-100/60 px-4 py-3 flex items-center justify-between select-none">
        <div className="w-12" />
        <div className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase">
          {title}
        </div>
        <div>
          {badge ? badge : <div className="w-12" />}
        </div>
      </div>
      {/* Area Konten */}
      <div className="flex-1 p-6 flex flex-col justify-between">
        {children}
      </div>
    </div>
  );
}

// Logo Mockingjay Minimalis
function MockingjayLogo() {
  return (
    <div className="w-10 h-10 rounded-xl overflow-hidden floating-shadow-sm select-none flex items-center justify-center">
      <img src="/logo.png" alt="Mockingjay Logo" className="w-full h-full object-cover" />
    </div>
  );
}

export default function SignLanguageDashboard() {
  // State Halaman Aplikasi
  const [mode, setMode] = useState<Mode>("alfabet");                         // Mode klasifikasi aktif
  const [selectedGuideLabel, setSelectedGuideLabel] = useState<string>("");  // Label gerakan terpilih di panduan visual
  const [isCapturing, setIsCapturing] = useState<boolean>(true);              // Status keaktifan kamera web
  const [apiStatus, setApiStatus] = useState<"connecting" | "online" | "offline">("connecting"); // Status server API backend
  const [latency, setLatency] = useState<number | null>(null);                // Waktu respons API backend (ms)
  
  // State Prediksi & Penggabungan Karakter/Kata
  const [currentSeq, setCurrentSeq] = useState<string>("");                  // Karakter/kata yang sedang aktif digabungkan
  const [lastCompletedSeq, setLastCompletedSeq] = useState<string>("");      // Karakter/kata terakhir yang selesai disusun
  const [confidence, setConfidence] = useState<number>(0);                    // Tingkat akurasi/kepercayaan prediksi (0.0 sampai 1.0)
  const [isLoading, setIsLoading] = useState<boolean>(false);                // Status pemanggilan API
  
  // State Penampung Kalimat Hasil Terjemah (Accumulator)
  const [accumulatedText, setAccumulatedText] = useState<string>("");        // Kalimat hasil akhir terjemahan
  const [copied, setCopied] = useState<boolean>(false);                      // Umpan balik salin ke papan klip (clipboard)
  
  // State Notifikasi HUD Pembersih Layar
  const [showClearToast, setShowClearToast] = useState<boolean>(false);      // Kontrol tampilan toast pop-up pembersih teks
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Referensi untuk loop inaktivitas dan frame rate webcam
  const webcamRef = useRef<Webcam>(null);
  const loopRef = useRef<NodeJS.Timeout | null>(null);
  const lastActiveTimeRef = useRef<number>(0);                               // Detik Unix prediksi teraktif terakhir
  const lastActiveLabelRef = useRef<string>("");                              // Label teks terprediksi terakhir

  // Pengaturan resolusi kamera
  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: "user"
  };

  // Sinkronisasi item pertama di panduan gerakan ketika user mengubah mode
  useEffect(() => {
    setSelectedGuideLabel(GUIDE_ITEMS[mode][0]);
  }, [mode]);

  const checkBackendStatus = useCallback(async () => {
    // Melakukan ping request kosong ke Flask backend untuk memverifikasi koneksi.
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // Batas waktu 2 detik
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: "", mode: "test_connection" }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.status !== 404) {
        setApiStatus("online");
      } else {
        setApiStatus("offline");
      }
    } catch {
      setApiStatus("offline");
    }
  }, []);

  // Lakukan pengecekan status server Flask setiap 5 detik
  useEffect(() => {
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 5000);
    return () => clearInterval(interval);
  }, [checkBackendStatus]);

  const triggerClearFeedback = useCallback(() => {
    // Menghapus semua penampung teks dan menampilkan toast notifikasi penghapusan layar.
    setAccumulatedText("");
    setCurrentSeq("");
    setLastCompletedSeq("");
    setShowClearToast(true);
    
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setShowClearToast(false);
    }, 2500);
  }, []);

  const flushSequence = useCallback((sequenceToFlush: string) => {
    // Memindahkan karakter/kata yang selesai terdeteksi ke penampung teks kalimat di bawah.
    if (!sequenceToFlush) return;

    setAccumulatedText(prev => {
      if (mode === "kata") {
        return prev === "" ? sequenceToFlush : `${prev} ${sequenceToFlush}`;
      } else {
        return prev === "" ? sequenceToFlush : `${prev}${sequenceToFlush}`;
      }
    });

    setLastCompletedSeq(sequenceToFlush);
    setCurrentSeq("");
  }, [mode]);

  // Pengulangan kontrol inaktivitas gerakan tangan:
  // 1. Jika inaktif selama 1,2 detik, pindahkan huruf/kata aktif ke penampung teks di bawah.
  // 2. Jika inaktif selama 1,5 detik (tangan diturunkan), kosongkan status HUD dan reset progress bar.
  useEffect(() => {
    const timer = setInterval(() => {
      const timeSinceLastActive = Date.now() - lastActiveTimeRef.current;
      if (currentSeq && timeSinceLastActive > 1200) {
        flushSequence(currentSeq);
      }
      if (timeSinceLastActive > 1500) {
        setLastCompletedSeq(prev => {
          if (prev !== "") return "";
          return prev;
        });
        setConfidence(0);
      }
    }, 200);

    return () => clearInterval(timer);
  }, [currentSeq, flushSequence]);

  const captureAndPredict = useCallback(async () => {
    // Menjalankan proses prediksi:
    // 1. Ambil screenshot base64 dari feed webcam.
    // 2. Kirim screenshot dan mode pengenalan ke Flask backend server.
    // 3. Ukur waktu eksekusi request (latensi).
    // 4. Analisis hasil response:
    //    - Jika terdeteksi isyarat clear, lakukan reset teks.
    //    - Jika terdeteksi gesture valid dengan akurasi >70%:
    //      - Gabungkan huruf/kata secara sekuensial jika jeda tangan < 1,2 detik.
    //      - Simpan hasil prediksi ke dalam state penampung.
    if (!isCapturing || isLoading || !webcamRef.current) return;

    const base64Img = webcamRef.current.getScreenshot();
    if (!base64Img) return;

    setIsLoading(true);
    const startTime = performance.now();

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Img, mode: mode })
      });

      const duration = Math.round(performance.now() - startTime);
      setLatency(duration);

      if (!response.ok) {
        throw new Error("Respons HTTP gagal: " + response.status);
      }

      const data: PredictionResponse = await response.json();

      if (data.error) {
        console.error("Kesalahan API:", data.error);
        setConfidence(0);
      } else {
        const predLabel = data.prediction;
        const predConf = data.confidence;

        // Filter hasil prediksi yang valid saja
        if (
          predLabel !== "No Hand Detected" && 
          predLabel !== "No Gesture" && 
          predLabel !== "No_Gesture" &&
          predConf > 0.70
        ) {
          setConfidence(predConf);
          const now = Date.now();
          const timeDiff = now - lastActiveTimeRef.current;

          // Gabungkan huruf/kata jika ditampilkan berturut-turut (jeda < 1,2 detik)
          if (timeDiff < 1200) {
            if (lastActiveLabelRef.current !== predLabel) {
              setCurrentSeq(prev => {
                if (mode === "kata") {
                  return prev === "" ? predLabel : `${prev} ${predLabel}`;
                } else {
                  return prev + predLabel;
                }
              });
              lastActiveLabelRef.current = predLabel;
            }
            lastActiveTimeRef.current = now;
          } else {
            // Lakukan pemindahan teks lama jika jeda tangan sempat > 1.2s lalu buat teks baru
            if (currentSeq) {
              flushSequence(currentSeq);
            }
            setCurrentSeq(predLabel);
            lastActiveLabelRef.current = predLabel;
            lastActiveTimeRef.current = now;
          }
        }
      }
      setApiStatus("online");
    } catch (err) {
      console.error("Gagal melakukan prediksi:", err);
      setApiStatus("offline");
      setConfidence(0);
    } finally {
      setIsLoading(false);
    }
  }, [isCapturing, isLoading, mode, currentSeq, flushSequence, triggerClearFeedback]);

  // Jalankan interval pengambilan gambar setiap 800 milidetik
  useEffect(() => {
    if (isCapturing && apiStatus !== "offline") {
      loopRef.current = setInterval(captureAndPredict, 800);
    } else {
      if (loopRef.current) clearInterval(loopRef.current);
    }

    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, [isCapturing, apiStatus, captureAndPredict]);
  
  // Mengubah mode klasifikasi sensor aktif
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setCurrentSeq("");
    setLastCompletedSeq("");
    setConfidence(0);
    lastActiveTimeRef.current = 0;
    lastActiveLabelRef.current = "";
  };

  // Menambahkan spasi secara manual pada kalimat
  const handleAddSpace = () => {
    setAccumulatedText(prev => prev + " ");
  };

  // Mengosongkan penampung kalimat
  const handleClearText = () => {
    setAccumulatedText("");
    setCurrentSeq("");
    setLastCompletedSeq("");
  };

  // Menghapus satu karakter atau kata terakhir (backspace)
  const handleBackspace = () => {
    setAccumulatedText(prev => {
      if (mode === "kata") {
        const words = prev.trim().split(" ");
        words.pop();
        return words.join(" ");
      } else {
        return prev.slice(0, -1);
      }
    });
  };

  // Menyalin teks kalimat ke clipboard sistem
  const handleCopyText = () => {
    if (!accumulatedText) return;
    navigator.clipboard.writeText(accumulatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Tentukan state karakter/kata terdeteksi aktif untuk rendering HUD
  const activeSequenceStr = currentSeq;
  const isSequenceActive = currentSeq !== "" && (Date.now() - lastActiveTimeRef.current <= 1200);
  const displayResult = activeSequenceStr || lastCompletedSeq || "-";

  return (
    <div className="flex-1 w-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto space-y-8 select-none">
      


      {/* Header Dashboard */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center py-2 space-y-4 md:space-y-0">
        {/* Identitas Brand */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/10 rounded-xl blur-md" />
            <MockingjayLogo />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 bg-clip-text text-transparent">
                Mockingjay
              </span>
            </div>
            <p className="text-[10px] text-tech-text-muted font-semibold mt-0.5">
              Sistem Deteksi Bahasa Isyarat Real-Time
            </p>
          </div>
        </div>

        <div className="hidden md:block" />

        {/* Indikator Keaktifan Koneksi Backend API */}
        <div className="flex items-center space-x-3 text-xs">
          {apiStatus === "online" && (
            <div className="flex items-center border border-slate-200 bg-white px-3.5 py-2 rounded-full font-extrabold tracking-wider text-slate-700 shadow-sm transition-all">
              <span className="w-2 h-2 glass-sphere-green rounded-full mr-2" />
              ONLINE
            </div>
          )}
          {apiStatus === "connecting" && (
            <div className="flex items-center border border-slate-200 bg-white px-3.5 py-2 rounded-full font-extrabold tracking-wider text-slate-700 shadow-sm animate-pulse">
              <span className="w-2 h-2 glass-sphere-yellow rounded-full mr-2" />
              CONNECTING
            </div>
          )}
          {apiStatus === "offline" && (
            <div className="flex items-center border border-rose-200 bg-rose-50/20 px-3.5 py-2 rounded-full font-extrabold tracking-wider text-rose-600">
              <span className="w-2 h-2 glass-sphere-red rounded-full mr-2" />
              OFFLINE
            </div>
          )}

          <button 
            onClick={checkBackendStatus} 
            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-900 rounded-2xl transition-all shadow-md"
            title="Refresh Connection"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Grid Utama (Kamera, Panel Hasil HUD, dan Panduan Gerakan) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Kolom 1: Live Webcam (6 cols) */}
        <div className="lg:col-span-6 flex flex-col space-y-6">
          <MacCardWrapper 
            title="WORKSPACE" 
            className={`aspect-[4/3] floating-shadow-md ${
              isCapturing && currentSeq !== "" 
                ? "border-indigo-300 ring-2 ring-indigo-500/5" 
                : ""
            }`}
            badge={
              isCapturing && apiStatus === "online" ? (
                <div className="flex items-center space-x-1.5 bg-slate-100/90 border border-slate-200/80 px-3 py-1 rounded-full text-[9px] font-extrabold tracking-widest text-slate-600">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                  <span>LIVE CAM</span>
                </div>
              ) : undefined
            }
          >
            <div className="relative w-full h-full flex-1 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex flex-col justify-center items-center shadow-inner">
              {isCapturing && apiStatus !== "offline" ? (
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  className="w-full h-full object-contain transform scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center space-y-4 text-slate-400 p-8 text-center select-none">
                  <div className="p-5 bg-white rounded-full border border-slate-200/60 shadow-sm">
                    <CameraOff className="w-8 h-8 text-slate-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 tracking-wide">
                      {apiStatus === "offline" ? "Backend Offline" : "Webcam Feed Disabled"}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1.5 max-w-xs leading-relaxed font-medium">
                      {apiStatus === "offline" 
                        ? "Please check that your python flask server is running in venv310." 
                        : "Enable the camera toggle below to start classification."
                      }
                    </p>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-md px-3 py-1.5 rounded-full text-[9px] font-extrabold tracking-wider flex items-center text-indigo-600">
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  ANALYZING
                </div>
              )}
            </div>
          </MacCardWrapper>

          {/* Pengendali Keaktifan Kamera Web */}
          <div className="flex justify-between items-center border border-slate-200/80 bg-white/80 backdrop-blur-md p-4 rounded-2xl floating-shadow-md">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Feed Status:</span>
              <span className={`text-xs font-bold ${isCapturing ? "text-indigo-600" : "text-rose-500"}`}>
                {isCapturing ? "Active" : "Disabled"}
              </span>
            </div>
            
            <button
              onClick={() => setIsCapturing(!isCapturing)}
              disabled={apiStatus === "offline"}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-md ${
                isCapturing
                  ? "bg-rose-50/50 border-rose-200 text-rose-600 hover:bg-rose-100/50"
                  : "bg-slate-900 border-slate-800 text-white hover:bg-slate-800 disabled:opacity-50"
              }`}
            >
              {isCapturing ? "Hentikan Kamera" : "Aktifkan Kamera"}
            </button>
          </div>
        </div>

        {/* Kolom 2: Selektor Sensor Klasifikasi & Predictions HUD (3 cols) */}
        <div className="lg:col-span-3 flex flex-col space-y-6">
          
          {/* Saklar Pilihan Mode Klasifikasi */}
          <div className="border border-slate-200 bg-white p-1 rounded-2xl flex space-x-1 floating-shadow-md">
            <button
              onClick={() => handleModeChange("alfabet")}
              className={`flex-1 py-2 px-0.5 rounded-xl font-extrabold text-[11px] transition-all duration-300 flex items-center justify-center space-x-1 border ${
                mode === "alfabet"
                  ? "bg-slate-900 text-white border-slate-800 shadow-md"
                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-50 border-transparent"
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Alfabet</span>
            </button>
            <button
              onClick={() => handleModeChange("angka")}
              className={`flex-1 py-2 px-0.5 rounded-xl font-extrabold text-[11px] transition-all duration-300 flex items-center justify-center space-x-1 border ${
                mode === "angka"
                  ? "bg-slate-900 text-white border-slate-800 shadow-md"
                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-50 border-transparent"
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Angka</span>
            </button>
            <button
              onClick={() => handleModeChange("kata")}
              className={`flex-1 py-2 px-0.5 rounded-xl font-extrabold text-[11px] transition-all duration-300 flex items-center justify-center space-x-1 border ${
                mode === "kata"
                  ? "bg-slate-900 text-white border-slate-800 shadow-md"
                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-50 border-transparent"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Kata</span>
            </button>
          </div>

          {/* Panel Hasil Deteksi Kelas Terjemahan */}
          <MacCardWrapper 
            title="INTERPRETER HUD" 
            className="flex-1 floating-shadow-md"
          >
            <div className="flex flex-col justify-between h-full space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">
                  Classifier Output
                </span>
                {isSequenceActive && (
                  <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-600 px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide">
                    Combining
                  </span>
                )}
              </div>

              {/* Tampilan Output Prediksi Utama */}
              <div className="flex flex-col items-center justify-center py-2">
                <span className={`font-black text-center leading-none tracking-tighter break-all ${
                  displayResult === "-"
                    ? "text-5xl text-slate-200" 
                    : displayResult.length > 1 
                      ? "text-3xl md:text-4xl text-slate-800"
                      : "text-6xl md:text-7xl bg-gradient-to-r from-slate-950 to-indigo-900 bg-clip-text text-transparent"
                }`}>
                  {displayResult}
                </span>
              </div>

              {/* Progress Bar Akurasi Prediksi */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-extrabold tracking-widest uppercase">
                  <span className="text-slate-400">Model Confidence:</span>
                  <span className="text-indigo-600 font-extrabold">{(confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/30 shadow-inner">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-violet-600 h-full rounded-full transition-all duration-500 ease-out shadow-sm"
                    style={{ width: `${confidence * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </MacCardWrapper>
        </div>

        {/* Kolom 3: Panduan visual referensi gerakan tangan (3 cols) */}
        <div className="lg:col-span-3 flex flex-col h-full">
          <MacCardWrapper 
            title="PANDUAN GERAKAN"
            className="floating-shadow-md h-full flex-1"
          >
            <div className="flex flex-col h-full space-y-4 justify-between">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-slate-400">
                  <BookOpen className="w-4 h-4" />
                  <span className="text-[10px] uppercase font-extrabold tracking-widest">
                    Referensi Visual ({mode === "alfabet" ? "Alphabet" : mode === "angka" ? "Numbers" : "Words"})
                  </span>
                </div>

                {/* Area Preview Foto Gerakan */}
                <div className="flex flex-col space-y-3">
                  {selectedGuideLabel ? (
                    <>
                      <div className="w-full aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center relative shadow-sm shrink-0">
                        <img 
                          src={getSampleImagePath(mode, selectedGuideLabel)} 
                          alt={selectedGuideLabel}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-extrabold tracking-widest text-indigo-600 uppercase">
                            Gerakan
                          </span>
                          <span className="text-lg font-black text-slate-800 truncate leading-tight mt-0.5">
                            {selectedGuideLabel}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-semibold max-w-[120px] text-right leading-tight">
                          Tiru gerakan tangan ini.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="w-full aspect-square rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 text-xs shadow-inner">
                      Pilih gerakan di bawah
                    </div>
                  )}
                </div>
              </div>

              {/* Grid tombol selektor pilihan isyarat */}
              <div className="overflow-y-auto max-h-[140px] pr-1 scrollbar-thin">
                <div className={`grid gap-1.5 ${
                  mode === "kata" 
                    ? "grid-cols-2" 
                    : "grid-cols-4"
                }`}>
                  {GUIDE_ITEMS[mode].map((label) => {
                    const isSelected = selectedGuideLabel === label;
                    return (
                      <button
                        key={label}
                        onClick={() => setSelectedGuideLabel(label)}
                        className={`py-1.5 text-center font-bold text-xs rounded-lg border transition-all duration-200 ${
                          isSelected
                            ? "bg-slate-900 border-slate-800 text-white shadow-md"
                            : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </MacCardWrapper>
        </div>

      </div>

      {/* Bagian Bawah: Penampung kata pembangun kalimat (Sentence Builder) */}
      <MacCardWrapper 
        title="SENTENCE BUILDER"
        className="floating-shadow-md"
      >
        <div className="flex flex-col space-y-4">
          <div className="flex items-center space-x-2">
            <Keyboard className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Accumulated Output</h3>
          </div>

          {/* Area Teks Kalimat */}
          <div className="relative">
            <div className="w-full min-h-[90px] p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-md md:text-lg font-bold tracking-wide text-slate-800 break-all flex items-center pr-12 select-text shadow-inner">
              {accumulatedText}
            </div>
            {accumulatedText && (
              <button
                onClick={handleCopyText}
                className="absolute right-3 bottom-3 p-2.5 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-800"
                title="Copy Text"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Baris Tombol Pengontrol Kalimat */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleAddSpace}
              className="px-4 py-2 border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg font-bold text-xs shadow-md transition-all"
            >
              <span>[ SPASI ]</span>
            </button>
            
            <button
              onClick={handleBackspace}
              disabled={!accumulatedText}
              className="px-4 py-2 border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg font-bold text-xs shadow-md transition-all disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5 mr-1.5" />
              <span>Hapus Terakhir</span>
            </button>

            <button
              onClick={handleClearText}
              disabled={!accumulatedText}
              className="px-4 py-2 border border-rose-200 bg-rose-50/50 hover:bg-rose-100/50 text-rose-600 rounded-lg font-bold text-xs shadow-md transition-all ml-auto disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              <span>Hapus Semua</span>
            </button>
          </div>
        </div>
      </MacCardWrapper>
      
      {/* Catatan kaki/Footer */}
      <footer className="text-center text-[9px] text-slate-400/90 leading-relaxed max-w-lg mx-auto py-4 tracking-widest font-extrabold uppercase select-none">
        Project Mockingjay Sign Language -- Computer Vision | Machine Learning
      </footer>
    </div>
  );
}
