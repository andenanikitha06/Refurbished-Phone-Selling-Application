// Login page functionality
// login.js

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.querySelector('form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitButton = loginForm.querySelector('button[type="submit"]');

    // Add form validation
    loginForm.addEventListener('submit', function(e) {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username) {
            e.preventDefault();
            showError('Username is required');
            usernameInput.focus();
            return;
        }

        if (!password) {
            e.preventDefault();
            showError('Password is required');
            passwordInput.focus();
            return;
        }

        // Show loading state
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    });

    // Handle Enter key in password field
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });

    // Demo credentials auto-fill
    const demoCredentials = document.querySelector('.demo-credentials');
    if (demoCredentials) {
        demoCredentials.addEventListener('click', function() {
            usernameInput.value = 'admin';
            passwordInput.value = 'password123';
            usernameInput.focus();
        });
    }

    // Input field animations
    [usernameInput, passwordInput].forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.style.transform = 'scale(1.02)';
            this.parentElement.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
        });

        input.addEventListener('blur', function() {
            this.parentElement.style.transform = 'scale(1)';
            this.parentElement.style.boxShadow = 'none';
        });

        input.addEventListener('input', function() {
            clearErrors();
        });
    });

    function showError(message) {
        clearErrors();
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.innerHTML = `
            <span>${message}</span>
            <button class="alert-close" onclick="this.parentElement.remove()">&times;</button>
        `;

        const formHeader = document.querySelector('.form-header');
        formHeader.insertAdjacentElement('afterend', errorDiv);
    }

    function clearErrors() {
        const existingErrors = document.querySelectorAll('.alert-error');
        existingErrors.forEach(error => error.remove());
    }

    // Add subtle animations on page load
    const loginContainer = document.querySelector('.login-form');
    loginContainer.style.opacity = '0';
    loginContainer.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        loginContainer.style.transition = 'all 0.5s ease';
        loginContainer.style.opacity = '1';
        loginContainer.style.transform = 'translateY(0)';
    }, 100);
});