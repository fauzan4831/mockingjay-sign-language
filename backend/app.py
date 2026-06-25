import os
import base64
import cv2
import numpy as np
import tensorflow as tf
import mediapipe as mp
from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path

# Menyembunyikan logging bawaan C++ dari TensorFlow agar output konsol tetap bersih
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# Mengaktifkan alokasi memori dinamis (memory growth) untuk GPU jika tersedia
# guna mencegah TensorFlow memesan seluruh VRAM sekaligus
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    except RuntimeError as e:
        print(f"Error pada memory growth GPU: {e}")

# Resolusi struktur direktori workspace:
# BACKEND_DIR = .../Website/backend
# WORKSPACE_DIR = .../Website
BACKEND_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = BACKEND_DIR.parent

# Tentukan kandidat path file model alfabet dan file daftar kelas labelnya
ALPHABET_MODEL_PATHS = [
    WORKSPACE_DIR / "models" / "alfabet" / "sibi_model.h5",
    WORKSPACE_DIR / "models" / "alfabet" / "sibi_classifier_best.h5",
    WORKSPACE_DIR / "models" / "alfabet" / "sibi_classifier.h5"
]
ALPHABET_LABELS_PATH = WORKSPACE_DIR / "models" / "alfabet" / "class_names.txt"

# Tentukan path file model angka dan file daftar kelas labelnya
NUMBER_MODEL_PATH = WORKSPACE_DIR / "models" / "angka" / "landmark_number_classifier.h5"
NUMBER_LABELS_PATH = WORKSPACE_DIR / "models" / "angka" / "class_names.txt"

# Tentukan path file model kosakata (kata) dan file daftar kelas labelnya
KATA_MODEL_PATH = WORKSPACE_DIR / "models" / "kata" / "landmark_model_kata3.h5"
KATA_LABELS_PATH = WORKSPACE_DIR / "models" / "kata" / "class_names.txt"

# Inisialisasi aplikasi Flask
app = Flask(__name__)
# Aktifkan CORS agar backend dapat menerima request dari frontend Next.js (port 3000)
CORS(app)

print("[INFO] Sedang memuat model TensorFlow...")

# Cari file model alfabet yang pertama kali ditemukan dari daftar kandidat
alphabet_model_path = None
for path in ALPHABET_MODEL_PATHS:
    if path.exists():
        alphabet_model_path = path
        break

# Pemuatan model Alfabet menggunakan Keras
try:
    if alphabet_model_path:
        model_alphabet = tf.keras.models.load_model(str(alphabet_model_path), compile=False)
        print(f"[INFO] Model Alfabet Berhasil Dimuat: {alphabet_model_path.name}")
    else:
        print(f"[ERROR] File Model Alfabet tidak ditemukan di: {ALPHABET_MODEL_PATHS}")
        model_alphabet = None
except Exception as e:
    print(f"[ERROR] Gagal memuat Model Alfabet: {e}")
    model_alphabet = None

# Pemuatan model Angka menggunakan Keras
try:
    if NUMBER_MODEL_PATH.exists():
        model_number = tf.keras.models.load_model(str(NUMBER_MODEL_PATH), compile=False)
        print(f"[INFO] Model Angka Berhasil Dimuat: {NUMBER_MODEL_PATH.name}")
    else:
        print(f"[ERROR] File Model Angka tidak ditemukan di {NUMBER_MODEL_PATH}")
        model_number = None
except Exception as e:
    print(f"[ERROR] Gagal memuat Model Angka: {e}")
    model_number = None

# Pemuatan model Kosakata (Kata) menggunakan Keras
try:
    if KATA_MODEL_PATH.exists():
        model_kata = tf.keras.models.load_model(str(KATA_MODEL_PATH), compile=False)
        print(f"[INFO] Model Kosakata Berhasil Dimuat: {KATA_MODEL_PATH.name}")
    else:
        print(f"[ERROR] File Model Kosakata tidak ditemukan di {KATA_MODEL_PATH}")
        model_kata = None
except Exception as e:
    print(f"[ERROR] Gagal memuat Model Kosakata: {e}")
    model_kata = None

def load_flat_labels(path, default_labels):
    """Membaca file teks daftar label kelas, menggunakan default jika file tidak ditemukan."""
    if not os.path.exists(path):
        return default_labels
    try:
        with open(path, "r", encoding="utf-8") as f:
            # Membaca baris yang tidak kosong dan mengambil nama label kelasnya
            return [line.strip().split(maxsplit=1)[-1] for line in f if line.strip()]
    except Exception as e:
        print(f"Error saat membaca label dari {path}: {e}")
        return default_labels

# Memuat label kelas untuk ketiga mode, dengan fallback default jika file txt hilang
labels_alphabet = load_flat_labels(str(ALPHABET_LABELS_PATH), list("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
labels_number = load_flat_labels(str(NUMBER_LABELS_PATH), [str(i) for i in range(10)])
labels_kata = load_flat_labels(str(KATA_LABELS_PATH), ["Bantu", "Berjuang", "Boleh", "Sama-Sama", "Selamat", "Sukses"])

print(f"[INFO] Label Alfabet ({len(labels_alphabet)}): {labels_alphabet[:5]}...")
print(f"[INFO] Label Angka ({len(labels_number)}): {labels_number}")
print(f"[INFO] Label Kosakata ({len(labels_kata)}): {labels_kata}")

# Inisialisasi modul deteksi tangan MediaPipe Hands
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

def decode_base64_image(base64_str):
    """Mendekode string gambar base64 dari frontend menjadi matriks citra OpenCV BGR."""
    if ',' in base64_str:
        base64_str = base64_str.split(',')[1]
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img

def extract_sibi_alfabet_features(hand_landmarks):
    landmarks = hand_landmarks.landmark
    base_x, base_y, base_z = landmarks[0].x, landmarks[0].y, landmarks[0].z
    
    temp_coords = []
    for lm in landmarks:
        temp_coords.extend([lm.x - base_x, lm.y - base_y, lm.z - base_z])
    
    # Normalisasi skala L-infinity
    max_val = max(abs(val) for val in temp_coords)
    if max_val > 0:
        temp_coords = [val / max_val for val in temp_coords]
        
    return np.expand_dims(np.array(temp_coords, dtype=np.float32), axis=0)  # Output shape: (1, 63)

def extract_number_features(hand_landmarks):
    pts = np.array(
        [[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark],
        dtype=np.float32,
    )
    wrist = pts[0].copy()
    pts -= wrist  # Translasi koordinat agar wrist menjadi pusat
    scale = np.max(np.linalg.norm(pts[:, :2], axis=1))
    if scale > 1e-6:
        pts /= scale  # Normalisasi skala
    return np.expand_dims(pts.flatten(), axis=0)  # Output shape: (1, 63)

def is_crossed_fingers(hand_landmarks, frame_shape):
    h, w = frame_shape[:2]
    pts = [
        (int(lm.x * w), int(lm.y * h))
        for lm in hand_landmarks.landmark
    ]
    index_mcp = pts[5]
    index_tip = pts[8]
    middle_mcp = pts[9]
    middle_tip = pts[12]

    tip_distance = np.linalg.norm(np.array(index_tip) - np.array(middle_tip))
    mcp_distance = np.linalg.norm(np.array(index_mcp) - np.array(middle_mcp))
    close_tips = tip_distance < max(35.0, mcp_distance * 1.35)
    
    # Fungsi pembantu CCW (Counter-Clockwise) untuk mendeteksi persilangan segmen garis
    def ccw(p1, p2, p3):
        return (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0])
    
    crossed_lines = (ccw(index_mcp, middle_mcp, middle_tip) != ccw(index_tip, middle_mcp, middle_tip)) and \
                    (ccw(index_mcp, index_tip, middle_mcp) != ccw(index_mcp, index_tip, middle_tip))
                    
    return close_tips and crossed_lines

def detect_clear_gesture(results, frame):
    if not results or not results.multi_hand_landmarks:
        return False
        
    # Kasus 1: Silang pergelangan tangan (terdeteksi dua tangan)
    if len(results.multi_hand_landmarks) == 2:
        wrist1 = results.multi_hand_landmarks[0].landmark[0]
        wrist2 = results.multi_hand_landmarks[1].landmark[0]
        
        hand1_label = results.multi_handedness[0].classification[0].label
        hand2_label = results.multi_handedness[1].classification[0].label
        
        # Periksa apakah letak pergelangan tangan kiri berada di kanan tangan kanan (bersilangan)
        if hand1_label == 'Left' and hand2_label == 'Right' and wrist1.x < wrist2.x:
            return True
        if hand1_label == 'Right' and hand2_label == 'Left' and wrist2.x < wrist1.x:
            return True
            
        # Periksa tumpang tindih pergelangan tangan yang sangat dekat
        if abs(wrist1.x - wrist2.x) < 0.08 and abs(wrist1.y - wrist2.y) < 0.1:
            return True

    # Kasus 2: Silang jari telunjuk & tengah (terdeteksi satu tangan)
    for hand_landmarks in results.multi_hand_landmarks:
        if is_crossed_fingers(hand_landmarks, frame.shape):
            return True
            
    return False

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        if not data or 'image' not in data or 'mode' not in data:
            return jsonify({"error": "Parameter 'image' atau 'mode' tidak lengkap"}), 400

        base64_img = data['image']
        mode = data['mode']

        # Cek validitas mode
        if mode not in ['alfabet', 'angka', 'kata'] and mode != 'test_connection':
            return jsonify({"error": f"Mode salah: '{mode}'. Harus berupa 'alfabet', 'angka', or 'kata'.", "clear_gesture": False}), 400

        # Cek koneksi kesehatan (health check) dari frontend
        if mode == 'test_connection' or not base64_img:
            return jsonify({"status": "healthy", "landmarks": [], "clear_gesture": False}), 200

        # Dekode gambar base64
        frame = decode_base64_image(base64_img)
        if frame is None:
            return jsonify({"error": "Gagal mendekode gambar base64", "clear_gesture": False}), 400

        # Membalik gambar secara horizontal agar sesuai dengan tampilan cermin webcam
        frame = cv2.flip(frame, 1)

        # Proses ekstraksi koordinat dengan MediaPipe Hands
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)

        # Cek apakah pengguna menampilkan gerakan isyarat penghapus layar (dinonaktifkan sesuai request)
        clear_gesture = False

        # Deteksi dan prediksi untuk semua tangan yang terdeteksi, pilih dengan akurasi tertinggi
        best_prediction = "No Hand Detected"
        best_confidence = 0.0
        landmarks_to_return = []

        if results.multi_hand_landmarks:
            for hand_lms in results.multi_hand_landmarks:
                if mode == 'alfabet':
                    if model_alphabet is None:
                        continue
                    features = extract_sibi_alfabet_features(hand_lms)
                    prediction = model_alphabet.predict(features, verbose=0)[0]
                    idx = int(np.argmax(prediction))
                    conf = float(prediction[idx])
                    label = labels_alphabet[idx]
                elif mode == 'angka':
                    if model_number is None:
                        continue
                    features = extract_number_features(hand_lms)
                    prediction = model_number.predict(features, verbose=0)[0]
                    idx = int(np.argmax(prediction))
                    conf = float(prediction[idx])
                    label = labels_number[idx]
                elif mode == 'kata':
                    if model_kata is None:
                        continue
                    features = extract_number_features(hand_lms)
                    prediction = model_kata.predict(features, verbose=0)[0]
                    idx = int(np.argmax(prediction))
                    conf = float(prediction[idx])
                    label = labels_kata[idx]
                else:
                    continue

                if conf > best_confidence:
                    best_confidence = conf
                    best_prediction = label
                    landmarks_to_return = [{"x": float(lm.x), "y": float(lm.y), "z": float(lm.z)} for lm in hand_lms.landmark]

        # Validasi ketersediaan model jika mode terpilih aktif
        if mode == 'alfabet' and model_alphabet is None:
            return jsonify({"error": "Model alfabet tidak berhasil dimuat", "landmarks": [], "clear_gesture": clear_gesture}), 500
        elif mode == 'angka' and model_number is None:
            return jsonify({"error": "Model angka tidak berhasil dimuat", "landmarks": [], "clear_gesture": clear_gesture}), 500
        elif mode == 'kata' and model_kata is None:
            return jsonify({"error": "Model kosakata tidak berhasil dimuat", "landmarks": [], "clear_gesture": clear_gesture}), 500

        return jsonify({
            "prediction": best_prediction,
            "confidence": best_confidence,
            "landmarks": landmarks_to_return,
            "clear_gesture": clear_gesture
        })

    except Exception as e:
        print(f"[ERROR] Exception saat memproses prediksi: {e}")
        return jsonify({"error": str(e), "landmarks": [], "clear_gesture": False}), 500

if __name__ == '__main__':
    print("[INFO] Memulai Server Flask pada http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)
