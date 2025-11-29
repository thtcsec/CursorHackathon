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
from datetime import datetime

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="AirDraw Vision API")

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

# Initialize Groq client
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("❌ GROQ_API_KEY không được set trong file .env!")

print(f"✅ Groq API Key loaded: {GROQ_API_KEY[:10]}...")
groq_client = Groq(api_key=GROQ_API_KEY)

@app.get("/")
async def root():
    return {"message": "AirDraw Vision API is running", "status": "ok"}

@app.post("/analyze-drawing")
async def analyze_drawing(image: UploadFile = File(...)):
    """
    Analyze a drawing image using Groq's vision model and generate an illustration
    """
    try:
        # Read the uploaded image
        image_data = await image.read()
        
        # Open and convert image
        pil_image = Image.open(BytesIO(image_data))
        
        # Convert to RGB if needed
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        # Convert to base64 for Groq API
        buffered = BytesIO()
        pil_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        # Analyze with Groq using vision model
        # Note: Using llama-3.2-11b-vision-preview (90b deprecated)
        try:
            chat_completion = groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Analyze this drawing and describe the main object in 2-3 words in English. Only respond with the object name, for example: 'sun', 'house', 'tree', 'car', 'flower'. Be concise."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{img_base64}"
                                }
                            }
                        ]
                    }
                ],
                model="llama-3.2-11b-vision-preview",
                temperature=0.3,
                max_tokens=50
            )
            
            # Extract description
            description = chat_completion.choices[0].message.content.strip()
            description = description.lower().strip('."\'')
            
            # Clean up description (remove extra words if any)
            words = description.split()
            if len(words) > 3:
                description = ' '.join(words[:3])
            
        except Exception as e:
            print(f"Groq API error: {e}")
            # Fallback description
            description = "drawing"
        
        # Generate illustrative image using Pollinations API
        encoded_prompt = requests.utils.quote(f"professional illustration of {description}, clean simple style, white background")
        image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&enhance=true"
        
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
    Finish a sketch drawing with AI - autocomplete style
    """
    try:
        # Read the uploaded image
        image_data = await image.read()
        
        # Open and convert image
        pil_image = Image.open(BytesIO(image_data))
        
        # Convert to RGB if needed
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        # Convert to base64 for Groq API
        buffered = BytesIO()
        pil_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        # Analyze with Groq
        try:
            chat_completion = groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Analyze this sketch and describe what the user is trying to draw in 2-3 words. Example: 'sunset landscape', 'cute cat', 'modern car'. Be creative and specific."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{img_base64}"
                                }
                            }
                        ]
                    }
                ],
                model="llama-3.2-11b-vision-preview",
                temperature=0.5,
                max_tokens=30
            )
            
            description = chat_completion.choices[0].message.content.strip()
            description = description.lower().strip('."\'')
            
        except Exception as e:
            print(f"Groq API error: {e}")
            description = "creative artwork"
        
        # Generate finished illustration - more detailed prompt
        encoded_prompt = requests.utils.quote(
            f"high quality professional illustration of {description}, "
            f"fully rendered, detailed artwork, vibrant colors, "
            f"digital art style, clean composition"
        )
        image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&enhance=true"
        
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
    Chat with AI using Groq text model
    """
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful, creative, and friendly AI assistant for an art drawing app. Keep responses concise (2-3 sentences max). Be encouraging and fun!"
                },
                {
                    "role": "user",
                    "content": text
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=150
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
    Analyze screen capture with AI vision
    """
    try:
        # Read the uploaded image
        image_data = await image.read()
        
        # Open and convert image
        pil_image = Image.open(BytesIO(image_data))
        
        # Convert to RGB if needed
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        # Convert to base64 for Groq API
        buffered = BytesIO()
        pil_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        # Analyze with Groq vision
        try:
            chat_completion = groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Describe what you see in this screenshot. What is the user doing? What's on the canvas? Keep it conversational and encouraging (2-3 sentences)."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{img_base64}"
                                }
                            }
                        ]
                    }
                ],
                model="llama-3.2-11b-vision-preview",
                temperature=0.5,
                max_tokens=200
            )
            
            response_text = chat_completion.choices[0].message.content.strip()
            
        except Exception as e:
            print(f"Groq vision error: {e}")
            response_text = "I can see your drawing app! Keep creating awesome art!"
        
        return JSONResponse({
            "status": "success",
            "response": response_text
        })
        
    except Exception as e:
        print(f"Screen analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

