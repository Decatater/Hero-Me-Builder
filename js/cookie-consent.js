// Cookie Consent Banner
// Simple, non-intrusive consent management for Google Analytics

(function() {
    'use strict';

    // Check if user has already made a choice
    const consentGiven = localStorage.getItem('cookie_consent');

    if (consentGiven === 'accepted') {
        // User already accepted, load Analytics immediately
        return; // Analytics already loaded in page
    } else if (consentGiven === 'declined') {
        // User declined, don't load Analytics
        disableAnalytics();
        return;
    }

    // Show consent banner if no choice has been made
    showConsentBanner();

    function showConsentBanner() {
        // Create banner element
        const banner = document.createElement('div');
        banner.id = 'cookie-consent-banner';
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(44, 62, 80, 0.95);
            color: white;
            padding: 15px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            z-index: 100000;
            border-radius: 8px;
            max-width: 320px;
            font-family: Arial, sans-serif;
            font-size: 13px;
            line-height: 1.5;
        `;

        // Banner content
        const message = document.createElement('div');
        message.style.cssText = 'margin-bottom: 12px;';
        message.innerHTML = `
            We use cookies to analyze user engagement and improve the builder. Your data will never be used to serve ads on this site.
            <a href="https://policies.google.com/privacy" target="_blank" style="color: #3498db; text-decoration: underline;">Google's Privacy Policy</a>
        `;

        // Button container
        const buttons = document.createElement('div');
        buttons.style.cssText = 'display: flex; gap: 8px;';

        // Accept button
        const acceptBtn = document.createElement('button');
        acceptBtn.textContent = 'Accept';
        acceptBtn.style.cssText = `
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.3s;
            flex: 1;
        `;
        acceptBtn.onmouseover = () => acceptBtn.style.background = '#2980b9';
        acceptBtn.onmouseout = () => acceptBtn.style.background = '#3498db';
        acceptBtn.onclick = () => handleConsent(true);

        // Decline button
        const declineBtn = document.createElement('button');
        declineBtn.textContent = 'Decline';
        declineBtn.style.cssText = `
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.3s;
            flex: 1;
        `;
        declineBtn.onmouseover = () => declineBtn.style.background = '#2980b9';
        declineBtn.onmouseout = () => declineBtn.style.background = '#3498db';
        declineBtn.onclick = () => handleConsent(false);

        // Assemble banner
        buttons.appendChild(acceptBtn);
        buttons.appendChild(declineBtn);
        banner.appendChild(message);
        banner.appendChild(buttons);

        // Add to page
        document.body.appendChild(banner);
    }

    function handleConsent(accepted) {
        // Store user's choice
        localStorage.setItem('cookie_consent', accepted ? 'accepted' : 'declined');

        // Remove banner with animation
        const banner = document.getElementById('cookie-consent-banner');
        if (banner) {
            banner.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
            banner.style.transform = 'translateX(-120%)';
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        }

        if (accepted) {
            // User accepted - Analytics already loaded in page, just let it run
            console.log('Cookie consent accepted');
        } else {
            // User declined - disable Analytics
            disableAnalytics();
            console.log('Cookie consent declined');
        }
    }

    function disableAnalytics() {
        // Disable Google Analytics
        window['ga-disable-G-CNLT432CYL'] = true;

        // Remove gtag if it exists
        if (typeof gtag !== 'undefined') {
            // Clear any existing data
            gtag('consent', 'update', {
                'analytics_storage': 'denied'
            });
        }
    }

    // Mobile responsive adjustments
    if (window.innerWidth < 600) {
        const style = document.createElement('style');
        style.textContent = `
            #cookie-consent-banner {
                left: 10px !important;
                right: 10px !important;
                top: 10px !important;
                max-width: calc(100% - 20px) !important;
            }
        `;
        document.head.appendChild(style);
    }
})();
