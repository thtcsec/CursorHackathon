# 🎨 AirDraw Vision - Vẽ bằng Cử Chỉ Tay

Ứng dụng vẽ bằng cử chỉ tay kết hợp AI phân tích và nhận diện cảm xúc khuôn mặt.

## ✨ Tính Năng

### 🖐️ 5 Cử Chỉ Tay
- ☝️ **Ngón trỏ thẳng**: Vẽ trên canvas
- ✌️ **Peace (trỏ + giữa)**: Tạm dừng vẽ
- 👍 **Ngón cái lên**: Mở bảng màu và chọn màu
- 🖐️ **Mở bàn tay (giữ 3 giây)**: Xóa canvas
- ✊ **Nắm tay**: Không làm gì (idle)

### 😊 Nhận Diện Cảm Xúc Khuôn Mặt
- 😊 **Happy**: Khi bạn cười
- 😢 **Sad**: Khi bạn buồn/cau mày
- 😐 **Neutral**: Bình thường

### 🤖 AI Phân Tích Tranh
- Nhận diện vật thể trong bức vẽ (dùng Groq Vision)
- Tự động tạo hình minh họa chuyên nghiệp

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

### Bước 2: Setup Groq API Key

1. Lấy API key tại: https://console.groq.com/
2. Tạo file `.env` trong thư mục `backend/`:

```
GROQ_API_KEY=your-groq-api-key-here
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

1. Click **"📹 Start Camera"**
2. Cho phép truy cập camera
3. Bắt đầu vẽ bằng cử chỉ:
   - **Ngón trỏ** để vẽ
   - **Ngón cái lên** để đổi màu (bảng màu xuất hiện bên phải)
   - **Mở bàn tay** giữ 3s để xóa
4. Click **"🤖 AI Analyze"** để phân tích tranh
5. Xem cảm xúc khuôn mặt được nhận diện realtime

## 🛠️ Công Nghệ Sử Dụng

- **Frontend**:
  - HTML5 Canvas
  - Vanilla JavaScript
  - MediaPipe Hands (nhận diện tay)
  - MediaPipe Face Mesh (nhận diện khuôn mặt)

- **Backend**:
  - FastAPI (Python)
  - Groq API (AI Vision - llama-3.2-90b-vision-preview)
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
5. **Cười tươi** để test emotion detection 😊

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

### GET /health
Kiểm tra trạng thái server

## 🎯 Tính Năng Tương Lai

- [ ] Điều chỉnh size cọ bằng gesture
- [ ] Lưu tranh xuống máy
- [ ] Nhiều màu sắc hơn
- [ ] Undo/Redo
- [ ] Share tranh online

---

**Made for Cursor Hackathon 🚀**
** Built by Trịnh Hoàng Tú **

**Chúc bạn vẽ vui vẻ! 🎨✨**
