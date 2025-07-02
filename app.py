import os
import base64
from typing import List
import requests
import hashlib
from flask import Flask, jsonify, request, send_from_directory
from dotenv import load_dotenv
from io import BytesIO
from PIL import Image
import numpy as np

load_dotenv()

app = Flask(__name__, static_folder='assets')

# Azure OpenAI settings
ENDPOINT = os.getenv("AZURE_IMAGE_API_ENDPOINT")
API_KEY = os.getenv("AZURE_IMAGE_API_KEY")
MODEL = os.getenv("AZURE_IMAGE_DEPLOYMENT_NAME")
API_VERSION = "2025-04-01-preview"

# Cache for storing generated masks
mask_cache = {}
CACHE_DIR = "cache"

def ensure_cache_dir():
    """Ensure cache directory exists"""
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)

def get_image_hash(image_bytes):
    """Generate MD5 hash of image bytes"""
    return hashlib.md5(image_bytes).hexdigest()

def get_cached_mask(image_hash):
    """Retrieve cached mask if it exists"""
    cache_file = os.path.join(CACHE_DIR, f"mask_{image_hash}.png")
    if os.path.exists(cache_file):
        with open(cache_file, 'rb') as f:
            return f.read()
    return None

def save_mask_to_cache(image_hash, mask_bytes):
    """Save mask to cache"""
    ensure_cache_dir()
    cache_file = os.path.join(CACHE_DIR, f"mask_{image_hash}.png")
    with open(cache_file, 'wb') as f:
        f.write(mask_bytes)

def resize_image_to_match(image_bytes, target_size=(1024, 1024)):
    """Resize image to target size while maintaining aspect ratio"""
    image = Image.open(BytesIO(image_bytes)).convert('RGBA')
    
    # Resize to target size
    image = image.resize(target_size, Image.Resampling.LANCZOS)
    
    # Convert back to bytes
    buffer = BytesIO()
    image.save(buffer, format='PNG')
    return buffer.getvalue()

def call_azure_image_api(
    prompt,
    image_data=None,
    mask_data=None,
    design_image_data=None,
    size="1024x1024"
):
    """Call Azure OpenAI Image API for generation and edits"""
    # Resize all inputs
    if image_data:
        image_data = resize_image_to_match(image_data)
    if mask_data:
        mask_data = resize_image_to_match(mask_data)
    if design_image_data:
        # allow a single blob or list of blobs
        if isinstance(design_image_data, list):
            design_blobs = [resize_image_to_match(d) for d in design_image_data]
        else:
            design_blobs = [resize_image_to_match(design_image_data)]
    else:
        design_blobs = []

    # if no files then use generation endpoint
    if not (image_data or mask_data or design_blobs):
        url = f"{ENDPOINT}/images/generations?api-version={API_VERSION}"
        headers = {"api-key": API_KEY, "Content-Type": "application/json"}
        payload = {
            "prompt": prompt,
            "model": MODEL,
            "size": size,
            "quality": "high",
            "output_format": "png"
        }
        response = requests.post(url, headers=headers, json=payload)
    else:
        # edits endpoint with multipart form
        url = f"{ENDPOINT}/images/edits?api-version={API_VERSION}"
        headers = {"api-key": API_KEY}
        data = {
            "prompt": prompt,
            "model": MODEL,
            "size": size,
            "quality": "high",
            "output_format": "png"
        }
        files = []
        # device image and reference images under image[]
        if image_data:
            files.append(("image[]", ("device.png", image_data, "image/png")))
        for idx, blob in enumerate(design_blobs):
            files.append(("image[]", (f"design{idx}.png", blob, "image/png")))
        # mask separately
        if mask_data:
            files.append(("mask", ("mask.png", mask_data, "image/png")))

        response = requests.post(url, headers=headers, data=data, files=files)

    response.raise_for_status()
    return response.json()



def image_to_b64(image_bytes):
    return base64.b64encode(image_bytes).decode('utf-8')

def b64_to_image_bytes(b64_string):
    return base64.b64decode(b64_string)

def create_mask_from_text_description(image_bytes, description):
    """Generate mask using GPT-Image-1 text description"""
    # Use GPT-Image-1 to generate a mask based on text description
    mask_prompt = f"Generate a mask image where {description}. Use white for areas to be edited and black for areas to preserve. Return a black and white mask image with the same dimensions as the input."
    
    # Call Azure API to generate mask
    mask_result = call_azure_image_api(mask_prompt, image_data=image_bytes)
    mask_image_b64 = mask_result["data"][0]["b64_json"]
    mask_image_bytes = b64_to_image_bytes(mask_image_b64)
    
    # Convert to proper RGBA mask format
    mask_image = Image.open(BytesIO(mask_image_bytes)).convert('L')  # Load as grayscale
    
    # Create RGBA version with proper alpha channel
    mask_rgba = Image.new('RGBA', mask_image.size, (0, 0, 0, 255))  # Start with black background
    
    # Convert mask: white areas become transparent (editable), black areas stay opaque (preserve)
    mask_array = np.array(mask_image)
    alpha_array = np.where(mask_array > 128, 0, 255)  # White becomes transparent, black stays opaque
    
    mask_data = np.array(mask_rgba)
    mask_data[:, :, 3] = alpha_array  # Set alpha channel
    
    final_mask = Image.fromarray(mask_data, 'RGBA')
    
    # Convert to bytes
    buffer = BytesIO()
    final_mask.save(buffer, format='PNG')
    return buffer.getvalue()

@app.route('/')
def index():
    return send_from_directory('ui', 'index.html')

@app.route('/ui/<path:path>')
def send_ui_file(path):
    return send_from_directory('ui', path)

@app.route('/assets/<path:path>')
def send_asset(path):
    return send_from_directory('assets', path)

@app.route('/api/models', methods=['GET'])
def get_models():
    models = [
        { "id": "iphone-15", "name": "iPhone 15 Pro", "image": None },
        { "id": "samsung-s24", "name": "Samsung S24", "image": None },
        { "id": "pixel-8", "name": "Pixel 8 Pro", "image": None },
        { "id": "surface-pro", "name": "Surface Pro", "image": "/assets/surface-pro.png" },
        { "id": "surface-duo", "name": "Surface Duo", "image": "/assets/surface-duo.png" }
    ]
    return jsonify(models)

@app.route('/api/generate-mask', methods=['POST'])
def generate_mask():
    """Step 1: Generate mask from device image using text description"""
    try:
        device_image_file = request.files.get('deviceImage')
        if not device_image_file:
            return jsonify({"error": "Missing device image"}), 400

        device_image_bytes = device_image_file.read()
        
        # Resize to standard size first
        device_image_bytes = resize_image_to_match(device_image_bytes, (1024, 1024))
        
        image_hash = get_image_hash(device_image_bytes)
        
        print(f"Processing image with hash: {image_hash}")
        
        # Check if mask is already cached
        cached_mask = get_cached_mask(image_hash)
        if cached_mask:
            print(f"Using cached mask for hash: {image_hash}")
            mask_b64 = image_to_b64(cached_mask)
            return jsonify({
                "mask_b64": mask_b64,
                "cached": True
            })
        
        print(f"Generating new mask for hash: {image_hash}")
        
        # Generate mask using text description for device skin areas
        mask_description = "all surfaces where a decorative skin cover would typically be applied on this device (phone, tablet, laptop, watch etc.), excluding screens, cameras, buttons, ports, and logos"
        
        mask_bytes = create_mask_from_text_description(device_image_bytes, mask_description)
        
        # Save mask to cache
        save_mask_to_cache(image_hash, mask_bytes)
        print(f"Cached mask for hash: {image_hash}")
        
        mask_b64 = image_to_b64(mask_bytes)
        
        return jsonify({
            "mask_b64": mask_b64,
            "cached": False
        })

    except requests.HTTPError as e:
        print(f"Azure API error: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")
        return jsonify({"error": "Mask generation failed", "details": str(e)}), 500
    except Exception as e:
        print(f"Mask generation error: {e}")
        return jsonify({"error": "Mask generation failed", "details": str(e)}), 500

@app.route('/api/generate', methods=['POST'])
def generate_skin():
    """Step 2: Apply design using mask and design image"""
    try:
        device_file = request.files.get('deviceImage')
        design_file = request.files.get('designImage')
        mask_b64 = request.form.get('maskB64')
        text_prompt = request.form.get('textPrompt', '')

        if not device_file:
            return jsonify({"error": "Missing device image"}), 400
        if not design_file:
            return jsonify({"error": "Missing design image"}), 400
        if not mask_b64:
            return jsonify({"error": "Missing mask data"}), 400

        device_bytes = device_file.read()
        design_bytes = design_file.read()
        mask_bytes = b64_to_image_bytes(mask_b64)

        device_bytes = resize_image_to_match(device_bytes)
        design_bytes = resize_image_to_match(design_bytes)
        mask_bytes = resize_image_to_match(mask_bytes)

        final_prompt = (
            f"Transform this device by applying a decorative skin design as provided design image. "
            f"{text_prompt} Create a professional skin that enhances appearance while preserving function."
        )

        result = call_azure_image_api(
            final_prompt,
            image_data=device_bytes,
            mask_data=mask_bytes,
            design_image_data=design_bytes
        )
        image_b64 = result["data"][0]["b64_json"]
        return jsonify({"image_b64": image_b64})

    except requests.HTTPError as e:
        if hasattr(e, 'response'):
            return jsonify({"error": "Azure API call failed", "details": e.response.text}), 500
        return jsonify({"error": "Azure API call failed", "details": str(e)}), 500
    except Exception as e:
        return jsonify({"error": "Skin generation failed", "details": str(e)}), 500

@app.route('/api/cache/stats', methods=['GET'])
def get_cache_stats():
    """Get cache statistics"""
    try:
        ensure_cache_dir()
        cache_files = [f for f in os.listdir(CACHE_DIR) if f.startswith('mask_') and f.endswith('.png')]
        total_size = sum(os.path.getsize(os.path.join(CACHE_DIR, f)) for f in cache_files)
        
        return jsonify({
            "total_masks": len(cache_files),
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "cache_dir": CACHE_DIR
        })
    except Exception as e:
        return jsonify({"error": "Failed to get cache stats", "details": str(e)}), 500

@app.route('/api/cache/clear', methods=['DELETE'])
def clear_cache():
    """Clear mask cache"""
    try:
        ensure_cache_dir()
        cache_files = [f for f in os.listdir(CACHE_DIR) if f.startswith('mask_') and f.endswith('.png')]
        
        for cache_file in cache_files:
            os.remove(os.path.join(CACHE_DIR, cache_file))
        
        return jsonify({
            "cleared": len(cache_files),
            "message": f"Cleared {len(cache_files)} cached masks"
        })
    except Exception as e:
        return jsonify({"error": "Failed to clear cache", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
        
