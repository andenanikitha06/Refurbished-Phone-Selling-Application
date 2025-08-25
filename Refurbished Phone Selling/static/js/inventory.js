// static/js/inventory.js - Fixed version

let phones = [];   // cache phone list
let editingPhoneId = null;

// ========== UI HELPERS ==========
function toggleBulkUpload() {
    const section = document.getElementById("bulk-upload-section");
    section.style.display = section.style.display === "none" ? "block" : "none";
}

function openAddModal(phone = null) {
    const modal = document.getElementById("phone-modal");
    modal.style.display = "block";

    if (phone) {
        // Editing
        editingPhoneId = phone.id;
        document.getElementById("modal-title").innerText = "Edit Phone";
        document.getElementById("submit-text").innerText = "Update Phone";

        document.getElementById("phone-id").value = phone.id;
        document.getElementById("model-name").value = phone.model_name;
        document.getElementById("brand").value = phone.brand;
        document.getElementById("condition").value = phone.condition;
        document.getElementById("storage").value = phone.storage || "";
        document.getElementById("color").value = phone.color || "";
        document.getElementById("stock-quantity").value = phone.stock_quantity;
        document.getElementById("base-price").value = phone.base_price;
        document.getElementById("specifications").value = phone.specifications || "";
        document.getElementById("tags").value = phone.tags || "";
    } else {
        // Adding new
        editingPhoneId = null;
        document.getElementById("modal-title").innerText = "Add New Phone";
        document.getElementById("submit-text").innerText = "Add Phone";
        document.getElementById("phone-form").reset();
    }
}

function closeModal() {
    document.getElementById("phone-modal").style.display = "none";
}

function closeListModal() {
    document.getElementById("list-modal").style.display = "none";
}

// ========== BULK UPLOAD ==========
async function uploadBulkFile() {
    const fileInput = document.getElementById("bulk-file");
    
    if (!fileInput.files.length) {
        alert("Please select a CSV file.");
        return;
    }

    const file = fileInput.files[0];
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert("Please select a CSV file.");
        return;
    }

    // Show loading state
    const uploadBtn = document.querySelector('button[onclick="uploadBulkFile()"]');
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    const formData = new FormData();
    formData.append("file", file);

    try {
        console.log("Starting bulk upload...");
        
        const response = await fetch("/api/bulk-upload", {
            method: "POST",
            body: formData
        });

        console.log("Response status:", response.status);
        
        const data = await response.json();
        console.log("Response data:", data);

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        // Success
        if (data.success) {
            alert(`✅ ${data.message}`);
            
            if (data.errors && data.errors.length > 0) {
                console.warn("Upload warnings/errors:", data.errors);
                const errorMsg = data.errors.slice(0, 5).join('\n');
                if (confirm(`Some rows had issues:\n${errorMsg}\n\nView more details in console?`)) {
                    console.log("All errors:", data.errors);
                }
            }
            
            // Refresh the phones list and close upload section
            await loadPhones();
            toggleBulkUpload();
            
            // Clear the file input
            fileInput.value = '';
        } else {
            throw new Error(data.error || "Upload failed");
        }

    } catch (error) {
        console.error("Bulk upload failed:", error);
        
        let errorMessage = "Bulk upload failed: ";
        if (error.message.includes("Failed to parse")) {
            errorMessage += "Invalid CSV format. Please check your file encoding and structure.";
        } else if (error.message.includes("Missing required columns")) {
            errorMessage += error.message;
        } else {
            errorMessage += error.message;
        }
        
        alert(errorMessage);
    } finally {
        // Reset button state
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
}

// Add file validation when file is selected
document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("bulk-file");
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const placeholder = document.querySelector(".upload-placeholder p");
                placeholder.textContent = `Selected: ${file.name}`;
                
                // Show file info
                const fileInfo = document.createElement("div");
                fileInfo.className = "file-info";
                fileInfo.innerHTML = `
                    <small>Size: ${(file.size / 1024).toFixed(1)} KB</small>
                `;
                
                // Remove existing file info
                const existing = document.querySelector(".file-info");
                if (existing) existing.remove();
                
                placeholder.parentNode.appendChild(fileInfo);
            }
        });
    }
});

// ========== PHONE CRUD ==========
async function loadPhones() {
    const loadingEl = document.getElementById("loading");
    const emptyEl = document.getElementById("empty-state");
    
    if (loadingEl) loadingEl.style.display = "block";
    
    try {
        console.log("Loading phones...");
        const response = await fetch("/api/phones");
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        phones = await response.json();
        console.log("Loaded phones:", phones.length);
        renderPhones(phones);
        
    } catch (error) {
        console.error("Error loading phones:", error);
        if (emptyEl) {
            emptyEl.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error loading phones</h3>
                <p>${error.message}</p>
            `;
            emptyEl.style.display = "block";
        }
    } finally {
        if (loadingEl) loadingEl.style.display = "none";
    }
}

function renderPhones(list) {
    const tbody = document.getElementById("phones-tbody");
    const empty = document.getElementById("empty-state");

    if (!tbody) return;

    tbody.innerHTML = "";

    if (!list || list.length === 0) {
        if (empty) {
            empty.innerHTML = `
                <i class="fas fa-box-open"></i>
                <h3>No phones found</h3>
                <p>Add some phones to get started or adjust your search filters.</p>
            `;
            empty.style.display = "block";
        }
        return;
    }
    
    if (empty) empty.style.display = "none";

    list.forEach(phone => {
        const tr = document.createElement("tr");
        
        // Build platform status
        let platformStatus = "—";
        if (phone.platforms && Object.keys(phone.platforms).length > 0) {
            const listed = Object.entries(phone.platforms)
                .filter(([platform, isListed]) => isListed)
                .map(([platform]) => platform);
            
            if (listed.length > 0) {
                platformStatus = `Listed on: ${listed.join(', ')}`;
            } else {
                platformStatus = "Not listed";
            }
        }
        
        tr.innerHTML = `
            <td>${escapeHtml(phone.model_name)}</td>
            <td>${escapeHtml(phone.brand)}</td>
            <td>${escapeHtml(phone.condition)}</td>
            <td>${escapeHtml(phone.storage || "—")}</td>
            <td>${phone.stock_quantity}</td>
            <td>$${parseFloat(phone.base_price).toFixed(2)}</td>
            <td>${platformStatus}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick='openAddModal(${JSON.stringify(phone).replace(/'/g, "&apos;")})'>Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deletePhone(${phone.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function deletePhone(id) {
    if (!confirm("Are you sure you want to delete this phone?")) return;
    
    try {
        const response = await fetch(`/api/phones/${id}`, { method: "DELETE" });
        
        if (response.ok) {
            await loadPhones();
        } else {
            const error = await response.json();
            alert("Failed to delete phone: " + (error.error || "Unknown error"));
        }
    } catch (error) {
        console.error("Delete failed:", error);
        alert("Failed to delete phone: " + error.message);
    }
}

// Handle Add/Edit Phone form submit
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("phone-form");
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const submitBtn = document.querySelector('#phone-form button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            const payload = {
                model_name: document.getElementById("model-name").value.trim(),
                brand: document.getElementById("brand").value.trim(),
                condition: document.getElementById("condition").value,
                storage: document.getElementById("storage").value.trim(),
                color: document.getElementById("color").value.trim(),
                stock_quantity: parseInt(document.getElementById("stock-quantity").value, 10) || 0,
                base_price: parseFloat(document.getElementById("base-price").value) || 0,
                specifications: document.getElementById("specifications").value.trim(),
                tags: document.getElementById("tags").value.trim(),
            };

            try {
                let response;
                if (editingPhoneId) {
                    response = await fetch(`/api/phones/${editingPhoneId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await fetch("/api/phones", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                }

                if (response.ok) {
                    await loadPhones();
                    closeModal();
                } else {
                    const error = await response.json();
                    alert("Error: " + (error.error || "Failed to save phone"));
                }
            } catch (error) {
                console.error("Save failed:", error);
                alert("Failed to save phone: " + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }
});

// ========== SEARCH & FILTER ==========
document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = phones.filter(phone =>
                phone.model_name.toLowerCase().includes(query) ||
                phone.brand.toLowerCase().includes(query)
            );
            renderPhones(filtered);
        });
    }
});

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", () => {
    loadPhones();
});