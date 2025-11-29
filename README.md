# 🎨 AirDraw Vision - Vẽ bằng Cử Chỉ Tay

Ứng dụng vẽ bằng cử chỉ tay kết hợp AI phân tích và nhận diện cảm xúc khuôn mặt.

## ✨ Tính Năng

### 🖐️ 6 Cử Chỉ Tay
- ☝️ **Ngón trỏ thẳng**: Vẽ trên canvas
- ✌️ **Peace (trỏ + giữa)**: Tạm dừng vẽ
- 👍 **Ngón cái lên**: Mở bảng màu và chọn màu
- 🖐️ **Mở bàn tay (giữ 3 giây)**: Xóa canvas
- ✊ **Nắm tay chặt (giữ 2 giây)**: Chuyển Dark Mode
- ✊ **Nắm tay nhẹ**: Idle

### 😊 Nhận Diện Cảm Xúc Khuôn Mặt
- 😊 **Happy**: Khi bạn cười → Tự động hiện emoji reaction trên canvas!
- 😢 **Sad**: Khi bạn buồn/cau mày → Hiện emoji buồn
- 😐 **Neutral**: Bình thường

### 🎨 Hiệu Ứng Vẽ Đặc Biệt
- **Normal**: Vẽ bình thường
- **Rainbow**: Hiệu ứng cầu vồng gradient động
- **Neon**: Hiệu ứng phát sáng neon

### 🤖 AI Features
- **AI Analyze**: Nhận diện vật thể trong bức vẽ (dùng Groq Vision)
- **AI Finish Sketch**: Tự động hoàn thiện bản vẽ thành tác phẩm chuyên nghiệp (MAGIC!)
- **👻 AI Ghost Guide** (NEW!): AI tạo bản vẽ đẹp overlay 40% opacity lên canvas → Bạn vẽ đè theo như tracing! (BEST for Hackathon Demo!)
- Tự động tạo hình minh họa từ Pollinations AI

### 💾 Tiện Ích
- **Save Drawing**: Tải tranh xuống máy dạng PNG + Lưu vào media folder
- **Dark Mode**: Giao diện tối bảo vệ mắt
- **Debug Console**: Log realtime để debug dễ dàng
- **Single Hand Optimized**: Tối ưu cho 1 tay, vẽ mượt mà
- **🎤 Voice Chat with AI**: Nói chuyện với AI bằng giọng nói (Gemini-style)!

## 🚀 Cài Đặt Nhanh

### Bước 1: Cài Backend

```powershell
# Vào thư mục backend
cd backend

# Tạo virtual environment
python -m venv venv

# Kích hoạt venv
.\venv\Scripts\activate

# Cài dependencies
pip install -r requirements.txt
```

### Bước 2: Setup API Keys

**Cần 2 API keys:**

1. **Groq API Key** (cho voice chat):
   - Vào: https://console.groq.com/
   - Đăng ký/Đăng nhập
   - Tạo API Key

2. **Gemini API Key** (cho vision - QUAN TRỌNG!):
   - Vào: https://aistudio.google.com/app/apikey
   - Đăng nhập Google
   - Tạo API Key

3. Tạo file `.env` trong thư mục `backend/`:

```
GROQ_API_KEY=your-groq-api-key-here
GEMINI_API_KEY=your-gemini-api-key-here
```

### Bước 3: Chạy Ứng Dụng

**Terminal 1 - Backend:**
```powershell
cd backend
.\venv\Scripts\activate
uvicorn main:app --reload
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
python -m http.server 3000
```

**Hoặc dùng batch files:**
- Double-click `start_backend.bat` (đặt API key trước!)
- Double-click `start_frontend.bat`

### Bước 4: Mở Trình Duyệt

Truy cập: http://localhost:3000

## 🎮 Hướng Dẫn Sử Dụng

1. Click **"Start Camera"**
2. Cho phép truy cập camera
3. Bắt đầu vẽ bằng cử chỉ:
   - **Ngón trỏ** để vẽ
   - **Ngón cái lên** để đổi màu (bảng màu xuất hiện bên phải)
   - **Mở bàn tay** giữ 3s để xóa
   - **Nắm chặt tay** giữ 2s để toggle Dark Mode
4. Chọn hiệu ứng vẽ: **Normal / Rainbow / Neon**
5. Click **"AI Analyze"** để phân tích tranh
6. Click **"AI Finish Sketch"** để AI hoàn thiện tranh (MAGIC!)
7. Click **"Save Drawing"** để tải về + lưu vào media folder
8. Cười hoặc buồn để xem emoji reaction tự động xuất hiện!
9. Click nút **🎤** (góc dưới phải) để mở Voice Chat với AI!

## 🛠️ Công Nghệ Sử Dụng

- **Frontend**:
  - HTML5 Canvas
  - Vanilla JavaScript
  - MediaPipe Hands (nhận diện tay)
  - MediaPipe Face Mesh (nhận diện khuôn mặt)

- **Backend**:
  - FastAPI (Python)
  - **HYBRID AI System:**
    - **Groq** (`llama-3.3-70b-versatile`): Voice chat (text-only) 🎤
    - **Gemini** (`gemini-2.0-flash-exp`): ALL vision features (AI Analyze, AI Finish, Ghost Guide, Screen Analyze) 👁️
  - Pollinations AI: Image generation
  - ⚠️ **IMPORTANT**: Cần CẢ 2 API keys (Groq + Gemini) để app hoạt động đầy đủ!
  - Pollinations API (tạo hình ảnh)

## 📁 Cấu Trúc Project

```
CursorHackathon/
├── frontend/
│   ├── index.html      # Giao diện
│   ├── style.css       # CSS
│   └── app.js          # Logic xử lý gesture
├── backend/
│   ├── main.py         # API server
│   ├── requirements.txt
│   └── .env            # API key (tự tạo)
├── start_backend.bat   # Script chạy backend
├── start_frontend.bat  # Script chạy frontend
└── README.md
```

## 🐛 Troubleshooting

**Camera không hoạt động:**
- Cho phép quyền truy cập camera
- Dùng Chrome hoặc Edge
- Kiểm tra app khác có đang dùng camera không

**Backend không kết nối:**
- Kiểm tra backend đang chạy: http://localhost:8000/health
- Xem lỗi trong terminal backend
- Đảm bảo GROQ_API_KEY đã được set

**Lỗi Groq API:**
- Kiểm tra API key trong file `.env`
- Xác nhận API key hợp lệ tại console.groq.com
- Kiểm tra quota còn không

**Gesture không nhận:**
- Đảm bảo ánh sáng đủ
- Giữ tay rõ ràng trước camera
- Khoảng cách 30-60cm

## 💡 Tips

1. **Ánh sáng tốt** = nhận diện chính xác hơn
2. **Nền đơn giản** phía sau tay
3. **Cử chỉ rõ ràng** và chậm rãi
4. **Vẽ đơn giản** cho AI nhận diện tốt hơn
5. **Cười tươi** để test emotion detection

## 📝 API Endpoints

### POST /analyze-drawing
Phân tích tranh và tạo hình minh họa

**Request:** Image file (PNG)
**Response:**
```json
{
  "description": "house",
  "image_url": "https://image.pollinations.ai/...",
  "status": "success"
}
```

### POST /finish-drawing
Hoàn thiện sketch thành tác phẩm chuyên nghiệp

**Request:** Image file (PNG)
**Response:**
```json
{
  "description": "creative artwork",
  "image_url": "https://image.pollinations.ai/...",
  "status": "success"
}
```

### GET /health
Kiểm tra trạng thái server

## 🎯 Tính Năng Nổi Bật

### 🔥 Auto-Emoji Reaction
Khi bạn cười hoặc buồn, hệ thống tự động hiện emoji phản ứng trên canvas! Tính năng độc đáo không team nào có.

### 🪄 AI Finish Sketch (MAGIC!)
Vẽ sơ sơ → bấm "AI Finish Sketch" → AI tự động hoàn thiện thành tác phẩm chuyên nghiệp. Giống DALL-E sketch finisher!

### 🌈 Dynamic Trail Effects
- Rainbow: Gradient cầu vồng thay đổi theo thời gian
- Neon: Hiệu ứng phát sáng với shadow blur

### 🌙 Gesture-Controlled Dark Mode
Nắm chặt tay 2 giây → chuyển chế độ tối. Native gesture control!

### 🎤 Voice Chat with AI (NEW!)
- Gemini-style animated orb
- Speech-to-Text → Groq AI → Text-to-Speech (1.6x speed - fast!)
- AI nói chuyện **DÍ DỎM, NGẮN GỌN** (không luyên thuyên!)
- 💬 **AI Encourage**: Creative feedback mode - AI động viên bạn vẽ tiếp! (Text-only, luôn positive!)
- 🎙️ **Voice Commands**: 
  - "start camera" / "camera" → Bật camera
  - "clear" → Xóa canvas
  - "save" → Lưu tranh
  - "**enhance this picture**" → Kích hoạt AI Ghost Guide! 👻
  - "analyze" → Phân tích tranh
  - "Start camera" / "Open camera"
  - "Stop camera" / "Close camera"
  - "Clear canvas" / "Erase everything"
  - "Save drawing"
  - "Analyze" / "What did I draw?"
- UI cực đẹp với hiệu ứng gradient và animations

### 💾 Auto-Save to Media Folder
- Tự động lưu vào thư mục `media/`
- Download về máy đồng thời
- Timestamp filename

---

**Built by Trinh Hoang Tu**
