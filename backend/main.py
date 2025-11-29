from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os
import base64
from io import BytesIO
from PIL import Image
import requests
from groq import Groq
import google.generativeai as genai  # ADD GEMINI
from datetime import datetime

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="AirDraw Vision API - HYBRID MODE")

# Create media folder if not exists
MEDIA_FOLDER = os.path.join(os.path.dirname(__file__), "..", "media")
os.makedirs(MEDIA_FOLDER, exist_ok=True)

# Serve media files
app.mount("/media", StaticFiles(directory=MEDIA_FOLDER), name="media")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq client (for text chat)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("❌ GROQ_API_KEY không được set trong file .env!")

print(f"✅ Groq API Key loaded: {GROQ_API_KEY[:10]}...")
groq_client = Groq(api_key=GROQ_API_KEY)

# Initialize Gemini (for VISION - more accurate!)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_vision = genai.GenerativeModel("gemini-2.5-flash")
    print(f"Gemini Vision API loaded: {GEMINI_API_KEY[:10]}...")
    print("🎯 HYBRID MODE: Groq for text, Gemini for vision!")
else:
    gemini_vision = None
    print("⚠️  WARNING: GEMINI_API_KEY not set!")
    print("⚠️  Vision features will NOT work properly!")
    print("⚠️  Get key at: https://aistudio.google.com/app/apikey")

@app.get("/")
async def root():
    return {"message": "AirDraw Vision API is running", "status": "ok"}

@app.post("/analyze-drawing")
async def analyze_drawing(image: UploadFile = File(...)):
    """
    Analyze a drawing image using GEMINI VISION (accurate!)
    """
    try:
        # Read the uploaded image
        image_data = await image.read()
        
        if not gemini_vision:
            return JSONResponse({
                "description": "unknown",
                "image_url": "https://image.pollinations.ai/prompt/abstract%20art?width=512&height=512&nologo=true",
                "status": "error",
                "message": "Gemini API key not configured"
            })
        
        # Use GEMINI for vision (like GPT's code!)
        try:
            result = gemini_vision.generate_content([
                {
                    "mime_type": "image/png",
                    "data": image_data  # RAW BYTES - no base64 needed!
                },
                "Analyze this drawing and describe the main object in 2-3 words in English. Only respond with the object name, for example: 'sun', 'house', 'tree', 'car', 'flower'. Be concise."
            ])
            
            description = result.text.strip().lower().strip('."\'')
            
            # Clean up
            words = description.split()
            if len(words) > 3:
                description = ' '.join(words[:3])
            
        except Exception as e:
            print(f"Gemini API error: {e}")
            description = "drawing"
        
        # Generate illustrative image with cache busting
        import random
        seed = random.randint(1000000, 9999999)
        encoded_prompt = requests.utils.quote(f"professional illustration of {description}, clean simple style, white background")
        image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&enhance=true&seed={seed}"
        
        return JSONResponse({
            "description": description,
            "image_url": image_url,
            "status": "success"
        })
        
    except Exception as e:
        print(f"Error analyzing drawing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/finish-drawing")
async def finish_drawing(image: UploadFile = File(...)):
    """
    Finish a sketch drawing with AI - GEMINI VISION
    """
    try:
        # Read the uploaded image
        image_data = await image.read()
        
        if not gemini_vision:
            return JSONResponse({
                "description": "creative artwork",
                "image_url": "https://image.pollinations.ai/prompt/abstract%20art?width=512&height=512&nologo=true",
                "status": "error"
            })
        
        # Analyze with GEMINI
        try:
            result = gemini_vision.generate_content([
                {
                    "mime_type": "image/png",
                    "data": image_data
                },
                "Analyze this sketch and describe what the user is trying to draw in 2-3 words. Example: 'sunset landscape', 'cute cat', 'modern car'. Be creative and specific."
            ])
            
            description = result.text.strip().lower().strip('."\'')
            
        except Exception as e:
            print(f"Gemini API error: {e}")
            description = "creative artwork"
        
        # Generate finished illustration with cache busting
        import random
        seed = random.randint(1000000, 9999999)
        encoded_prompt = requests.utils.quote(
            f"high quality professional illustration of {description}, "
            f"fully rendered, detailed artwork, vibrant colors, "
            f"digital art style, clean composition"
        )
        image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&enhance=true&seed={seed}"
        
        return JSONResponse({
            "description": description,
            "image_url": image_url,
            "status": "success"
        })
        
    except Exception as e:
        print(f"Error finishing drawing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "groq_api_configured": bool(GROQ_API_KEY)}

@app.post("/ghost-guide")
async def ghost_guide(image: UploadFile = File(...)):
    """
    Generate AI ghost guide overlay - GEMINI VISION
    """
    try:
        # Read the uploaded image
        image_data = await image.read()
        
        if not gemini_vision:
            return JSONResponse({
                "description": "enhanced sketch",
                "image_url": "https://image.pollinations.ai/prompt/line%20art%20sketch?width=512&height=512&nologo=true",
                "status": "error"
            })
        
        # Analyze with GEMINI
        try:
            result = gemini_vision.generate_content([
                {
                    "mime_type": "image/png",
                    "data": image_data
                },
                "What is this sketch trying to be? Reply in 2-3 words max. Examples: 'cute cat', 'sunset scene', 'happy face', 'house'."
            ])
            
            description = result.text.strip().lower().strip('."\'')
            
        except Exception as e:
            print(f"Gemini API error: {e}")
            description = "enhanced sketch"
        
        # Generate enhanced version as ghost guide with cache busting
        import random
        seed = random.randint(1000000, 9999999)
        encoded_prompt = requests.utils.quote(
            f"simple clean line art sketch of {description}, "
            f"black lines on white background, minimal details, "
            f"professional illustration style, clear outlines"
        )
        image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&enhance=true&seed={seed}"
        
        return JSONResponse({
            "description": description,
            "image_url": image_url,
            "status": "success",
            "message": f"Ghost guide ready! Trace over the AI's {description}!"
        })
        
    except Exception as e:
        print(f"Error generating ghost guide: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/save-drawing")
async def save_drawing(image: UploadFile = File(...)):
    """
    Save drawing to media folder
    """
    try:
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"airdraw_{timestamp}.png"
        filepath = os.path.join(MEDIA_FOLDER, filename)
        
        # Save image
        image_data = await image.read()
        with open(filepath, "wb") as f:
            f.write(image_data)
        
        return JSONResponse({
            "status": "success",
            "filename": filename,
            "path": f"/media/{filename}",
            "message": "Drawing saved successfully"
        })
        
    except Exception as e:
        print(f"Error saving drawing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/voice-chat")
async def voice_chat(text: str):
    """
    Chat with AI using Groq text model - Witty and concise!
    """
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a witty, playful AI assistant for a drawing app. Keep responses SHORT (1-2 sentences max). Be funny, sarcastic, and encouraging. Use casual language. NO long explanations!"
                },
                {
                    "role": "user",
                    "content": text
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.9,  # More creative/funny
            max_tokens=50  # Force brevity!
        )
        
        response_text = chat_completion.choices[0].message.content.strip()
        
        return JSONResponse({
            "status": "success",
            "response": response_text
        })
        
    except Exception as e:
        print(f"Voice chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-screen")
async def analyze_screen(image: UploadFile = File(...)):
    """
    Screen analysis - GEMINI VISION (ACCURATE!)
    """
    try:
        # Read image
        image_data = await image.read()
        
        if not gemini_vision:
            return JSONResponse({
                "status": "error",
                "response": "Vision not available. Add GEMINI_API_KEY to .env file!"
            })
        
        # Use GEMINI for accurate analysis
        try:
            result = gemini_vision.generate_content([
                {
                    "mime_type": "image/png",
                    "data": image_data
                },
                "What did the person draw on this canvas? Describe in 1 sentence what you see. Be specific and accurate. Examples: 'I see a heart shape', 'I see a house with a sun', 'I see a smiley face'."
            ])
            
            response_text = result.text.strip()
            
        except Exception as e:
            print(f"Gemini API error: {e}")
            response_text = "I'm having trouble analyzing the drawing right now. Keep creating!"
        
        return JSONResponse({
            "status": "success",
            "response": response_text
        })
        
    except Exception as e:
        print(f"Screen analysis error: {e}")
        return JSONResponse({
            "status": "error",
            "response": "Analysis failed. Make sure Gemini API key is configured!"
        })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

