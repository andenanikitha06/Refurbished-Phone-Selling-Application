// Main JavaScript file for shared functionality
// main.js

// Utility functions
const Utils = {
    // API request wrapper
    async apiRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, mergedOptions);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    },

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="alert-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        
        const container = document.querySelector('.container');
        container.insertBefore(notification, container.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    },

    // Format currency
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    },

    // Format date
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Calculate platform price
    calculatePlatformPrice(basePrice, platform) {
        const platforms = {
            'X': { fee: 0.10, type: 'percentage' },
            'Y': { fee: 0.08, fixed: 2.0, type: 'percentage_plus_fixed' },
            'Z': { fee: 0.12, type: 'percentage' }
        };

        const config = platforms[platform];
        if (!config) return basePrice;

        if (config.type === 'percentage') {
            return basePrice + (basePrice * config.fee);
        } else if (config.type === 'percentage_plus_fixed') {
            return basePrice + (basePrice * config.fee) + config.fixed;
        }
        
        return basePrice;
    },

    // Validate form data
    validatePhoneData(data) {
        const errors = [];
        
        if (!data.model_name || data.model_name.trim() === '') {
            errors.push('Model name is required');
        }
        
        if (!data.brand || data.brand.trim() === '') {
            errors.push('Brand is required');
        }
        
        if (!data.condition || data.condition.trim() === '') {
            errors.push('Condition is required');
        }
        
        if (!data.base_price || isNaN(data.base_price) || parseFloat(data.base_price) <= 0) {
            errors.push('Valid base price is required');
        }
        
        if (data.stock_quantity && (isNaN(data.stock_quantity) || parseInt(data.stock_quantity) < 0)) {
            errors.push('Stock quantity must be a positive number');
        }
        
        return errors;
    },

    // Loading state management
    setLoading(element, loading = true) {
        if (loading) {
            element.disabled = true;
            const spinner = element.querySelector('.fa-spinner');
            const text = element.querySelector('span');
            
            if (spinner) spinner.style.display = 'inline-block';
            if (text) text.style.display = 'none';
        } else {
            element.disabled = false;
            const spinner = element.querySelector('.fa-spinner');
            const text = element.querySelector('span');
            
            if (spinner) spinner.style.display = 'none';
            if (text) text.style.display = 'inline-block';
        }
    }
};

// Modal management
class ModalManager {
    static show(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    static hide(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    }

    static hideAll() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = 'auto';
    }
}

// Event listeners for common elements
document.addEventListener('DOMContentLoaded', function() {
    // Close modals when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            ModalManager.hideAll();
        }
    });

    // Handle ESC key for modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ModalManager.hideAll();
        }
    });

    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.style.opacity = '0';
                setTimeout(() => alert.remove(), 300);
            }
        }, 5000);
    });
});

// Global error handler
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    Utils.showNotification('An unexpected error occurred', 'error');
});

// Export for use in other files
window.Utils = Utils;
window.ModalManager = ModalManager;