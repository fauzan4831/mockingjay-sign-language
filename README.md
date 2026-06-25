# Mockingjay Sign Language 🤟

**Mockingjay Sign Language** adalah aplikasi web berbasis *Computer Vision* yang dirancang untuk menerjemahkan bahasa isyarat (alfabet, angka, dan kata-kata tertentu) secara real-time. Aplikasi ini memanfaatkan **Next.js** untuk antarmuka pengguna (frontend) dan **Flask** (backend) untuk pemrosesan citra menggunakan **MediaPipe** dan **TensorFlow/Keras**.

---

## 📸 Antarmuka & Demonstrasi

Aplikasi ini menggunakan kamera (webcam) pengguna untuk menangkap gerakan tangan, mengekstrak landmark koordinat sendi tangan, kemudian memprediksi maknanya menggunakan model deep learning yang telah dilatih.

---

## 📊 Dataset yang Digunakan

Aplikasi ini dilatih menggunakan tiga kumpulan dataset berikut:

1. **Kata (Indonesian Sign Language - BISINDO)**
   * **Dataset**: [Kaggle - Dataset Sample Kata BISINDO](https://www.kaggle.com/datasets/mockingjayproject123/dataset-sample-kata-bisindo) oleh *Mockingjay Project*
   * **Deskripsi**: Berisi sampel gestur bahasa isyarat untuk kata sehari-hari dalam BISINDO, meliputi kata: `Bantu`, `Berjuang`, `Boleh`, `Sama-Sama`, `Selamat`, dan `Sukses`.

2. **Angka (Sign Language for Numbers)**
   * **Dataset**: [Kaggle - Sign Language for Numbers](https://www.kaggle.com/datasets/muhammadkhalid/sign-language-for-numbers/data) oleh *Muhammad Khalid*
   * **Deskripsi**: Berisi kumpulan data gestur tangan yang merepresentasikan angka `0` sampai `9`.

3. **Alfabet (ASL Alphabet)**
   * **Dataset**: [Kaggle - ASL Alphabet](https://www.kaggle.com/datasets/grassknoted/asl-alphabet) oleh *Grassknoted*
   * **Deskripsi**: Berisi gambar-gambar alfabet bahasa isyarat tangan dari huruf `A` hingga `Z`.

---

## ⚙️ Arsitektur & Teknologi

* **Frontend**: Next.js 15+, React, TailwindCSS, TypeScript, Lucide React, React Webcam.
* **Backend**: Flask, Flask-CORS.
* **Computer Vision**:
  * **MediaPipe Hands**: Digunakan untuk melacak tangan (*hand tracking*) dan mengekstrak 21 landmark koordinat 3D (x, y, z) secara real-time.
  * **TensorFlow / Keras**: Digunakan untuk memuat model `.h5` dan melakukan klasifikasi kelas berdasarkan data landmark koordinat tangan yang diekstrak.

---

## 📁 Struktur Direktori

```text
Website/
├── backend/
│   ├── app.py                  # Server Flask & logika inferensi model
│   └── requirements.txt        # Dependensi Python backend
├── frontend/
│   ├── src/                    # Source code Next.js (pages & components)
│   ├── package.json            # Dependensi Node.js frontend
│   └── next.config.ts          # Konfigurasi Next.js
├── models/
│   ├── alfabet/                # Model H5 dan daftar label alfabet
│   ├── angka/                  # Model H5 dan daftar label angka
│   └── kata/                   # Model H5 dan daftar label kosakata
├── Sample/                     # Gambar sampel pengujian
└── README.md                   # Dokumentasi proyek
```

---

## 🚀 Cara Menjalankan Proyek

### Prasyarat (Prerequisites)
Pastikan Anda sudah menginstal:
* Python 3.10 atau versi di atasnya
* Node.js v18 atau versi di atasnya
* Git

---

### 1. Setup & Menjalankan Backend (Flask)

1. Masuk ke direktori `backend`:
   ```bash
   cd backend
   ```

2. Buat Virtual Environment (Opsional tetapi direkomendasikan):
   ```bash
   python -m venv venv
   ```

3. Aktifkan Virtual Environment:
   * **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   * **Windows (CMD)**:
     ```cmd
     .\venv\Scripts\activate.bat
     ```
   * **macOS / Linux**:
     ```bash
     source venv/bin/activate
     ```

4. Instal dependensi library yang dibutuhkan:
   ```bash
   pip install -r requirements.txt
   ```

5. Jalankan server Flask:
   ```bash
   python app.py
   ```
   Server backend akan aktif di `http://127.0.0.1:5000`.

---

### 2. Setup & Menjalankan Frontend (Next.js)

1. Buka terminal baru dan masuk ke direktori `frontend`:
   ```bash
   cd frontend
   ```

2. Instal dependensi modul Node.js:
   ```bash
   npm install
   ```

3. Jalankan aplikasi frontend dalam mode development:
   ```bash
   npm run dev
   ```
   Buka browser Anda dan akses aplikasi di **`http://localhost:3000`**.

---

## 🤝 Kontribusi
Proyek ini dibuat untuk pemenuhan tugas Praktikum Computer Vision semester 6 oleh tim Mockingjay. Jika Anda ingin memberikan kontribusi atau saran perbaikan, silakan lakukan fork pada repositori ini dan ajukan Pull Request.
