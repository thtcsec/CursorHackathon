from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os
import base64
from io import BytesIO
from PIL import Image
import requests
from groq import Groq

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="AirDraw Vision API")

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
        # Note: Groq supports vision through llama-3.2-90b-vision-preview
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
                model="llama-3.2-90b-vision-preview",
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

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "groq_api_configured": bool(GROQ_API_KEY)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

