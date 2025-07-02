/* filepath: /Users/aymen/skin-designer/mock/script.js */
let currentStep = 1;
let selectedDevice = null;
let selectedDesign = null;
let uploadedDesignFile = null;
let uploadedDeviceFile = null;
let generatedMask = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupDeviceSelection();
    setupDesignSelection();
    setupFileUploads();
    setupDragAndDrop();
    setupCollapsible();
    animateOnScroll();
    
    // Load cache stats
    setTimeout(() => {
        getCacheStats();
    }, 1000);
});

// Navigation
function nextStep() {
    if (currentStep < 3) {
        // Validate current step
        if (currentStep === 1 && !selectedDevice) return;
        if (currentStep === 2 && !selectedDesign && !uploadedDesignFile) return;
        
        // Hide current step
        document.querySelector(`#step-${currentStep}`).classList.remove('active');
        document.querySelector(`[data-step="${currentStep}"]`).classList.remove('active');
        
        // Show next step
        currentStep++;
        document.querySelector(`#step-${currentStep}`).classList.add('active');
        document.querySelector(`[data-step="${currentStep}"]`).classList.add('active');
        
        // Generate preview if moving to step 3
        if (currentStep === 3) {
            generatePreview();
        }
        
        // Smooth scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function previousStep() {
    if (currentStep > 1) {
        // Hide current step
        document.querySelector(`#step-${currentStep}`).classList.remove('active');
        document.querySelector(`[data-step="${currentStep}"]`).classList.remove('active');
        
        // Show previous step
        currentStep--;
        document.querySelector(`#step-${currentStep}`).classList.add('active');
        document.querySelector(`[data-step="${currentStep}"]`).classList.add('active');
        
        // Smooth scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function startOver() {
    // Reset all selections
    selectedDevice = null;
    selectedDesign = null;
    uploadedDesignFile = null;
    uploadedDeviceFile = null;
    generatedMask = null; // Reset the mask as well
    
    // Reset UI
    document.querySelectorAll('.device-card').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('.gallery-item').forEach(item => item.classList.remove('selected'));
    document.querySelector('.text-input').value = '';
    document.getElementById('device-upload').value = '';
    document.getElementById('design-upload').value = '';
    document.querySelector('.upload-card .device-name').textContent = 'Upload Device';
    document.querySelector('.upload-text').textContent = 'Drop your image here or';
    
    // Go back to step 1
    document.querySelector(`#step-${currentStep}`).classList.remove('active');
    document.querySelector(`[data-step="${currentStep}"]`).classList.remove('active');
    currentStep = 1;
    document.querySelector(`#step-1`).classList.add('active');
    document.querySelector(`[data-step="1"]`).classList.add('active');
    
    // Disable continue buttons
    document.querySelectorAll('.btn-primary').forEach(btn => btn.disabled = true);
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Device Selection
async function setupDeviceSelection() {
    const deviceGrid = document.querySelector('.device-grid');
    const uploadCard = document.querySelector('.upload-card');
    const continueBtn = document.querySelector('#step-1 .btn-primary');

    try {
        const response = await fetch('/api/models');
        const models = await response.json();

        models.forEach(model => {
            if (model.image) { // Only add models with images, assuming others are built-in SVGs
                const card = document.createElement('div');
                card.className = 'device-card';
                card.dataset.device = model.id;
                card.innerHTML = `
                    <div class="device-preview">
                        <img src="${model.image}" alt="${model.name}" class="device-svg">
                    </div>
                    <h3 class="device-name">${model.name}</h3>
                `;
                deviceGrid.insertBefore(card, uploadCard);
            }
        });
    } catch (error) {
        console.error('Failed to load device models:', error);
    }
    
    const deviceCards = document.querySelectorAll('.device-card[data-device]');
    
    deviceCards.forEach(card => {
        card.addEventListener('click', () => {
            deviceCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedDevice = card.dataset.device;
            uploadedDeviceFile = null;
            continueBtn.disabled = false;
            card.style.animation = 'pulse 0.5s ease';
            setTimeout(() => card.style.animation = '', 500);
        });
    });
}

// Design Selection
function setupDesignSelection() {
    const galleryItems = document.querySelectorAll('.gallery-item');
    const continueBtn = document.querySelector('#step-2 .btn-primary');
    
    galleryItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove previous selection
            galleryItems.forEach(i => i.classList.remove('selected'));
            
            // Add selection
            item.classList.add('selected');
            selectedDesign = item.dataset.image;
            uploadedDesignFile = null; // Clear uploaded file
            
            // Enable continue button
            continueBtn.disabled = false;
            
            // Add animation
            item.style.animation = 'pulse 0.5s ease';
            setTimeout(() => item.style.animation = '', 500);
        });
    });
}

// File Uploads
function setupFileUploads() {
    // Device upload
    const deviceUploadInput = document.getElementById('device-upload');
    deviceUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            uploadedDeviceFile = file;
            // Show selected state
            const uploadCard = deviceUploadInput.closest('.device-card');
            document.querySelectorAll('.device-card').forEach(c => c.classList.remove('selected'));
            uploadCard.classList.add('selected');
            selectedDevice = 'custom';
            
            // Enable continue button
            document.querySelector('#step-1 .btn-primary').disabled = false;
            
            // Show file name
            uploadCard.querySelector('.device-name').textContent = file.name;
        }
    });
    
    // Design upload
    const designUploadInput = document.getElementById('design-upload');
    designUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            uploadedDesignFile = file;
            selectedDesign = null; // Clear gallery selection
            
            // Clear gallery selections
            document.querySelectorAll('.gallery-item').forEach(i => i.classList.remove('selected'));
            
            // Enable continue button
            document.querySelector('#step-2 .btn-primary').disabled = false;
            
            // Update upload area text
            document.querySelector('.upload-text').textContent = file.name;
            
            // Add success animation
            const uploadArea = document.getElementById('design-upload-area');
            uploadArea.style.borderColor = 'var(--accent-primary)';
            uploadArea.style.background = 'rgba(124, 58, 237, 0.1)';
        }
    });
}

// Drag and Drop
function setupDragAndDrop() {
    const uploadArea = document.getElementById('design-upload-area');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('dragover');
        }, false);
    });
    
    uploadArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            // Trigger file input change
            const fileInput = document.getElementById('design-upload');
            fileInput.files = files;
            fileInput.dispatchEvent(new Event('change'));
        }
    });
}

// Collapsible section
function setupCollapsible() {
    const toggle = document.querySelector('.section-title-toggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const content = document.querySelector('.collapsible-content');
            const icon = document.querySelector('.toggle-icon');
            content.classList.toggle('open');
            icon.classList.toggle('open');
        });
    }
}

// Generate Preview - Updated for caching
async function generatePreview() {
    const skinPreview = document.getElementById('skin-preview');
    const textInput = document.querySelector('.text-input').value;

    // Show loading state
    skinPreview.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);"><div style="margin-bottom: 1rem;">🎨</div><div>Generating your skin...</div><div style="font-size: 0.8rem; margin-top: 0.5rem;">Step 1: Creating mask...</div></div>';
    skinPreview.style.backgroundImage = 'none';

    try {
        // 1. Get Device Image
        let deviceImageFile = await getDeviceImageFile();
        if (!deviceImageFile) {
            throw new Error("Could not get device image");
        }

        // 2. Get Design Image  
        let designImageFile = await getDesignImageFile();
        if (!designImageFile) {
            throw new Error("Could not get design image");
        }

        // Step 1: Generate mask (only if we don't have one)
        if (!generatedMask) {
            skinPreview.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);"><div style="margin-bottom: 1rem;">🎨</div><div>Generating your skin...</div><div style="font-size: 0.8rem; margin-top: 0.5rem;">Step 1: Creating mask...</div></div>';
            
            const maskFormData = new FormData();
            maskFormData.append('deviceImage', deviceImageFile);
            
            const maskResponse = await fetch('/api/generate-mask', {
                method: 'POST',
                body: maskFormData
            });

            if (!maskResponse.ok) {
                const error = await maskResponse.json();
                throw new Error(error.details || 'Mask generation failed');
            }

            const maskResult = await maskResponse.json();
            generatedMask = maskResult.mask_b64;
            
            // Show cache status
            if (maskResult.cached) {
                console.log('✅ Used cached mask');
                skinPreview.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);"><div style="margin-bottom: 1rem;">⚡</div><div>Generating your skin...</div><div style="font-size: 0.8rem; margin-top: 0.5rem;">Step 1: Using cached mask ✅</div></div>';
            } else {
                console.log('🆕 Generated new mask');
            }
        }

        // Step 2: Apply design
        skinPreview.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);"><div style="margin-bottom: 1rem;">✨</div><div>Generating your skin...</div><div style="font-size: 0.8rem; margin-top: 0.5rem;">Step 2: Applying design...</div></div>';
        
        const finalFormData = new FormData();
        finalFormData.append('deviceImage', deviceImageFile);
        finalFormData.append('designImage', designImageFile);
        finalFormData.append('maskB64', generatedMask);
        finalFormData.append('textPrompt', textInput);

        console.log('Sending final request with mask:', generatedMask ? 'present' : 'missing');

        const finalResponse = await fetch('/api/generate', {
            method: 'POST',
            body: finalFormData
        });

        if (!finalResponse.ok) {
            const error = await finalResponse.json();
            console.error('Final generation error:', error);
            throw new Error(error.details || 'Skin generation failed');
        }

        const result = await finalResponse.json();
        
        // Show result with animation
        skinPreview.innerHTML = '';
        skinPreview.style.backgroundImage = `url(data:image/png;base64,${result.image_b64})`;
        skinPreview.style.backgroundSize = 'cover';
        skinPreview.style.backgroundPosition = 'center';
        skinPreview.style.opacity = '0';
        
        setTimeout(() => {
            skinPreview.style.transition = 'opacity 1s ease';
            skinPreview.style.opacity = '1';
        }, 100);

    } catch (error) {
        console.error('Error generating preview:', error);
        skinPreview.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); text-align: center;"><div style="margin-bottom: 1rem;">❌</div><div>Generation failed</div><div style="font-size: 0.8rem; margin-top: 0.5rem; max-width: 200px;">${error.message}</div></div>`;
    }
}

async function getDeviceImageFile() {
    if (uploadedDeviceFile) {
        return uploadedDeviceFile;
    } else if (selectedDevice) {
        const deviceCard = document.querySelector(`.device-card[data-device="${selectedDevice}"]`);
        if (deviceCard) {
            const imgElement = deviceCard.querySelector('.device-svg');
            if (imgElement && imgElement.src) {
                const response = await fetch(imgElement.src);
                const blob = await response.blob();
                return new File([blob], `${selectedDevice}.png`, { type: blob.type });
            }
        }
    }
    return null;
}

async function getDesignImageFile() {
    if (uploadedDesignFile) {
        return uploadedDesignFile;
    } else if (selectedDesign) {
        // Convert gradient to image
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        
        // Create gradient based on selection
        const gradients = {
            'abstract-1': ['#667eea', '#764ba2'],
            'abstract-2': ['#f093fb', '#f5576c'],
            'abstract-3': ['#4facfe', '#00f2fe'],
            'abstract-4': ['#fa709a', '#fee140']
        };
        
        const colors = gradients[selectedDesign] || ['#667eea', '#764ba2'];
        const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[1]);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1024, 1024);
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        return new File([blob], `${selectedDesign}.png`, { type: 'image/png' });
    }
    return null;
}

// Animate on scroll
function animateOnScroll() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'slideIn 0.5s ease forwards';
            }
        });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.device-card, .gallery-item, .action-btn').forEach(el => {
        observer.observe(el);
    });
}

// Add cache management functions
async function getCacheStats() {
    try {
        const response = await fetch('/api/cache/stats');
        const stats = await response.json();
        console.log('Cache stats:', stats);
        return stats;
    } catch (error) {
        console.error('Failed to get cache stats:', error);
    }
}

async function clearCache() {
    try {
        const response = await fetch('/api/cache/clear', { method: 'DELETE' });
        const result = await response.json();
        console.log('Cache cleared:', result);
        return result;
    } catch (error) {
        console.error('Failed to clear cache:', error);
    }
}

// Progress navigation clicks
document.querySelectorAll('.progress-step').forEach(step => {
    step.addEventListener('click', () => {
        const stepNum = parseInt(step.dataset.step);
        if (stepNum < currentStep || (stepNum === 2 && selectedDevice) || (stepNum === 3 && (selectedDesign || uploadedDesignFile))) {
            // Navigate to clicked step
            document.querySelector(`#step-${currentStep}`).classList.remove('active');
            document.querySelector(`[data-step="${currentStep}"]`).classList.remove('active');
            
            currentStep = stepNum;
            document.querySelector(`#step-${currentStep}`).classList.add('active');
            document.querySelector(`[data-step="${currentStep}"]`).classList.add('active');
            
            if (currentStep === 3) {
                generatePreview();
            }
        }
    });
});

// Action buttons functionality
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const action = this.querySelector('span').textContent;
        
        switch(action) {
            case 'Download':
                downloadSkin();
                break;
            case 'Save for Later':
                alert('Save functionality would be implemented here');
                break;
            case 'Regenerate':
                regenerateSkin();
                break;
        }
    });
});

function downloadSkin() {
    const skinPreview = document.getElementById('skin-preview');
    const backgroundImage = skinPreview.style.backgroundImage;
    
    if (backgroundImage && backgroundImage.includes('data:image')) {
        // Extract base64 data
        const base64Data = backgroundImage.match(/data:image\/[^;]+;base64,([^"']+)/);
        if (base64Data) {
            const link = document.createElement('a');
            link.href = backgroundImage.match(/url\(["']?([^"']+)["']?\)/)[1];
            link.download = 'custom-skin.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

function regenerateSkin() {
    // Clear the generated mask to force regeneration
    generatedMask = null;
    
    // Add rotation animation
    const btn = event.currentTarget;
    const icon = btn.querySelector('svg');
    if (icon) {
        icon.style.animation = 'spin 1s ease';
        setTimeout(() => icon.style.animation = '', 1000);
    }
    
    // Regenerate preview
    generatePreview();
}

// Add spin animation
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);